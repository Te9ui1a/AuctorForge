import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateDiscussionReply } from './generateDiscussionReply';

const baseOptions = {
  systemPrompt: '当前步骤：新书方向定义',
  userPrompt: '用户消息：先聊聊主角的核心动机。',
  stepTitle: '新书方向定义',
  module: 'define',
  userMessage: '先聊聊主角的核心动机。',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('generateDiscussionReply', () => {
  it('throws a discussion error when no model credentials are configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    await expect(generateDiscussionReply(baseOptions)).rejects.toMatchObject({
      name: 'DiscussionGenerationError',
      code: 'discussion-api-key-missing',
      statusCode: 503,
    });
  });

  it('throws a discussion error when the upstream response is not ok', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
      })),
    );

    await expect(generateDiscussionReply(baseOptions)).rejects.toMatchObject({
      name: 'DiscussionGenerationError',
      code: 'discussion-upstream-response',
      statusCode: 502,
      details: {
        provider: 'openai-compatible',
        status: 502,
      },
    });
  });

  it('throws a discussion error when the model returns empty output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '   ',
              },
            },
          ],
        }),
      })),
    );

    await expect(generateDiscussionReply(baseOptions)).rejects.toMatchObject({
      name: 'DiscussionGenerationError',
      code: 'discussion-empty-response',
      statusCode: 502,
      details: {
        provider: 'openai-compatible',
      },
    });
  });

  it('throws a discussion error when the model request raises a network exception', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network down'))));

    await expect(generateDiscussionReply(baseOptions)).rejects.toMatchObject({
      name: 'DiscussionGenerationError',
      code: 'discussion-network-error',
      statusCode: 502,
      details: {
        provider: 'openai-compatible',
        cause: 'network down',
      },
    });
  });

  it('sanitizes discussion replies that falsely claim files were already saved', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '我已经把设定写入 2-设定/2.2_新书设定案.md，并在后台保存好了。',
              },
            },
          ],
        }),
      })),
    );

    const reply = await generateDiscussionReply(baseOptions);

    expect(reply).toContain('尚未写入任何文件');
    expect(reply).not.toContain('后台保存好了');
    expect(reply).not.toContain('已经把设定写入');
  });

  it('sanitizes discussion replies that ask for confirmation without a pending proposal', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '这套设定方向成立。请回复“确认”，我将进入下一步。',
              },
            },
          ],
        }),
      })),
    );

    const reply = await generateDiscussionReply(baseOptions);

    expect(reply).toContain('当前仍在讨论阶段');
    expect(reply).not.toContain('请回复');
    expect(reply).not.toContain('确认');
    expect(reply).not.toContain('进入下一步');
  });
});
