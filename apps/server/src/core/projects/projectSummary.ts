import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { parseProjectProgress, type ProjectProgressSummary } from '../files/readProjectProgress';
import { readProjectManifest } from './projectManifest';
import { normalizeProjectRootPath } from './projectRegistry';
import type { ProjectManifest, ProjectRegistryEntry } from './projectTypes';

export type ProjectSummaryStatus = 'missing-path' | 'needs-repair' | 'archived' | 'ready' | 'uninitialized';

export type ProjectSummary = {
  projectId: string | null;
  displayName: string;
  rootPath: string;
  status: ProjectSummaryStatus;
  phase: string | null;
  coreTask: string | null;
  nextSuggestion: string | null;
  currentChapterNumber: number | null;
  lastOpenedAt: string | null;
  lastOpenedDocument: string | null;
  manifest: ProjectManifest | null;
};

export type ReadProjectSummaryInput = {
  rootPath: string;
  registryEntry?: ProjectRegistryEntry | null;
};

export function isProjectSummaryHealthy(status: ProjectSummaryStatus) {
  return status === 'ready';
}

export async function readProjectSummary({ rootPath, registryEntry = null }: ReadProjectSummaryInput): Promise<ProjectSummary> {
  const normalizedRootPath = normalizeProjectRootPath(rootPath);
  const rootExists = await pathExists(normalizedRootPath);

  if (!rootExists) {
    return buildProjectSummary({
      registryEntry,
      rootPath: normalizedRootPath,
      status: 'missing-path',
      manifest: null,
      progress: null,
    });
  }

  const manifestResult = await loadProjectManifest(normalizedRootPath);
  const projectResult = await loadProjectProgress(normalizedRootPath);
  const knownProject =
    registryEntry !== null || manifestResult.manifest !== null || manifestResult.error !== null || projectResult.exists;

  if (
    manifestResult.error !== null ||
    projectResult.error !== null ||
    (knownProject && (manifestResult.manifest === null || projectResult.progress === null))
  ) {
    return buildProjectSummary({
      registryEntry,
      rootPath: normalizedRootPath,
      status: 'needs-repair',
      manifest: manifestResult.manifest,
      progress: null,
    });
  }

  if (registryEntry?.archived) {
    return buildProjectSummary({
      registryEntry,
      rootPath: normalizedRootPath,
      status: 'archived',
      manifest: manifestResult.manifest,
      progress: projectResult.progress,
    });
  }

  if (!knownProject) {
    return buildProjectSummary({
      registryEntry,
      rootPath: normalizedRootPath,
      status: 'uninitialized',
      manifest: null,
      progress: null,
    });
  }

  return buildProjectSummary({
    registryEntry,
    rootPath: normalizedRootPath,
    status: 'ready',
    manifest: manifestResult.manifest,
    progress: projectResult.progress,
  });
}

async function loadProjectManifest(projectRoot: string) {
  try {
    const manifest = await readProjectManifest(projectRoot);
    return { manifest, error: null };
  } catch (error) {
    return { manifest: null, error };
  }
}

async function loadProjectProgress(projectRoot: string) {
  const projectPath = path.join(projectRoot, 'PROJECT.md');

  try {
    const content = await readFile(projectPath, 'utf8');
    return {
      exists: true,
      progress: parseProjectProgress(content),
      error: null,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        exists: false,
        progress: null,
        error: null,
      };
    }

    return {
      exists: true,
      progress: null,
      error,
    };
  }
}

function buildProjectSummary({
  registryEntry,
  rootPath,
  status,
  manifest,
  progress,
}: {
  registryEntry: ProjectRegistryEntry | null;
  rootPath: string;
  status: ProjectSummaryStatus;
  manifest: ProjectManifest | null;
  progress: ProjectProgressSummary | null;
}): ProjectSummary {
  return {
    projectId: registryEntry?.id ?? manifest?.projectId ?? null,
    displayName: registryEntry?.displayName ?? manifest?.displayName ?? path.basename(rootPath),
    rootPath,
    status,
    phase: progress?.phase ?? null,
    coreTask: progress?.coreTask ?? null,
    nextSuggestion: progress?.nextSuggestion ?? null,
    currentChapterNumber: registryEntry?.lastKnownChapterNumber ?? null,
    lastOpenedAt: registryEntry?.lastOpenedAt ?? null,
    lastOpenedDocument: registryEntry?.lastOpenedDocument ?? null,
    manifest,
  };
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
