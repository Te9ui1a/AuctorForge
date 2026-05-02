import type { ChapterMemoryEntry, EntityMemory, QualityMemoryEntry } from './types';

type ContextAssemblerOptions = {
  chapterNumber: number;
  mode: 'write' | 'review' | 'outline';
  userMessage?: string;
  currentOutlineContent?: string | null;
  chapters: ChapterMemoryEntry[];
  entities: Record<string, EntityMemory>;
  quality: QualityMemoryEntry[];
};

const DEFAULT_BUDGETS = {
  write: 8000,
  review: 6000,
  outline: 5000,
} as const;

export function assembleMemoryContext(options: ContextAssemblerOptions) {
  const budget = DEFAULT_BUDGETS[options.mode];
  const current = options.chapterNumber;
  const outlineText = options.currentOutlineContent ?? '';
  const selected: string[] = [];

  const scoredChapters = options.chapters
    .map((chapter) => ({ chapter, score: scoreChapter(chapter.chapterNumber, current, outlineText, options.userMessage, options.quality) }))
    .sort((left, right) => right.score - left.score || right.chapter.chapterNumber - left.chapter.chapterNumber);

  for (const item of scoredChapters) {
    for (const line of formatChapterEntry(item.chapter)) {
      if (wouldFit(selected, line, budget)) {
        selected.push(line);
      }
    }
  }

  const activeEntities = Object.values(options.entities)
    .filter((entity) => entity.lastSeenChapter === current || entity.lastSeenChapter === current - 1 || entity.status.includes('active'))
    .map((entity) => `- ${entity.name}（${entity.kind}）: ${entity.status}`);

  for (const entityLine of activeEntities) {
    if (wouldFit(selected, entityLine, budget)) {
      selected.push(entityLine);
    }
  }

  const unresolvedHooks = options.chapters.flatMap((chapter) => chapter.hooksOpened).slice(0, 12).map((hook) => `- ${hook}`);
  for (const hook of unresolvedHooks) {
    if (wouldFit(selected, hook, budget)) {
      selected.push(hook);
    }
  }

  return selected.join('\n');
}

function scoreChapter(
  chapterNumber: number,
  current: number,
  outlineText: string,
  userMessage: string | undefined,
  quality: QualityMemoryEntry[],
) {
  let score = 0;
  if (chapterNumber === current || chapterNumber === current - 1 || chapterNumber === current - 2 || chapterNumber === current - 3) {
    score += 100;
  }
  if (chapterNumber < current && current - chapterNumber <= 10) {
    score += 80;
  }
  if (outlineText && userMessage && outlineText.includes(userMessage)) {
    score += 60;
  }
  if (chapterNumber % 10 === Math.floor(current / 10) % 10) {
    score += 40;
  }
  if (quality.some((item) => item.chapterNumber >= current - 5 && item.reviewGate !== 'pass')) {
    score += 20;
  }
  return score;
}

function formatChapterEntry(chapter: ChapterMemoryEntry) {
  const heading = `- 第${String(chapter.chapterNumber).padStart(3, '0')}章 ${chapter.title ?? ''}: ${chapter.summary}`.trim();
  const objectFacts = chapter.objects.map((object) => `  - 物件：${object.name}；持有者：${object.owner ?? '未知'}；状态：${object.state ?? '未知'}`);
  const facts = chapter.facts.slice(0, 4).map((fact) => `  - 事实：${fact}`);
  return [heading, ...objectFacts, ...facts];
}

function wouldFit(selected: string[], next: string, budget: number) {
  const currentLength = selected.join('\n').length;
  return currentLength + next.length + 1 <= budget;
}
