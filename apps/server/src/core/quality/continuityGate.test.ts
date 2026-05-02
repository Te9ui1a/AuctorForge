import { describe, expect, it } from 'vitest';

import { assessContinuity } from './continuityGate';

describe('continuityGate', () => {
  it('detects chapter gaps, unresolved deadlines, ownership conflicts, status conflicts, and premature finales', () => {
    const result = assessContinuity({
      currentChapterNumber: 7,
      finalOutlinedChapter: 12,
      chapters: [5, 7].map((chapterNumber) => ({
        chapterNumber,
        title: `第${chapterNumber}章`,
        summary: '摘要',
        time: null,
        location: null,
        activeCharacters: chapterNumber === 5 ? ['林照'] : ['林照'],
        objects: [{ name: '账册', owner: chapterNumber === 5 ? '林照' : '阿七', state: null }],
        hooksOpened: chapterNumber === 5 ? ['账册须在两章内回收'] : [],
        hooksResolved: [],
        facts: chapterNumber === 5 ? ['死亡'] : ['存活'],
        evidence: [],
        contentHash: String(chapterNumber),
        updatedAt: '2026-04-27T00:00:00.000Z',
      })),
      chapterOutline: '第1章：开局\n第2章：发展\n第12章：终章',
    });

    expect(result.verdict).toBe('block');
    expect(result.findings.some((finding) => finding.kind === 'chapter-gap')).toBe(true);
    expect(result.findings.some((finding) => finding.kind === 'premature-finale')).toBe(true);
  });
});

