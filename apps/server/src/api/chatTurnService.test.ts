import { describe, expect, it, vi } from 'vitest';

import { createChatTurnService, type ChatTurnServiceHandler } from './chatTurnService';

describe('createChatTurnService', () => {
  it('runs handlers in order and stops at the first handled turn', async () => {
    const calls: string[] = [];
    const handlers: Array<ChatTurnServiceHandler<{ message: string }, string>> = [
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
    const service = createChatTurnService({
      buildContext: ({ body }: { body: { message: string } }) => body,
      handlers,
      fallback: () => 'fallback',
    });

    const response = await service.run(null, null, { message: '检查进度' }, null);

    expect(response).toBe('handled');
    expect(calls).toEqual(['miss:检查进度', 'hit:检查进度']);
  });

  it('uses fallback when every handler passes', async () => {
    const service = createChatTurnService({
      buildContext: ({ body }: { body: { message: string } }) => body,
      handlers: [
        { name: 'first', handle: () => null },
        { name: 'second', handle: async () => null },
      ],
      fallback: ({ message }) => `fallback:${message}`,
    });

    await expect(service.run(null, null, { message: '继续写' }, null)).resolves.toBe('fallback:继续写');
  });

  it('runs before and after hooks around command dispatch', async () => {
    const order: string[] = [];
    const service = createChatTurnService({
      buildContext: ({ body }: { body: { message: string } }) => {
        order.push('build-context');
        return body;
      },
      handlers: [
        {
          name: 'command',
          handle: ({ message }) => {
            order.push(`command:${message}`);
            return 'handled';
          },
        },
      ],
      fallback: () => {
        order.push('fallback');
        return 'fallback';
      },
      beforeRun: ({ context }) => {
        order.push(`before:${context.message}`);
      },
      afterRun: ({ result }) => {
        order.push(`after:${result}`);
      },
    });

    await expect(service.run(null, null, { message: '确认' }, null)).resolves.toBe('handled');
    expect(order).toEqual(['build-context', 'before:确认', 'command:确认', 'after:handled']);
  });

  it('returns a completed turn before building a new context', async () => {
    const buildContext = vi.fn(() => ({ message: 'new' }));
    const service = createChatTurnService({
      getRequestId: (body: { requestId?: string }) => body.requestId ?? null,
      getActiveProjectKey: () => 'project-alpha',
      readCompleted: () => 'cached',
      buildContext,
      handlers: [],
      fallback: () => 'fallback',
    });

    await expect(service.run(null, 'project-alpha', { requestId: 'turn-1' }, null)).resolves.toBe('cached');
    expect(buildContext).not.toHaveBeenCalled();
  });
});
