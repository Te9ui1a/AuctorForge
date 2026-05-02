import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChapterMemoryEntry, EntityMemory, QualityMemoryEntry, StructuredMemoryDiagnostics, MemorySummary } from './types';
import {
  STRUCTURED_CHAPTERS_PATH,
  STRUCTURED_ENTITIES_PATH,
  STRUCTURED_MEMORY_DIR,
  STRUCTURED_QUALITY_PATH,
  STRUCTURED_SUMMARY_PATH,
} from './memoryPaths';

type MemoryStorePaths = {
  projectRoot: string;
};

function absolutePath(projectRoot: string, relativePath: string) {
  return path.join(projectRoot, relativePath);
}

async function ensureStructuredMemoryDir(projectRoot: string) {
  await mkdir(absolutePath(projectRoot, STRUCTURED_MEMORY_DIR), { recursive: true });
}

async function atomicWriteFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, content, 'utf8');
  await rename(tmpPath, filePath);
}

async function writeJsonlFile(projectRoot: string, relativePath: string, rows: unknown[]) {
  await ensureStructuredMemoryDir(projectRoot);
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  await atomicWriteFile(absolutePath(projectRoot, relativePath), body.length > 0 ? `${body}\n` : '');
}

export async function readJsonFile<T>(projectRoot: string, relativePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(absolutePath(projectRoot, relativePath), 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(projectRoot: string, relativePath: string, value: unknown) {
  await ensureStructuredMemoryDir(projectRoot);
  await atomicWriteFile(absolutePath(projectRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJsonlFile<T>(projectRoot: string, relativePath: string) {
  const diagnostics: StructuredMemoryDiagnostics[] = [];

  try {
    const content = await readFile(absolutePath(projectRoot, relativePath), 'utf8');
    const rows: T[] = [];

    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (line.trim().length === 0) {
        continue;
      }

      try {
        rows.push(JSON.parse(line) as T);
      } catch {
        diagnostics.push({ path: relativePath, line: index + 1, message: 'Malformed JSONL line ignored' });
      }
    }

    return { rows, diagnostics };
  } catch {
    return { rows: [] as T[], diagnostics };
  }
}

export async function appendJsonlRow(projectRoot: string, relativePath: string, value: unknown) {
  await ensureStructuredMemoryDir(projectRoot);
  const filePath = absolutePath(projectRoot, relativePath);

  let previous = '';
  try {
    previous = await readFile(filePath, 'utf8');
  } catch {
    previous = '';
  }

  const next = `${previous}${previous.endsWith('\n') || previous.length === 0 ? '' : '\n'}${JSON.stringify(value)}\n`;
  await atomicWriteFile(filePath, next);
}

export async function readStructuredChapters(projectRoot: string) {
  return readJsonlFile<ChapterMemoryEntry>(projectRoot, STRUCTURED_CHAPTERS_PATH);
}

export async function readStructuredEntities(projectRoot: string) {
  return readJsonFile<Record<string, EntityMemory>>(projectRoot, STRUCTURED_ENTITIES_PATH, {});
}

export async function readStructuredQuality(projectRoot: string) {
  return readJsonlFile<QualityMemoryEntry>(projectRoot, STRUCTURED_QUALITY_PATH);
}

export async function writeStructuredEntities(projectRoot: string, entities: Record<string, EntityMemory>) {
  await writeJsonFile(projectRoot, STRUCTURED_ENTITIES_PATH, entities);
}

export async function writeStructuredChapters(projectRoot: string, chapters: ChapterMemoryEntry[]) {
  await writeJsonlFile(projectRoot, STRUCTURED_CHAPTERS_PATH, chapters);
}

export async function writeStructuredQuality(projectRoot: string, quality: QualityMemoryEntry[]) {
  await writeJsonlFile(projectRoot, STRUCTURED_QUALITY_PATH, quality);
}

export async function writeStructuredSummary(projectRoot: string, summary: MemorySummary) {
  await writeJsonFile(projectRoot, STRUCTURED_SUMMARY_PATH, summary);
}

export async function readStructuredSummary(projectRoot: string) {
  return readJsonFile<MemorySummary>(projectRoot, STRUCTURED_SUMMARY_PATH, {
    chapterCount: 0,
    latestChapter: null,
    activeEntityCount: 0,
    unresolvedHookCount: 0,
    latestWarningCount: 0,
    lastRebuildAt: null,
  });
}

export async function readStructuredMemoryDiagnostics(projectRoot: string) {
  const chapterRows = await readJsonlFile<ChapterMemoryEntry>(projectRoot, STRUCTURED_CHAPTERS_PATH);
  const qualityRows = await readJsonlFile<QualityMemoryEntry>(projectRoot, STRUCTURED_QUALITY_PATH);

  return [...chapterRows.diagnostics, ...qualityRows.diagnostics];
}
