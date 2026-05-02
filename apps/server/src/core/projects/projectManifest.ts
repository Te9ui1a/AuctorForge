import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isProjectMode, type ProjectManifest } from './projectTypes';

export class ProjectManifestDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectManifestDataError';
  }
}

export function resolveProjectManifestPath(projectRoot: string) {
  return path.join(projectRoot, '.novelflow', 'project.json');
}

export async function readProjectManifest(projectRoot: string): Promise<ProjectManifest | null> {
  const filePath = resolveProjectManifestPath(projectRoot);
  let content: string;

  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw new ProjectManifestDataError(`Failed to read project manifest at ${filePath}.`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new ProjectManifestDataError(`Project manifest at ${filePath} contains malformed JSON.`);
  }

  return normalizeProjectManifest(parsed);
}

export async function writeProjectManifest(projectRoot: string, manifest: ProjectManifest) {
  const filePath = resolveProjectManifestPath(projectRoot);
  await writeJsonAtomically(filePath, JSON.stringify(normalizeProjectManifest(manifest), null, 2));
}

function normalizeProjectManifest(manifest: unknown): ProjectManifest {
  const rawManifest = expectRecord(manifest, 'project manifest');
  const entryMode = rawManifest.entryMode;

  if (!isProjectMode(entryMode)) {
    throw new ProjectManifestDataError('project manifest.entryMode must be "create" or "reference".');
  }

  return {
    projectId: parseNonEmptyString(rawManifest.projectId, 'project manifest.projectId'),
    displayName: parseNonEmptyString(rawManifest.displayName, 'project manifest.displayName'),
    createdAt: parseIsoTimestamp(rawManifest.createdAt, 'project manifest.createdAt'),
    scaffoldVersion: parseNonEmptyString(rawManifest.scaffoldVersion, 'project manifest.scaffoldVersion'),
    vsixVersion: parseNonEmptyString(rawManifest.vsixVersion, 'project manifest.vsixVersion'),
    entryMode,
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
    throw new ProjectManifestDataError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProjectManifestDataError(`${label} must be a non-empty string.`);
  }

  return value;
}

function parseIsoTimestamp(value: unknown, label: string) {
  const timestamp = parseNonEmptyString(value, label);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new ProjectManifestDataError(`${label} must be a valid timestamp string.`);
  }

  return timestamp;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
