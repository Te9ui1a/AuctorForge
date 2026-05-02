import { describe, expect, it } from 'vitest';

import {
  extractDiscussionPremise,
  extractDirectedIdeaFromMessage,
  extractProjectPremise,
  tryParseAssistantProposal,
} from './assistantProposalParsers';

describe('assistantProposalParsers', () => {
  it('parses fenced proposal json and keeps only valid writes', () => {
    expect(
      tryParseAssistantProposal([
        '```json',
        JSON.stringify({
          reply: '好的，先给你一版。',
          proposedWrites: [
            { path: '2-设定/2.2_新书设定案.md', content: '# 设定案' },
            { path: '', content: 'bad' },
            { path: '2-设定/2.3_金手指设定.md', content: 42 },
          ],
        }),
        '```',
      ].join('\n')),
    ).toEqual({
      reply: '好的，先给你一版。',
      proposedWrites: [{ path: '2-设定/2.2_新书设定案.md', content: '# 设定案' }],
    });
  });

  it('parses proposal json even when Gemini wraps it in prose before a fenced block', () => {
    expect(
      tryParseAssistantProposal([
        '下面是本轮提案，请直接解析 JSON：',
        '```json',
        JSON.stringify({
          reply: '好的，先给你一版。',
          proposedWrites: [{ path: '1-边界/1.2_文风.md', content: '# 文风说明' }],
        }),
        '```',
      ].join('\n')),
    ).toEqual({
      reply: '好的，先给你一版。',
      proposedWrites: [{ path: '1-边界/1.2_文风.md', content: '# 文风说明' }],
    });
  });

  it('rejects parsed proposals whose reply is not a string', () => {
    expect(
      tryParseAssistantProposal(
        JSON.stringify({
          reply: { text: '不是字符串' },
          proposedWrites: [{ path: '2-设定/2.2_新书设定案.md', content: '# 设定案' }],
        }),
      ),
    ).toBeNull();
  });

  it('extracts premise hints from project files and discussion prompts', () => {
    expect(
      extractProjectPremise([
        {
          path: '2-设定/2.1_创意脑暴.md',
          content: '# 套路方向与核心设定\n\n## 1. 核心梗 (Core Premise)\n龟丞相在西游世界苟道长生。',
        },
      ]),
    ).toBe('龟丞相在西游世界苟道长生。');

    expect(
      extractDiscussionPremise([
        '用户消息：先讨论设定',
        '',
        '### 最近讨论记录',
        '1. 先确定主角的求生逻辑',
        '2. 把金手指做成偏保命型外挂',
      ].join('\n')),
    ).toBe('把金手指做成偏保命型外挂');

    expect(extractDirectedIdeaFromMessage('用户消息：重新生成：我想写一个苟道修仙故事。')).toBe(
      '我想写一个苟道修仙故事。',
    );
  });
});
