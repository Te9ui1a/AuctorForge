import { describe, expect, it } from 'vitest';

import { assessChapterContinuity } from './chapterContinuityGate';
import type { ChapterPlan } from './chapterPlanResolver';

const currentPlan: ChapterPlan = {
  number: 2,
  title: '当前章',
  summary: '本章推进当前事件。连续性信号：当前信号甲',
  scenes: ['场景1：处理当前信号甲', '场景2：形成新的选择'],
  hook: '章末钩子：当前悬念继续。',
};

describe('assessChapterContinuity', () => {
  it('flags high-confidence future beat leakage from explicit project signals', () => {
    const result = assessChapterContinuity({
      currentChapterNumber: 2,
      draftContent: '# 第002章 当前章\n\n正文提前写到了未来信号甲，也提前写到了未来信号乙。',
      previousChapterSummary: '上一章只留下当前信号甲。',
      currentPlan,
      futurePlans: [
        {
          number: 6,
          title: '后续章',
          summary: '后续揭示：未来信号甲、未来信号乙',
          scenes: ['场景1：处理未来信号甲', '场景2：处理未来信号乙'],
          hook: '后续悬念继续。',
        },
      ],
    });

    expect(result.verdict).toBe('revise');
    expect(result.findings).toContainEqual(expect.objectContaining({
      kind: 'future-beat-leak',
      chapterNumber: 6,
      evidence: expect.stringContaining('未来信号甲'),
    }));
  });

  it('flags future resource leakage only when the project plan marks resource signals', () => {
    const result = assessChapterContinuity({
      currentChapterNumber: 2,
      draftContent: '# 第002章 当前章\n\n正文提前让角色获得资源信号甲。',
      previousChapterSummary: '上一章没有资源变更。',
      currentPlan,
      futurePlans: [
        {
          number: 5,
          title: '资源章',
          summary: '资源信号：资源信号甲',
          scenes: ['场景1：资源信号甲进入当前项目状态'],
          hook: '资源状态变化。',
        },
      ],
    });

    expect(result.verdict).toBe('revise');
    expect(result.findings).toContainEqual(expect.objectContaining({
      kind: 'unauthorized-resource-escalation',
      chapterNumber: 5,
      evidence: '资源信号甲',
    }));
  });

  it('warns when the draft misses the current chapter explicit signal', () => {
    const result = assessChapterContinuity({
      currentChapterNumber: 2,
      draftContent: '# 第002章 当前章\n\n正文只处理了其他事件。',
      previousChapterSummary: '上一章只留下当前信号甲。',
      currentPlan,
      futurePlans: [],
    });

    expect(result.verdict).toBe('warn');
    expect(result.findings).toContainEqual(expect.objectContaining({
      kind: 'missing-current-beat',
      severity: 'warn',
      evidence: '当前信号甲',
    }));
  });

  it('passes adjacent overlap when the signal is already allowed by current or previous context', () => {
    const result = assessChapterContinuity({
      currentChapterNumber: 2,
      draftContent: '# 第002章 当前章\n\n正文继续处理当前信号甲。',
      previousChapterSummary: '上一章已经引入当前信号甲。',
      currentPlan,
      futurePlans: [
        {
          number: 3,
          title: '相邻章',
          summary: '连续性信号：当前信号甲、后续信号乙',
          scenes: ['场景1：延续当前信号甲'],
          hook: '后续信号乙出现。',
        },
      ],
    });

    expect(result).toEqual({ verdict: 'pass', findings: [] });
  });

  it('does not infer continuity findings from unmarked future prose', () => {
    const result = assessChapterContinuity({
      currentChapterNumber: 2,
      draftContent: '# 第002章 当前章\n\n正文写到了普通词甲，也写到了普通词乙。',
      previousChapterSummary: '',
      currentPlan,
      futurePlans: [
        {
          number: 8,
          title: '未标注章',
          summary: '这一章包含普通词甲和普通词乙，但没有显式连续性标记。',
          scenes: ['场景1：普通词甲', '场景2：普通词乙'],
          hook: '继续推进。',
        },
      ],
    });

    expect(result.findings).not.toContainEqual(expect.objectContaining({
      kind: 'future-beat-leak',
    }));
  });
});
