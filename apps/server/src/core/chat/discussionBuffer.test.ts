import { describe, expect, it } from 'vitest';

import { createDiscussionBuffer } from './discussionBuffer';

const defineStep = {
  id: 'define-direction',
  substepId: 'brainstorm',
  module: 'define' as const,
};

const outlineStep = {
  id: 'outline-arc',
  substepId: 'arrange-beats',
  module: 'outline' as const,
};

const guideStep = {
  id: 'guide-step',
  substepId: 'guide-only',
  module: 'guide' as const,
};

const guideDiscussionStep = {
  id: 'guide-entry',
  substepId: 'character-first',
  module: 'guide' as const,
};

describe('discussionBuffer', () => {
  it('snapshots stored notes and restores them into a clean buffer', () => {
    const buffer = createDiscussionBuffer();

    buffer.remember(defineStep, '  主角先活下来  ');
    buffer.remember(defineStep, '主角做决定时要果断');
    buffer.remember(outlineStep, '第一卷先从宗门开始');
    buffer.remember(guideStep, '这条不应被记住');

    expect(buffer.snapshot()).toEqual([
      {
        stepId: 'define-direction',
        substepId: 'brainstorm',
        module: 'define',
        notes: ['主角先活下来', '主角做决定时要果断'],
      },
      {
        stepId: 'outline-arc',
        substepId: 'arrange-beats',
        module: 'outline',
        notes: ['第一卷先从宗门开始'],
      },
    ]);

    const restored = createDiscussionBuffer();
    restored.remember(defineStep, '旧的缓存');

    restored.restore(buffer.snapshot());

    expect(restored.getNotes(defineStep)).toEqual(['主角先活下来', '主角做决定时要果断']);
    expect(restored.getNotes(outlineStep)).toEqual(['第一卷先从宗门开始']);
    expect(restored.getNotes(guideStep)).toEqual([]);
  });

  it('reapplies note caps during restore and keeps clear semantics intact', () => {
    const buffer = createDiscussionBuffer(2);

    buffer.restore(JSON.parse(`[
      {
        "stepId": "define-direction",
        "substepId": "brainstorm",
        "module": "define",
        "notes": ["  第一条  ", "", "第二条", "第三条"]
      },
      {
        "stepId": "guide-step",
        "substepId": "guide-only",
        "module": "guide",
        "notes": ["忽略我"]
      }
    ]`));

    expect(buffer.getNotes(defineStep)).toEqual(['第二条', '第三条']);
    expect(buffer.snapshot()).toEqual([
      {
        stepId: 'define-direction',
        substepId: 'brainstorm',
        module: 'define',
        notes: ['第二条', '第三条'],
      },
    ]);

    buffer.clear();

    expect(buffer.getNotes(defineStep)).toEqual([]);
  });

  it('stores selected guide discussion substeps and restores them after snapshot round-trips', () => {
    const buffer = createDiscussionBuffer();

    buffer.remember(guideDiscussionStep, '先比较一下主角路线和人设切口');
    buffer.remember(guideDiscussionStep, '再解释为什么先做这一步');
    buffer.remember(guideStep, '这条 guide 非讨论子步骤仍然不该保留');

    expect(buffer.snapshot()).toEqual(JSON.parse(`[
      {
        "stepId": "guide-entry",
        "substepId": "character-first",
        "module": "guide",
        "notes": ["先比较一下主角路线和人设切口", "再解释为什么先做这一步"]
      }
    ]`));

    const restored = createDiscussionBuffer();
    restored.restore(buffer.snapshot());

    expect(restored.getNotes(guideDiscussionStep)).toEqual(['先比较一下主角路线和人设切口', '再解释为什么先做这一步']);
    expect(restored.getNotes(guideStep)).toEqual([]);
  });
});
