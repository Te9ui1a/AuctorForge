import { describe, expect, it } from 'vitest';

import { assembleMemoryContext } from './contextAssembler';

describe('contextAssembler', () => {
  it('keeps the retrieved memory excerpt bounded while prioritizing current chapter context', () => {
    const excerpt = assembleMemoryContext({
      chapterNumber: 48,
      mode: 'write',
      userMessage: '角色甲要追查物件甲去向',
      chapters: Array.from({ length: 60 }, (_, index) => ({
        chapterNumber: index + 1,
        title: `第${index + 1}章`,
        summary: `第${index + 1}章摘要`,
        time: null,
        location: null,
        activeCharacters: ['角色甲'],
        objects: [],
        hooksOpened: index >= 40 ? ['物件甲下落'] : [],
        hooksResolved: [],
        facts: [],
        evidence: [],
        contentHash: String(index + 1),
        updatedAt: '2026-04-27T00:00:00.000Z',
      })),
      entities: {
        'character:角色甲': {
          id: 'character:角色甲',
          kind: 'character',
          name: '角色甲',
          aliases: [],
          status: 'active',
          firstSeenChapter: 1,
          lastSeenChapter: 48,
          evidence: [],
          updatedAt: '2026-04-27T00:00:00.000Z',
        },
      },
      quality: [
        {
          chapterNumber: 47,
          reviewGate: 'revise',
          narrativeChars: 3000,
          aiFlavorHits: ['高频比喻'],
          continuityWarnings: [],
          evidence: [],
          updatedAt: '2026-04-27T00:00:00.000Z',
        },
      ],
    });

    expect(excerpt).toContain('第048章');
    expect(excerpt).toContain('角色甲');
    expect(excerpt.length).toBeLessThanOrEqual(8000);
  });
});

