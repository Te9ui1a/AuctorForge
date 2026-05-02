import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type SkillPackArchive = {
  entries: string[];
  hasEntry: (entryPath: string) => boolean;
  readText: (entryPath: string) => string;
};

export function readSkillPackArchive(skillPackPath: string): SkillPackArchive {
  if (!statSync(skillPackPath).isDirectory()) {
    throw new Error(`Skill pack path must be an expanded directory: ${skillPackPath}`);
  }

  return readExpandedSkillPack(skillPackPath);
}

function readExpandedSkillPack(rootPath: string): SkillPackArchive {
  const resolvedRoot = path.resolve(rootPath);
  const entries = listFiles(resolvedRoot);

  return {
    entries,
    hasEntry(entryPath) {
      return entries.includes(normalizeEntryPath(entryPath));
    },
    readText(entryPath) {
      const normalizedEntryPath = normalizeEntryPath(entryPath);
      if (!entries.includes(normalizedEntryPath)) {
        throw new Error(`Skill pack entry not found: ${entryPath}`);
      }

      return readFileSync(resolveEntryPath(resolvedRoot, normalizedEntryPath), 'utf8');
    },
  };
}

function listFiles(rootPath: string, relativeDirectory = ''): string[] {
  const directoryPath = path.join(rootPath, relativeDirectory);
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(rootPath, relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(normalizeEntryPath(relativePath));
    }
  }

  return files.sort();
}

function resolveEntryPath(rootPath: string, entryPath: string) {
  const resolvedEntryPath = path.resolve(rootPath, entryPath);

  if (!resolvedEntryPath.startsWith(`${rootPath}${path.sep}`) && resolvedEntryPath !== rootPath) {
    throw new Error(`Skill pack entry escapes skill pack root: ${entryPath}`);
  }

  return resolvedEntryPath;
}

function normalizeEntryPath(entryPath: string) {
  return entryPath.split(path.sep).join('/');
}
