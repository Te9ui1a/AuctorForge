import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { normalizeProjectPath } from '../compat/rules';

type WriteWorkflowFileOptions = {
  projectRoot: string;
  relativePath: string;
  content: string;
  allowedWrites: string[];
};

export async function readProjectFile(projectRoot: string, relativePath: string) {
  const targetPath = resolveProjectPath(projectRoot, relativePath);
  await assertRealPathInsideProject(projectRoot, targetPath, 'Project file read');

  return readFile(targetPath, 'utf8');
}

export async function readProjectFileIfExists(projectRoot: string, relativePath: string) {
  try {
    return await readProjectFile(projectRoot, relativePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function writeWorkflowFile({
  projectRoot,
  relativePath,
  content,
  allowedWrites,
}: WriteWorkflowFileOptions) {
  const normalizedPath = normalizeProjectPath(relativePath);
  const normalizedAllowedWrites = new Set(allowedWrites.map(normalizeProjectPath));

  if (!normalizedAllowedWrites.has(normalizedPath)) {
    throw new Error(`Write is not allowed for path: ${normalizedPath}`);
  }

  const targetPath = resolveProjectPath(projectRoot, normalizedPath);

  await ensureProjectDirectory(projectRoot, path.dirname(targetPath));
  await assertWritableTargetIsNotSymlink(targetPath);

  const fileHandle = await open(
    targetPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
  );

  try {
    await fileHandle.writeFile(content, 'utf8');
  } finally {
    await fileHandle.close();
  }

  await assertRealPathInsideProject(projectRoot, targetPath, 'Project file write');
}

function resolveProjectPath(projectRoot: string, relativePath: string) {
  const normalizedPath = normalizeProjectPath(relativePath);
  const targetPath = path.resolve(projectRoot, normalizedPath);
  const resolvedProjectRoot = path.resolve(projectRoot);

  if (!targetPath.startsWith(`${resolvedProjectRoot}${path.sep}`) && targetPath !== resolvedProjectRoot) {
    throw new Error(`Resolved path escapes project root: ${normalizedPath}`);
  }

  return targetPath;
}

async function assertRealPathInsideProject(projectRoot: string, targetPath: string, label: string) {
  const realProjectRoot = await realpath(path.resolve(projectRoot));
  const realTargetPath = await realpath(targetPath);
  const relativeRealPath = path.relative(realProjectRoot, realTargetPath);

  if (
    relativeRealPath.startsWith('..')
    || path.isAbsolute(relativeRealPath)
  ) {
    throw new Error(`${label} escapes project root through symlink`);
  }
}

async function assertWritableTargetIsNotSymlink(targetPath: string) {
  try {
    const stats = await lstat(targetPath);

    if (stats.isSymbolicLink()) {
      throw new Error('Write target is a symlink and is not allowed');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

async function ensureProjectDirectory(projectRoot: string, targetDirectory: string) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedTargetDirectory = path.resolve(targetDirectory);
  const relativeDirectory = path.relative(resolvedProjectRoot, resolvedTargetDirectory);

  if (relativeDirectory.startsWith('..') || path.isAbsolute(relativeDirectory)) {
    throw new Error('Directory escapes project root');
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
        throw new Error('Project directory path contains a symlink and is not allowed');
      }

      if (!stats.isDirectory()) {
        throw new Error(`Project directory path is not a directory: ${currentPath}`);
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

async function assertDirectoryIsRealProjectChild(directoryPath: string, realProjectRoot: string) {
  const realDirectoryPath = await realpath(directoryPath);
  const relativeRealPath = path.relative(realProjectRoot, realDirectoryPath);

  if (relativeRealPath.startsWith('..') || path.isAbsolute(relativeRealPath)) {
    throw new Error('Project directory escapes project root through symlink');
  }
}
