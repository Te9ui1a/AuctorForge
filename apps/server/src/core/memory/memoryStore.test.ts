import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { appendJsonlRow, readJsonFile, readJsonlFile, readStructuredChapters, readStructuredMemoryDiagnostics, readStructuredSummary, writeJsonFile, writeStructuredEntities, writeStructuredSummary } from './memoryStore';
import { STRUCTURED_CHAPTERS_PATH, STRUCTURED_ENTITIES_PATH, STRUCTURED_MEMORY_DIR, STRUCTURED_QUALITY_PATH, STRUCTURED_SUMMARY_PATH } from './memoryPaths';
import type { ChapterMemoryEntry, EntityMemory } from './types';

const STRUCTURED_DIR = path.join('.novelkit', 'memory', 'structured');

const tempDirs: string[] = [];

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-memory-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('memoryStore', () => {
  it('creates the structured memory directory and appends JSONL rows', async () => {
    const workspaceRoot = await makeWorkspace();

    const entry: ChapterMemoryEntry = {
      chapterNumber: 1,
      title: '夜雨来信',
      summary: '林照在夜雨里接到一封信。',
      time: '子时',
      location: '城南旧巷',
      activeCharacters: ['林照'],
      objects: [],
      hooksOpened: ['神秘信件'],
      hooksResolved: [],
      facts: ['林照收到信件'],
      evidence: [{ path: '4-正文/第001章_草稿.md', chapterNumber: 1, quote: '林照在夜雨里接到一封信。' }],
      contentHash: 'hash-1',
      updatedAt: '2026-04-27T00:00:00.000Z',
    };

    await appendJsonlRow(workspaceRoot, STRUCTURED_CHAPTERS_PATH, entry);

    const readBack = await readStructuredChapters(workspaceRoot);
    expect(readBack.rows).toEqual([entry]);
    expect(path.join(workspaceRoot, STRUCTURED_MEMORY_DIR)).toContain(STRUCTURED_MEMORY_DIR);
  });

  it('upserts structured entity state through the JSON store', async () => {
    const workspaceRoot = await makeWorkspace();
    const entities: Record<string, EntityMemory> = {
      'character:林照': {
        id: 'character:林照',
        kind: 'character',
        name: '林照',
        aliases: ['林师兄'],
        status: 'active',
        firstSeenChapter: 1,
        lastSeenChapter: 2,
        evidence: [{ path: '4-正文/第002章_草稿.md', chapterNumber: 2, quote: '林照抬头。' }],
        updatedAt: '2026-04-27T00:00:00.000Z',
      },
    };

    await writeStructuredEntities(workspaceRoot, entities);
    const readBack = await readJsonFile<Record<string, EntityMemory>>(workspaceRoot, STRUCTURED_ENTITIES_PATH, {});

    expect(readBack).toEqual(entities);
  });

  it('reads missing files as empty collections and reports malformed JSONL diagnostics', async () => {
    const workspaceRoot = await makeWorkspace();

    const emptyRows = await readJsonlFile<ChapterMemoryEntry>(workspaceRoot, STRUCTURED_CHAPTERS_PATH);
    expect(emptyRows.rows).toEqual([]);

    await mkdir(path.join(workspaceRoot, STRUCTURED_DIR), { recursive: true });
    await writeFile(path.join(workspaceRoot, STRUCTURED_DIR, 'quality.jsonl'), '{"broken":true}\n{"still":false}\n{"oops":', 'utf8');

    await writeStructuredSummary(workspaceRoot, {
      chapterCount: 1,
      latestChapter: 1,
      activeEntityCount: 1,
      unresolvedHookCount: 1,
      latestWarningCount: 0,
      lastRebuildAt: '2026-04-27T00:00:00.000Z',
    });

    const diagnostics = await readStructuredMemoryDiagnostics(workspaceRoot);
    expect(diagnostics.length).toBeGreaterThan(0);
    await expect(readStructuredSummary(workspaceRoot)).resolves.toMatchObject({ chapterCount: 1 });
  });
});
