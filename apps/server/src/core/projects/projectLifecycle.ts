import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { initProject } from '../files/initProject';
import { readProjectManifest, writeProjectManifest } from './projectManifest';
import {
  defaultProjectRegistryStore,
  normalizeProjectRootPath,
  readProjectRegistry,
  setActiveProject,
  updateProjectMetadata,
  upsertProjectRegistryEntry,
} from './projectRegistry';
import {
  isProjectSummaryHealthy,
  readProjectSummary,
  type ProjectSummary,
  type ProjectSummaryStatus,
} from './projectSummary';
import type { ProjectManifest, ProjectMode, ProjectRegistryEntry, ProjectRegistryStore } from './projectTypes';

const DEFAULT_SCAFFOLD_VERSION = '1';

export type ProjectLifecycleErrorCode =
  | 'not-found'
  | 'missing-path'
  | 'unhealthy'
  | 'init-failed'
  | 'manifest-conflict';

export type ProjectLifecycleErrorDetails = {
  projectId?: string;
  rootPath?: string;
  status?: ProjectSummaryStatus;
  reason?: 'manifest-invalid' | 'project-id-conflict';
};

export class ProjectLifecycleError extends Error {
  readonly code: ProjectLifecycleErrorCode;
  readonly details: ProjectLifecycleErrorDetails;
  override readonly cause?: unknown;

  constructor(
    code: ProjectLifecycleErrorCode,
    message: string,
    options?: { cause?: unknown; details?: ProjectLifecycleErrorDetails },
  ) {
    super(message, options);
    this.name = 'ProjectLifecycleError';
    this.code = code;
    this.details = options?.details ?? {};
    this.cause = options?.cause;
  }
}

export type ProjectLifecycleResult = {
  store: ProjectRegistryStore;
  entry: ProjectRegistryEntry;
  summary: ProjectSummary;
  manifest: ProjectManifest | null;
};

type ProjectClock = () => string;
type ProjectIdFactory = () => string;

type CreateProjectOptions = {
  userConfigDir: string;
  rootPath: string;
  displayName: string;
  entryMode: ProjectMode;
  skillPackPath: string;
  now?: ProjectClock;
  createProjectId?: ProjectIdFactory;
};

type ImportProjectOptions = {
  userConfigDir: string;
  rootPath: string;
  displayName?: string;
  entryMode: ProjectMode;
  skillPackPath: string;
  now?: ProjectClock;
  createProjectId?: ProjectIdFactory;
};

type OpenProjectOptions = {
  userConfigDir: string;
  projectId: string;
  entryMode?: ProjectMode;
  now?: ProjectClock;
};

type RepairProjectOptions = {
  userConfigDir: string;
  projectId: string;
  entryMode?: ProjectMode;
  skillPackPath: string;
  now?: ProjectClock;
};

export async function createProject(options: CreateProjectOptions) {
  return initializeProject({
    ...options,
    requireExistingDirectory: false,
  });
}

export async function importProject(options: ImportProjectOptions) {
  return initializeProject({
    ...options,
    requireExistingDirectory: true,
  });
}

export async function openProject({ userConfigDir, projectId, entryMode, now }: OpenProjectOptions): Promise<ProjectLifecycleResult> {
  const store = await loadProjectRegistryStore(userConfigDir);
  const existingEntry = findProjectById(store, projectId);

  if (!existingEntry) {
    throw new ProjectLifecycleError('not-found', `Project "${projectId}" is not registered.`, {
      details: { projectId },
    });
  }

  const summary = await readProjectSummary({
    rootPath: existingEntry.rootPath,
    registryEntry: existingEntry,
  });

  if (summary.status === 'missing-path') {
    await updateProjectMetadata(userConfigDir, existingEntry.id, { missing: true });
    throw new ProjectLifecycleError('missing-path', `Project "${projectId}" cannot be opened because its path is missing.`, {
      details: { projectId, rootPath: existingEntry.rootPath },
    });
  }

  if (!isProjectSummaryHealthy(summary.status)) {
    throw new ProjectLifecycleError('unhealthy', `Project "${projectId}" is not healthy enough to open.`, {
      details: { projectId, rootPath: existingEntry.rootPath, status: summary.status },
    });
  }

  const timestamp = resolveTimestamp(now);
  await updateProjectMetadata(userConfigDir, existingEntry.id, {
    displayName: summary.displayName,
    missing: false,
    lastOpenedAt: timestamp,
    lastMode: entryMode ?? existingEntry.lastMode,
    updatedAt: timestamp,
  });
  const activeStore = await setActiveProject(userConfigDir, existingEntry.id);
  const nextEntry = findProjectById(activeStore, existingEntry.id);

  if (!nextEntry) {
    throw new ProjectLifecycleError('init-failed', `Project "${projectId}" disappeared during open.`, {
      details: { projectId, rootPath: existingEntry.rootPath },
    });
  }

  return {
    store: activeStore,
    entry: nextEntry,
    summary: await readProjectSummary({ rootPath: nextEntry.rootPath, registryEntry: nextEntry }),
    manifest: summary.manifest,
  };
}

export async function repairProject({ userConfigDir, projectId, entryMode, skillPackPath, now }: RepairProjectOptions) {
  const store = await loadProjectRegistryStore(userConfigDir);
  const existingEntry = findProjectById(store, projectId);

  if (!existingEntry) {
    throw new ProjectLifecycleError('not-found', `Project "${projectId}" is not registered.`, {
      details: { projectId },
    });
  }

  return initializeProject({
    userConfigDir,
    rootPath: existingEntry.rootPath,
    displayName: existingEntry.displayName,
    entryMode: entryMode ?? existingEntry.lastMode ?? 'create',
    skillPackPath,
    now,
    createProjectId: () => existingEntry.id,
    requireExistingDirectory: true,
  });
}

async function initializeProject({
  userConfigDir,
  rootPath,
  displayName,
  entryMode,
  skillPackPath,
  now,
  createProjectId,
  requireExistingDirectory,
}: {
  userConfigDir: string;
  rootPath: string;
  displayName?: string;
  entryMode: ProjectMode;
  skillPackPath: string;
  now?: ProjectClock;
  createProjectId?: ProjectIdFactory;
  requireExistingDirectory: boolean;
}): Promise<ProjectLifecycleResult> {
  const normalizedRootPath = normalizeProjectRootPath(rootPath);

  await ensureDirectory(normalizedRootPath, requireExistingDirectory);

  const store = await loadProjectRegistryStore(userConfigDir);
  const existingEntry = findProjectByRootPath(store, normalizedRootPath);
  const manifestBeforeRepair = await readManifestForLifecycle(normalizedRootPath);
  const conflictingEntry = manifestBeforeRepair ? findProjectById(store, manifestBeforeRepair.projectId) : null;

  if (manifestBeforeRepair && conflictingEntry && conflictingEntry.rootPath !== normalizedRootPath && existingEntry === null) {
    const conflictingProjectId = manifestBeforeRepair.projectId;

    throw new ProjectLifecycleError(
      'manifest-conflict',
      `Project id "${conflictingProjectId}" is already registered for another path.`,
      {
        details: {
          projectId: conflictingProjectId,
          rootPath: normalizedRootPath,
          reason: 'project-id-conflict',
        },
      },
    );
  }

  const timestamp = resolveTimestamp(now);
  const projectId = existingEntry?.id ?? manifestBeforeRepair?.projectId ?? createProjectId?.() ?? createDefaultProjectId();
  const resolvedDisplayName = displayName ?? existingEntry?.displayName ?? manifestBeforeRepair?.displayName ?? path.basename(normalizedRootPath);
  const resolvedCreatedAt = existingEntry?.createdAt ?? manifestBeforeRepair?.createdAt ?? timestamp;
  const provisionalEntry = buildRegistryEntry({
    existingEntry,
    projectId,
    displayName: resolvedDisplayName,
    rootPath: normalizedRootPath,
    createdAt: resolvedCreatedAt,
    updatedAt: timestamp,
  });

  await upsertProjectRegistryEntry(userConfigDir, provisionalEntry);

  try {
    await initProject({ projectRoot: normalizedRootPath, skillPackPath });

    const manifest = {
      projectId,
      displayName: resolvedDisplayName,
      createdAt: resolvedCreatedAt,
      scaffoldVersion: manifestBeforeRepair?.scaffoldVersion ?? DEFAULT_SCAFFOLD_VERSION,
      vsixVersion: manifestBeforeRepair?.vsixVersion ?? inferSkillPackVersion(skillPackPath),
      entryMode: manifestBeforeRepair?.entryMode ?? entryMode,
    } satisfies ProjectManifest;

    await writeProjectManifest(normalizedRootPath, manifest);

    const openedEntry = {
      ...provisionalEntry,
      displayName: manifest.displayName,
      archived: false,
      missing: false,
      lastMode: entryMode,
      lastOpenedAt: timestamp,
      updatedAt: timestamp,
    } satisfies ProjectRegistryEntry;
    const summary = await readProjectSummary({
      rootPath: normalizedRootPath,
      registryEntry: openedEntry,
    });

    if (!isProjectSummaryHealthy(summary.status)) {
      throw new ProjectLifecycleError(
        'unhealthy',
        `Project at "${normalizedRootPath}" is not healthy after initialization (status: ${summary.status}).`,
        {
          details: { projectId, rootPath: normalizedRootPath, status: summary.status },
        },
      );
    }

    await upsertProjectRegistryEntry(userConfigDir, openedEntry);
    const activeStore = await setActiveProject(userConfigDir, openedEntry.id);
    const nextEntry = findProjectById(activeStore, openedEntry.id);

    if (!nextEntry) {
      throw new ProjectLifecycleError('init-failed', `Project "${openedEntry.id}" disappeared after initialization.`, {
        details: { projectId: openedEntry.id, rootPath: normalizedRootPath },
      });
    }

    return {
      store: activeStore,
      entry: nextEntry,
      summary: await readProjectSummary({ rootPath: nextEntry.rootPath, registryEntry: nextEntry }),
      manifest,
    };
  } catch (error) {
    if (error instanceof ProjectLifecycleError) {
      throw error;
    }

    throw new ProjectLifecycleError('init-failed', `Failed to initialize project at ${normalizedRootPath}.`, {
      cause: error,
      details: { projectId, rootPath: normalizedRootPath },
    });
  }
}

function buildRegistryEntry({
  existingEntry,
  projectId,
  displayName,
  rootPath,
  createdAt,
  updatedAt,
}: {
  existingEntry: ProjectRegistryEntry | null;
  projectId: string;
  displayName: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}): ProjectRegistryEntry {
  return {
    id: projectId,
    displayName,
    rootPath,
    createdAt,
    updatedAt,
    lastOpenedAt: existingEntry?.lastOpenedAt ?? null,
    favorite: existingEntry?.favorite ?? false,
    archived: existingEntry?.archived ?? false,
    missing: false,
    lastMode: existingEntry?.lastMode ?? null,
    lastOpenedDocument: existingEntry?.lastOpenedDocument ?? null,
    lastKnownStepId: existingEntry?.lastKnownStepId ?? null,
    lastKnownSubstepId: existingEntry?.lastKnownSubstepId ?? null,
    lastKnownChapterNumber: existingEntry?.lastKnownChapterNumber ?? null,
  };
}

async function readManifestForLifecycle(projectRoot: string) {
  try {
    return await readProjectManifest(projectRoot);
  } catch (error) {
    throw new ProjectLifecycleError(
      'manifest-conflict',
      `Project manifest at "${projectRoot}" is unreadable or invalid.`,
      {
        cause: error,
        details: { rootPath: projectRoot, reason: 'manifest-invalid' },
      },
    );
  }
}

async function ensureDirectory(targetPath: string, requireExistingDirectory: boolean) {
  try {
    const stats = await stat(targetPath);

    if (!stats.isDirectory()) {
      throw new ProjectLifecycleError('init-failed', `Project root "${targetPath}" must be a directory.`, {
        details: { rootPath: targetPath },
      });
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    if (requireExistingDirectory) {
      throw new ProjectLifecycleError('missing-path', `Project root "${targetPath}" does not exist.`, {
        details: { rootPath: targetPath },
      });
    }

    await mkdir(targetPath, { recursive: true });
  }
}

async function loadProjectRegistryStore(userConfigDir: string) {
  return (await readProjectRegistry(userConfigDir)) ?? defaultProjectRegistryStore();
}

function findProjectById(store: ProjectRegistryStore, projectId: string) {
  return store.projects.find((project) => project.id === projectId) ?? null;
}

function findProjectByRootPath(store: ProjectRegistryStore, rootPath: string) {
  return store.projects.find((project) => project.rootPath === rootPath) ?? null;
}

function createDefaultProjectId() {
  return `proj_${randomUUID().replace(/-/g, '')}`;
}

function resolveTimestamp(now?: ProjectClock) {
  return now ? now() : new Date().toISOString();
}

function inferSkillPackVersion(skillPackPath: string) {
  const basename = path.basename(skillPackPath);

  return basename.match(/(\d+\.\d+\.\d+(?:[-\w]+)?)/)?.[1] ?? basename;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
