import { describe, expect, it } from 'vitest';

import { buildSoftFlowPolicy, shouldAutoAdvanceWorkflowAfterApproval } from './softFlowPolicy';

describe('buildSoftFlowPolicy', () => {
  it('keeps strict workflow writes and expands chat/manual writable paths', () => {
    const policy = buildSoftFlowPolicy({
      strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', 'PROJECT.md'],
      chapterNumber: 1,
    });

    expect(policy.strictWorkflowWrites).toEqual([
      '2-设定/2.1_创意脑暴.md',
      '1-边界/1.2_文风.md',
      'PROJECT.md',
    ]);
    expect(policy.chatAllowedWrites).toEqual(
      expect.arrayContaining(['3-大纲/3.1_全书结构总纲.md', '4-正文/第001章_草稿.md', '2-设定/2.1_创意脑暴.md']),
    );
    expect(policy.manualWritablePaths).toEqual(
      expect.arrayContaining(['3-大纲/3.1_全书结构总纲.md', '2-设定/2.1_创意脑暴.md']),
    );
  });

  it('adds active document paths when they are inside writable project areas', () => {
    const policy = buildSoftFlowPolicy({
      strictWorkflowWrites: ['PROJECT.md'],
      chapterNumber: 1,
      activeDocumentPath: '2-设定/角色资料/配角.md',
    });

    expect(policy.chatAllowedWrites).toContain('2-设定/角色资料/配角.md');
    expect(policy.manualWritablePaths).toContain('2-设定/角色资料/配角.md');
  });

  it('ignores active document paths that are outside writable project areas', () => {
    const policy = buildSoftFlowPolicy({
      strictWorkflowWrites: ['PROJECT.md'],
      chapterNumber: 1,
      activeDocumentPath: 'package.json',
    });

    expect(policy.chatAllowedWrites).not.toContain('package.json');
    expect(policy.manualWritablePaths).not.toContain('package.json');
  });
});

describe('shouldAutoAdvanceWorkflowAfterApproval', () => {
  it('advances only when approved writes include strict workflow targets', () => {
    expect(
      shouldAutoAdvanceWorkflowAfterApproval({
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        approvedWritePaths: ['3-大纲/3.1_全书结构总纲.md'],
      }),
    ).toBe(false);

    expect(
      shouldAutoAdvanceWorkflowAfterApproval({
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        approvedWritePaths: ['3-大纲/3.1_全书结构总纲.md', '2-设定/2.1_创意脑暴.md'],
      }),
    ).toBe(true);
  });
});
