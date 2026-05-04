import { describe, expect, it } from 'vitest';

import { buildScaleQualityReport } from './scaleQualityReport';

describe('scaleQualityReport', () => {
  it('generates a compact multi-chapter continuity report', () => {
    const report = buildScaleQualityReport({
      startChapter: 1,
      endChapter: 10,
      continuityVerdict: 'warn',
      unresolvedHooks: ['物件甲未回收'],
      entityDrift: ['角色甲状态漂移'],
      aiFlavorHits: ['高频比喻'],
      revisionChapters: [4, 7],
    });

    expect(report).toContain('第001-010章_体检报告');
    expect(report).toContain('连续性结论');
    expect(report).toContain('物件甲未回收');
    expect(report).toContain('角色甲状态漂移');
  });
});

