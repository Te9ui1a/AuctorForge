import { readProjectFileIfExists } from '../files/fileGateway';
import { listProjectFiles } from '../files/listProjectFiles';
import {
  CHARACTER_MEMORY_PATH,
  FORESHADOWING_MEMORY_PATH,
  VOLUME_CHAPTER_OUTLINE_PATH,
  chapterReviewPath,
} from '../paths/projectPaths';
import { getMaxOutlinedChapterNumber } from '../write/chapterContract';
import { assessContinuity } from '../quality/continuityGate';
import { buildScaleQualityReport } from '../quality/scaleQualityReport';
import { extractChapterMemory } from './chapterMemoryExtractor';
import { writeStructuredChapters, writeStructuredEntities, writeStructuredQuality, writeStructuredSummary } from './memoryStore';
import type { ChapterMemoryEntry, EntityMemory, QualityMemoryEntry, MemorySummary } from './types';

function extractChapterNumberFromPath(filePath: string) {
  const match = filePath.match(/第0*(\d+)章/);
  return match ? Number.parseInt(match[1] ?? '0', 10) : null;
}

export async function rebuildStructuredMemory(projectRoot: string) {
  const files = await listProjectFiles(projectRoot);
  const draftPaths = files.groups
    .flatMap((group) => group.files)
    .map((file) => file.path)
    .filter((filePath) => /4-正文\/第\d+章_草稿\.md$/u.test(filePath))
    .sort();

  const characterStateContent = await readProjectFileIfExists(projectRoot, CHARACTER_MEMORY_PATH);
  const foreshadowingContent = await readProjectFileIfExists(projectRoot, FORESHADOWING_MEMORY_PATH);
  const chapterOutlineContent = await readProjectFileIfExists(projectRoot, VOLUME_CHAPTER_OUTLINE_PATH(1));

  const chapterRows: ChapterMemoryEntry[] = [];
  const qualityRows: QualityMemoryEntry[] = [];
  const entityRows: Record<string, EntityMemory> = {};

  for (const draftPath of draftPaths) {
    const chapterNumber = extractChapterNumberFromPath(draftPath);
    if (chapterNumber === null) {
      continue;
    }

    const draftContent = await readProjectFileIfExists(projectRoot, draftPath);
    if (draftContent === null) {
      continue;
    }

    const reviewContent = await readProjectFileIfExists(projectRoot, chapterReviewPath(chapterNumber));
    const result = extractChapterMemory({
      chapterNumber,
      draftContent,
      reviewContent,
      characterStateContent,
      foreshadowingContent,
      chapterOutlineContent,
    });

    chapterRows.push(result.chapter);

    for (const entity of result.entities) {
      entityRows[entity.id] = mergeEntityMemory(entityRows[entity.id], entity);
    }

    if (result.quality) {
      qualityRows.push(result.quality);
    }
  }

  const finalOutlinedChapter = chapterOutlineContent ? getMaxOutlinedChapterNumber(chapterOutlineContent) : null;
  const continuity = assessContinuity({
    currentChapterNumber: chapterRows.at(-1)?.chapterNumber ?? 0,
    finalOutlinedChapter,
    chapters: chapterRows,
    chapterOutline: chapterOutlineContent ?? '',
  });

  const unresolvedHooks = chapterRows.flatMap((chapter) => chapter.hooksOpened.filter((hook) => !chapter.hooksResolved.includes(hook)));
  const entityDrift = Object.values(entityRows)
    .filter((entity) => /drift|conflict/u.test(entity.status))
    .map((entity) => `${entity.name}状态漂移`);
  const aiFlavorHits = qualityRows.flatMap((item) => item.aiFlavorHits);
  const revisionChapters = qualityRows.filter((item) => item.reviewGate !== 'pass').map((item) => item.chapterNumber);

  const summary: MemorySummary = {
    chapterCount: chapterRows.length,
    latestChapter: chapterRows.at(-1)?.chapterNumber ?? null,
    activeEntityCount: Object.values(entityRows).filter((entity) => /active/u.test(entity.status)).length,
    unresolvedHookCount: unresolvedHooks.length,
    latestWarningCount: continuity.findings.length,
    lastRebuildAt: new Date().toISOString(),
  };

  await writeStructuredChapters(projectRoot, chapterRows);
  await writeStructuredQuality(projectRoot, qualityRows);
  await writeStructuredEntities(projectRoot, entityRows);
  await writeStructuredSummary(projectRoot, summary);

  await appendQualityReport(projectRoot, chapterRows, continuity, unresolvedHooks, entityDrift, aiFlavorHits, revisionChapters);

  return summary;
}

function mergeEntityMemory(existing: EntityMemory | undefined, next: EntityMemory): EntityMemory {
  if (!existing) {
    return next;
  }

  return {
    ...existing,
    aliases: [...new Set([...existing.aliases, ...next.aliases])],
    status: next.status || existing.status,
    firstSeenChapter: existing.firstSeenChapter ?? next.firstSeenChapter,
    lastSeenChapter: Math.max(existing.lastSeenChapter ?? 0, next.lastSeenChapter ?? 0) || null,
    evidence: [...existing.evidence, ...next.evidence],
    updatedAt: next.updatedAt,
  };
}

async function appendQualityReport(
  projectRoot: string,
  chapters: ChapterMemoryEntry[],
  continuity: ReturnType<typeof assessContinuity>,
  unresolvedHooks: string[],
  entityDrift: string[],
  aiFlavorHits: string[],
  revisionChapters: number[],
) {
  const report = buildScaleQualityReport({
    startChapter: chapters[0]?.chapterNumber ?? 1,
    endChapter: chapters.at(-1)?.chapterNumber ?? 0,
    continuityVerdict: continuity.verdict,
    unresolvedHooks,
    entityDrift,
    aiFlavorHits,
    revisionChapters,
  });

  await import('node:fs/promises').then(({ appendFile, mkdir }) =>
    mkdir(`${projectRoot}/.novelkit/memory/structured`, { recursive: true }).then(() =>
      appendFile(`${projectRoot}/.novelkit/memory/structured/quality-report.md`, `${report}\n`, 'utf8'),
    ),
  );
}
