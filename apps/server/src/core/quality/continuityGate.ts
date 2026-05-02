import type { ChapterMemoryEntry } from '../memory/types';

export type ContinuityFinding = {
  kind: 'chapter-gap' | 'premature-finale' | 'hook-risk';
  message: string;
  chapterNumber?: number;
};

export type ContinuityAssessment = {
  verdict: 'pass' | 'warn' | 'block';
  findings: ContinuityFinding[];
};

export function assessContinuity(options: {
  currentChapterNumber: number;
  finalOutlinedChapter: number | null;
  chapters: ChapterMemoryEntry[];
  chapterOutline: string;
}) {
  const findings: ContinuityFinding[] = [];
  const chapters = [...options.chapters].sort((left, right) => left.chapterNumber - right.chapterNumber);

  for (let index = 1; index < chapters.length; index += 1) {
    const previous = chapters[index - 1];
    const current = chapters[index];

    if (current.chapterNumber - previous.chapterNumber > 1) {
      findings.push({
        kind: 'chapter-gap',
        chapterNumber: current.chapterNumber,
        message: `第${previous.chapterNumber}章到第${current.chapterNumber}章之间存在章节空档。`,
      });
    }
  }

  if (options.finalOutlinedChapter !== null && options.currentChapterNumber < options.finalOutlinedChapter) {
    const finaleSignals = /(?:大结局|终章|全书完|故事完结|完结)/u;

    for (const chapter of chapters) {
      const hasPrematureFinale = [chapter.summary, ...chapter.facts].some((text) => finaleSignals.test(text));

      if (hasPrematureFinale) {
        findings.push({
          kind: 'premature-finale',
          chapterNumber: chapter.chapterNumber,
          message: `第${chapter.chapterNumber}章存在提前终局措辞。`,
        });
        break;
      }
    }

    if (/终章/u.test(options.chapterOutline) && options.currentChapterNumber < options.finalOutlinedChapter) {
      findings.push({
        kind: 'premature-finale',
        message: '当前章节仍未到终章，但章纲已经出现终局语气。',
      });
    }
  }

  for (const chapter of chapters) {
    const hasUrgentHook = chapter.hooksOpened.some((hook) => /两章内|尽快|必须回收|立即处理/u.test(hook));
    const unresolvedHook = hasUrgentHook && chapter.hooksResolved.length === 0;

    if (unresolvedHook) {
      findings.push({
        kind: 'hook-risk',
        chapterNumber: chapter.chapterNumber,
        message: `第${chapter.chapterNumber}章存在尚未回收的紧迫伏笔。`,
      });
    }
  }

  const verdict = findings.some((item) => item.kind === 'chapter-gap' || item.kind === 'premature-finale')
    ? 'block'
    : findings.length > 0
      ? 'warn'
      : 'pass';

  return { verdict, findings } satisfies ContinuityAssessment;
}

