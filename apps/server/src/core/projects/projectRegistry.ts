import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { isProjectMode, type ProjectRegistryEntry, type ProjectRegistryMetadataUpdate, type ProjectRegistryStore } from './projectTypes';

export class ProjectRegistryDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectRegistryDataError';
  }
}

export function resolveProjectRegistryPath(baseDir = homedir()) {
  return path.join(baseDir, '.novel-flow-webui', 'projects.json');
}

export function defaultProjectRegistryStore(): ProjectRegistryStore {
  return {
    activeProjectId: null,
    projects: [],
  };
}

export async function readProjectRegistry(baseDir = homedir()): Promise<ProjectRegistryStore | null> {
  const filePath = resolveProjectRegistryPath(baseDir);
  let content: string;

  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw new ProjectRegistryDataError(`Failed to read project registry at ${filePath}.`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new ProjectRegistryDataError(`Project registry at ${filePath} contains malformed JSON.`);
  }

  return normalizeProjectRegistryStore(parsed);
}

export async function writeProjectRegistry(baseDir: string, store: ProjectRegistryStore) {
  const filePath = resolveProjectRegistryPath(baseDir);
  await writeJsonAtomically(filePath, JSON.stringify(normalizeProjectRegistryStore(store), null, 2));
}

export async function upsertProjectRegistryEntry(baseDir: string, entry: ProjectRegistryEntry) {
  const store = await loadProjectRegistryStore(baseDir);
  const normalizedEntry = normalizeProjectRegistryEntry(entry);
  const existingIndex = store.projects.findIndex((project) => project.rootPath === normalizedEntry.rootPath);
  const existingIdMatch = store.projects.find((project) => project.id === normalizedEntry.id);

  if (existingIdMatch && existingIdMatch.rootPath !== normalizedEntry.rootPath) {
    throw new ProjectRegistryDataError(`Project id "${normalizedEntry.id}" is already registered for another path.`);
  }

  if (existingIndex === -1) {
    const nextStore = {
      ...store,
      projects: [...store.projects, normalizedEntry],
    } satisfies ProjectRegistryStore;

    await writeProjectRegistry(baseDir, nextStore);
    return nextStore;
  }

  const previousEntry = store.projects[existingIndex];

  if (previousEntry.id !== normalizedEntry.id) {
    throw new ProjectRegistryDataError(`Project rootPath "${normalizedEntry.rootPath}" is already registered to a different id.`);
  }

  const nextProjects = [...store.projects];
  nextProjects[existingIndex] = normalizedEntry;

  const nextStore = {
    ...store,
    activeProjectId: store.activeProjectId === previousEntry.id ? normalizedEntry.id : store.activeProjectId,
    projects: nextProjects,
  } satisfies ProjectRegistryStore;

  await writeProjectRegistry(baseDir, nextStore);
  return nextStore;
}

export async function setActiveProject(baseDir: string, projectId: string | null) {
  const store = await loadProjectRegistryStore(baseDir);

  if (projectId !== null && !store.projects.some((project) => project.id === projectId)) {
    return store;
  }

  const nextStore = {
    ...store,
    activeProjectId: projectId,
  } satisfies ProjectRegistryStore;

  await writeProjectRegistry(baseDir, nextStore);
  return nextStore;
}

export async function archiveProject(baseDir: string, projectId: string) {
  return updateProjectRegistryStore(baseDir, (store) => ({
    ...store,
    activeProjectId: store.activeProjectId === projectId ? null : store.activeProjectId,
    projects: store.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      return {
        ...project,
        archived: true,
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
}

export async function removeProject(baseDir: string, projectId: string) {
  return updateProjectRegistryStore(baseDir, (store) => ({
    activeProjectId: store.activeProjectId === projectId ? null : store.activeProjectId,
    projects: store.projects.filter((project) => project.id !== projectId),
  }));
}

export async function updateProjectMetadata(
  baseDir: string,
  projectId: string,
  updates: ProjectRegistryMetadataUpdate,
) {
  return updateProjectRegistryStore(baseDir, (store) => ({
    ...store,
    projects: store.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      return {
        ...project,
        ...updates,
        updatedAt: updates.updatedAt ?? new Date().toISOString(),
      };
    }),
  }));
}

export function normalizeProjectRootPath(rootPath: string) {
  const trimmedRootPath = rootPath.trim();

  if (!trimmedRootPath) {
    throw new ProjectRegistryDataError('Project rootPath must be a non-empty string.');
  }

  return path.resolve(trimmedRootPath);
}

async function loadProjectRegistryStore(baseDir: string) {
  return (await readProjectRegistry(baseDir)) ?? defaultProjectRegistryStore();
}

async function updateProjectRegistryStore(
  baseDir: string,
  updater: (store: ProjectRegistryStore) => ProjectRegistryStore,
) {
  const nextStore = normalizeProjectRegistryStore(updater(await loadProjectRegistryStore(baseDir)));
  await writeProjectRegistry(baseDir, nextStore);
  return nextStore;
}

function normalizeProjectRegistryStore(store: unknown): ProjectRegistryStore {
  const rawStore = expectRecord(store, 'project registry');
  const activeProjectId = parseNullableNonEmptyString(rawStore.activeProjectId, 'project registry.activeProjectId');
  const rawProjects = expectArray(rawStore.projects, 'project registry.projects');
  const projects = rawProjects.map((entry, index) => normalizeProjectRegistryEntry(entry as ProjectRegistryEntry, `project registry.projects[${index}]`));
  const projectIds = new Set<string>();
  const projectRootPaths = new Set<string>();

  for (const project of projects) {
    if (projectIds.has(project.id)) {
      throw new ProjectRegistryDataError(`Duplicate project id "${project.id}" found in registry.`);
    }

    if (projectRootPaths.has(project.rootPath)) {
      throw new ProjectRegistryDataError(`Duplicate project rootPath "${project.rootPath}" found in registry.`);
    }

    projectIds.add(project.id);
    projectRootPaths.add(project.rootPath);
  }

  if (activeProjectId !== null && !projectIds.has(activeProjectId)) {
    throw new ProjectRegistryDataError(`Registry activeProjectId "${activeProjectId}" does not match any project.`);
  }

  return {
    activeProjectId,
    projects,
  };
}

function normalizeProjectRegistryEntry(entry: ProjectRegistryEntry, label = 'project registry entry'): ProjectRegistryEntry {
  const rawEntry = expectRecord(entry, label);

  return {
    id: parseNonEmptyString(rawEntry.id, `${label}.id`),
    displayName: parseNonEmptyString(rawEntry.displayName, `${label}.displayName`),
    rootPath: normalizeProjectRootPath(parseNonEmptyString(rawEntry.rootPath, `${label}.rootPath`)),
    createdAt: parseIsoTimestamp(rawEntry.createdAt, `${label}.createdAt`),
    updatedAt: parseIsoTimestamp(rawEntry.updatedAt, `${label}.updatedAt`),
    lastOpenedAt: parseNullableIsoTimestamp(rawEntry.lastOpenedAt, `${label}.lastOpenedAt`),
    favorite: parseBoolean(rawEntry.favorite, `${label}.favorite`),
    archived: parseBoolean(rawEntry.archived, `${label}.archived`),
    missing: parseBoolean(rawEntry.missing, `${label}.missing`),
    lastMode: parseNullableProjectMode(rawEntry.lastMode, `${label}.lastMode`),
    lastOpenedDocument: parseNullableNonEmptyString(rawEntry.lastOpenedDocument, `${label}.lastOpenedDocument`),
    lastKnownStepId: parseNullableNonEmptyString(rawEntry.lastKnownStepId, `${label}.lastKnownStepId`),
    lastKnownSubstepId: parseNullableNonEmptyString(rawEntry.lastKnownSubstepId, `${label}.lastKnownSubstepId`),
    lastKnownChapterNumber: parseNullablePositiveInteger(rawEntry.lastKnownChapterNumber, `${label}.lastKnownChapterNumber`),
  };
}

async function writeJsonAtomically(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );

  try {
    await writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function expectRecord(value: unknown, label: string) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProjectRegistryDataError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProjectRegistryDataError(`${label} must be an array.`);
  }

  return value;
}

function parseNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProjectRegistryDataError(`${label} must be a non-empty string.`);
  }

  return value;
}

function parseNullableNonEmptyString(value: unknown, label: string) {
  if (value === null) {
    return null;
  }

  return parseNonEmptyString(value, label);
}

function parseBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') {
    throw new ProjectRegistryDataError(`${label} must be a boolean.`);
  }

  return value;
}

function parseIsoTimestamp(value: unknown, label: string) {
  const timestamp = parseNonEmptyString(value, label);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new ProjectRegistryDataError(`${label} must be a valid timestamp string.`);
  }

  return timestamp;
}

function parseNullableIsoTimestamp(value: unknown, label: string) {
  if (value === null) {
    return null;
  }

  return parseIsoTimestamp(value, label);
}

function parseNullableProjectMode(value: unknown, label: string) {
  if (value === null) {
    return null;
  }

  if (!isProjectMode(value)) {
    throw new ProjectRegistryDataError(`${label} must be "create", "reference", or null.`);
  }

  return value;
}

function parseNullablePositiveInteger(value: unknown, label: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ProjectRegistryDataError(`${label} must be a positive integer or null.`);
  }

  return value;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
