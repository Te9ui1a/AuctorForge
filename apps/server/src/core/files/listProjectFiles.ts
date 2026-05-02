import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { FileTreeData, FileTreeEntry, FileTreeGroup } from 'shared';

const GROUPS = ['.novelkit', '1-边界', '2-设定', '3-大纲', '4-正文', '5-审查'] as const;

export async function listProjectFiles(projectRoot: string): Promise<FileTreeData> {
  const groups = await Promise.all(
    GROUPS.map(async (groupName) => ({
      title: groupName,
      files: await readGroupFiles(projectRoot, groupName),
    })),
  );

  const rootFiles = await readRootFiles(projectRoot);

  return {
    rootFiles,
    groups,
  };
}

async function readRootFiles(projectRoot: string): Promise<FileTreeEntry[]> {
  try {
    const entries = await readdir(projectRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name === 'PROJECT.md')
      .map((entry) => ({ path: entry.name, label: entry.name }))
      .sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  } catch {
    return [];
  }
}

async function readGroupFiles(projectRoot: string, groupName: string, relativeDir = ''): Promise<FileTreeGroup['files']> {
  const directoryPath = path.join(projectRoot, groupName, relativeDir);

  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const files: FileTreeGroup['files'] = [];

    for (const entry of entries) {
      const nestedRelativeDir = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        const childFiles = await readGroupFiles(projectRoot, groupName, nestedRelativeDir);
        if (childFiles.length === 0) {
          const normalizedPath = path.join(groupName, nestedRelativeDir).split(path.sep).join('/');
          files.push({
            path: normalizedPath,
            label: entry.name,
            type: 'folder',
          });
        } else {
          files.push(...childFiles);
        }
        continue;
      }

      const normalizedPath = path.join(groupName, nestedRelativeDir).split(path.sep).join('/');
      files.push({
        path: normalizedPath,
        label: path.basename(normalizedPath),
      });
    }

    return files.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  } catch {
    return [];
  }
}
