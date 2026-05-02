import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rm, unlink } from 'node:fs/promises';
import path from 'node:path';

export class ProjectEntryNameError extends Error {
  constructor(message = 'Project entry name must be a single file or folder name.') {
    super(message);
    this.name = 'ProjectEntryNameError';
  }
}

export async function createProjectFolder(projectRoot: string, parentPath: unknown, name: unknown) {
  const targetPath = resolveProjectChildPath(projectRoot, parentPath, name);
  await ensureProjectDirectory(projectRoot, path.dirname(targetPath));
  await assertCreatableTargetIsNotSymlink(targetPath);
  let createdDirectory = false;

  try {
    await mkdir(targetPath);
    createdDirectory = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }

    const stats = await lstat(targetPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw error;
    }
  }

  try {
    await assertRealPathInsideProject(projectRoot, targetPath);
  } catch (error) {
    if (createdDirectory) {
      await removeCreatedDirectory(targetPath);
    }

    throw error;
  }

  return {
    path: path.relative(projectRoot, targetPath).split(path.sep).join('/'),
  };
}

export async function createProjectFile(projectRoot: string, parentPath: unknown, name: unknown) {
  const targetPath = resolveProjectChildPath(projectRoot, parentPath, name);
  await ensureProjectDirectory(projectRoot, path.dirname(targetPath));
  await assertCreatableTargetIsNotSymlink(targetPath);

  const fileHandle = await open(
    targetPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
  );

  await fileHandle.close();

  try {
    await assertRealPathInsideProject(projectRoot, targetPath);
  } catch (error) {
    await removeCreatedFile(targetPath);
    throw error;
  }

  return {
    path: path.relative(projectRoot, targetPath).split(path.sep).join('/'),
  };
}

function resolveProjectChildPath(projectRoot: string, parentPath: unknown, name: unknown) {
  if (typeof parentPath !== 'string') {
    throw new ProjectEntryNameError('Project entry parent path must be a string.');
  }

  const normalizedName = normalizeProjectEntryName(name);
  const targetPath = path.resolve(projectRoot, parentPath, normalizedName);
  const resolvedRoot = path.resolve(projectRoot);

  if (!targetPath.startsWith(`${resolvedRoot}${path.sep}`) && targetPath !== resolvedRoot) {
    throw new ProjectEntryNameError('Project entry parent path must stay inside project root.');
  }

  return targetPath;
}

function normalizeProjectEntryName(name: unknown) {
  if (typeof name !== 'string') {
    throw new ProjectEntryNameError();
  }

  const normalizedName = name.trim();
  const hasPathSeparator = normalizedName.includes('/') || normalizedName.includes('\\');
  const parsed = path.parse(normalizedName);

  if (
    normalizedName.length === 0 ||
    normalizedName === '.' ||
    normalizedName === '..' ||
    hasPathSeparator ||
    parsed.base !== normalizedName
  ) {
    throw new ProjectEntryNameError();
  }

  return normalizedName;
}

async function ensureProjectDirectory(projectRoot: string, targetDirectory: string) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedTargetDirectory = path.resolve(targetDirectory);
  const relativeDirectory = path.relative(resolvedProjectRoot, resolvedTargetDirectory);

  if (relativeDirectory.startsWith('..') || path.isAbsolute(relativeDirectory)) {
    throw new ProjectEntryNameError('Project entry parent path must stay inside project root.');
  }

  const realProjectRoot = await realpath(resolvedProjectRoot);
  const segments = relativeDirectory ? relativeDirectory.split(path.sep) : [];
  let currentPath = resolvedProjectRoot;

  await assertDirectoryIsRealProjectChild(currentPath, realProjectRoot);

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);

    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new ProjectEntryNameError('Project entry parent path must not contain symlinks.');
      }

      if (!stats.isDirectory()) {
        throw new ProjectEntryNameError('Project entry parent path must be a directory.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }

      await mkdir(currentPath);
    }

    await assertDirectoryIsRealProjectChild(currentPath, realProjectRoot);
  }
}

async function assertCreatableTargetIsNotSymlink(targetPath: string) {
  try {
    const stats = await lstat(targetPath);
    if (stats.isSymbolicLink()) {
      throw new ProjectEntryNameError('Project entry target must not be a symlink.');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

async function assertRealPathInsideProject(projectRoot: string, targetPath: string) {
  const realProjectRoot = await realpath(path.resolve(projectRoot));
  const realTargetPath = await realpath(targetPath);
  const relativeRealPath = path.relative(realProjectRoot, realTargetPath);

  if (relativeRealPath.startsWith('..') || path.isAbsolute(relativeRealPath)) {
    throw new ProjectEntryNameError('Project entry target escapes project root through symlink.');
  }
}

async function assertDirectoryIsRealProjectChild(directoryPath: string, realProjectRoot: string) {
  const realDirectoryPath = await realpath(directoryPath);
  const relativeRealPath = path.relative(realProjectRoot, realDirectoryPath);

  if (relativeRealPath.startsWith('..') || path.isAbsolute(relativeRealPath)) {
    throw new ProjectEntryNameError('Project entry parent path escapes project root through symlink.');
  }
}

async function removeCreatedFile(targetPath: string) {
  try {
    await unlink(targetPath);
  } catch {
    // Best-effort cleanup for a detected parent-directory race.
  }
}

async function removeCreatedDirectory(targetPath: string) {
  try {
    await rm(targetPath, { recursive: false, force: true });
  } catch {
    // Best-effort cleanup for a detected parent-directory race.
  }
}
