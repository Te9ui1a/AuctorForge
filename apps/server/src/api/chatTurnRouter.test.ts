import { describe, expect, it } from 'vitest';

import { runChatTurnCommands, type ChatTurnCommandHandler } from './chatTurnRouter';

describe('runChatTurnCommands', () => {
  it('runs handlers in order and stops at the first handled command', async () => {
    const calls: string[] = [];
    const handlers: Array<ChatTurnCommandHandler<{ message: string }, string>> = [
      {
        name: 'miss',
        handle: ({ message }) => {
          calls.push(`miss:${message}`);
          return null;
        },
      },
      {
        name: 'hit',
        handle: ({ message }) => {
          calls.push(`hit:${message}`);
          return 'handled';
        },
      },
      {
        name: 'skipped',
        handle: () => {
          calls.push('skipped');
          return 'wrong';
        },
      },
    ];

    const response = await runChatTurnCommands({
      context: { message: '检查进度' },
      handlers,
      fallback: () => 'fallback',
    });

    expect(response).toBe('handled');
    expect(calls).toEqual(['miss:检查进度', 'hit:检查进度']);
  });

  it('uses fallback when every command passes', async () => {
    const handlers: Array<ChatTurnCommandHandler<{ message: string }, string>> = [
      { name: 'first', handle: () => null },
      { name: 'second', handle: async () => null },
    ];

    await expect(runChatTurnCommands({
      context: { message: '继续写' },
      handlers,
      fallback: ({ message }) => `fallback:${message}`,
    })).resolves.toBe('fallback:继续写');
  });
});
