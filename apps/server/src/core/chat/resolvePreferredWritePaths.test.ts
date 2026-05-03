import { describe, expect, it } from 'vitest';

import { resolvePreferredWritePaths } from './resolvePreferredWritePaths';

describe('resolvePreferredWritePaths', () => {
  it('prefers explicitly mentioned file paths over strict stage targets', () => {
    const preferred = resolvePreferredWritePaths({
      userPrompt: '用户消息：请直接写入 3-大纲/3.1_全书结构总纲.md，先给我一版。',
      strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
      chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', '3-大纲/3.1_全书结构总纲.md'],
    });

    expect(preferred).toEqual(['3-大纲/3.1_全书结构总纲.md']);
  });

  it('uses active document path when user does not mention another file', () => {
    const preferred = resolvePreferredWritePaths({
      userPrompt: '用户消息：请把当前打开文档补全成可用草案。',
      strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
      chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', '3-大纲/3.1_全书结构总纲.md'],
      activeDocumentPath: '3-大纲/3.1_全书结构总纲.md',
    });

    expect(preferred).toEqual(['3-大纲/3.1_全书结构总纲.md']);
  });

  it('ignores a stale active document when the user asks for workflow chapter writing', () => {
    const preferred = resolvePreferredWritePaths({
      userPrompt: '用户消息：按审查报告重写第4章正文。不要输出大纲、场景标题或说明文字，只写小说正文。',
      strictWorkflowWrites: ['4-正文/第004章_草稿.md', '.novelkit/memory/character_state.md', 'PROJECT.md'],
      chatAllowedWrites: [
        '4-正文/第004章_草稿.md',
        '.novelkit/memory/character_state.md',
        'PROJECT.md',
        '1-边界/1.2_文风.md',
      ],
      activeDocumentPath: '1-边界/1.2_文风.md',
    });

    expect(preferred).toEqual(['4-正文/第004章_草稿.md', '.novelkit/memory/character_state.md', 'PROJECT.md']);
  });

  it('prefers the current final draft path for finalization requests', () => {
    const preferred = resolvePreferredWritePaths({
      userPrompt: '用户消息：按审查报告生成第4章定稿。',
      strictWorkflowWrites: ['4-正文/第004章_草稿.md', '4-正文/第004章_定稿.md', 'PROJECT.md'],
      chatAllowedWrites: ['4-正文/第004章_草稿.md', '4-正文/第004章_定稿.md', 'PROJECT.md'],
    });

    expect(preferred).toEqual(['4-正文/第004章_定稿.md', '4-正文/第004章_草稿.md', 'PROJECT.md']);
  });

  it('keeps the current draft path first for ordinary chapter revision requests', () => {
    const preferred = resolvePreferredWritePaths({
      userPrompt: '用户消息：继续修改第4章草稿。',
      strictWorkflowWrites: ['4-正文/第004章_草稿.md', '4-正文/第004章_定稿.md', 'PROJECT.md'],
      chatAllowedWrites: ['4-正文/第004章_草稿.md', '4-正文/第004章_定稿.md', 'PROJECT.md'],
    });

    expect(preferred).toEqual(['4-正文/第004章_草稿.md', '4-正文/第004章_定稿.md', 'PROJECT.md']);
  });

  it('falls back to strict workflow writes when no clear file target exists', () => {
    const preferred = resolvePreferredWritePaths({
      userPrompt: '用户消息：先生成一版。',
      strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
      chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', '3-大纲/3.1_全书结构总纲.md'],
    });

    expect(preferred).toEqual(['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md']);
  });
});
