import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatRequestError, DEFAULT_CHAT_REQUEST_TIMEOUT_MS, useChatStream } from './useChatStream';

function createStreamResponse(blocks: string[]) {
  const encoder = new TextEncoder();

  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const block of blocks) {
          controller.enqueue(encoder.encode(block));
        }
        controller.close();
      },
    }),
  };
}

function createStallingStreamResponse(firstBlock: string) {
  const encoder = new TextEncoder();
  let readCount = 0;

  return {
    ok: true,
    body: {
      getReader: () => ({
        read: () => {
          readCount += 1;
          if (readCount === 1) {
            return Promise.resolve({
              done: false,
              value: encoder.encode(firstBlock),
            });
          }

          return new Promise(() => {});
        },
      }),
    },
  };
}

describe('useChatStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('keeps the default chat request timeout aligned with backend generation timeout', () => {
    expect(DEFAULT_CHAT_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
  });

  it('surfaces structured backend errors for non-stream chat requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          code: 'missing-api-key',
          message: '请先配置模型 API Key。',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: false,
    }));

    await expect(result.current.send('继续', false, [])).rejects.toThrow('请先配置模型 API Key。');
  });

  it('adds the active route project id to non-stream chat requests', async () => {
    window.history.replaceState({}, '', '/projects/proj-alpha');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: '继续推进。',
        session: {},
        pendingProposal: null,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: false,
    }));

    await expect(result.current.send('继续', false, [])).resolves.toMatchObject({
      reply: '继续推进。',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'x-project-id': 'proj-alpha',
        },
      }),
    );
  });

  it('surfaces structured backend errors when stream fallback chat requests fail', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('stream unavailable'))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: 'proposal-parse-failed',
            message: '模型输出无法解析为写入提案。',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('写一章', false, [])).rejects.toThrow('模型输出无法解析为写入提案。');
    });
  });

  it('marks progress failed when stream fallback cannot recover', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('stream disconnected'))
      .mockRejectedValueOnce(new Error('fallback disconnected'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).rejects.toThrow('fallback disconnected');
    });

    expect(result.current.progress).toMatchObject({
      status: 'error',
      errorMessage: 'fallback disconnected',
    });
  });

  it('ignores stream ready events and resolves completed-turn done events', async () => {
    const onAssistantStart = vi.fn();
    const onAssistantChunk = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([
      'event: ready\ndata: {"transport":"completed-turn-sse"}\n\n',
      'event: done\ndata: {"reply":"完成了。","session":{},"pendingProposal":null}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart,
      onAssistantChunk,
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).resolves.toMatchObject({
        reply: '完成了。',
      });
    });

    expect(onAssistantStart).toHaveBeenCalledTimes(1);
    expect(onAssistantChunk).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tracks phase and heartbeat progress without treating them as assistant chunks', async () => {
    const onAssistantStart = vi.fn();
    const onAssistantChunk = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([
      'event: ready\ndata: {"transport":"completed-turn-sse"}\n\n',
      'event: phase\ndata: {"phase":"building_prompt","requestId":"turn-progress"}\n\n',
      'event: heartbeat\ndata: {"phase":"building_prompt","requestId":"turn-progress"}\n\n',
      'event: phase\ndata: {"phase":"calling_model","requestId":"turn-progress"}\n\n',
      'event: done\ndata: {"reply":"完成了。","session":{},"pendingProposal":null}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart,
      onAssistantChunk,
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).resolves.toMatchObject({ reply: '完成了。' });
    });

    expect(onAssistantStart).toHaveBeenCalledTimes(1);
    expect(onAssistantChunk).not.toHaveBeenCalled();
    expect(result.current.progress).toMatchObject({
      status: 'idle',
      phase: 'calling_model',
      requestId: 'turn-progress',
      lastEventAgeMs: expect.any(Number),
    });
    expect(result.current.progress.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects stream error events with the structured backend message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createStreamResponse([
      'event: ready\ndata: {"transport":"completed-turn-sse"}\n\n',
      'event: error\ndata: {"statusCode":502,"error":{"code":"chat-generation-failed","message":"模型服务返回异常，请检查模型配置或稍后重试。","details":{"backendMessage":"backend model rejected the request"}}}\n\n',
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).rejects.toMatchObject({
        name: 'ChatRequestError',
        message: '模型服务返回异常，请检查模型配置或稍后重试。',
        payload: {
          code: 'chat-generation-failed',
          message: '模型服务返回异常，请检查模型配置或稍后重试。',
          details: {
            backendMessage: 'backend model rejected the request',
          },
        },
      } satisfies Partial<ChatRequestError>);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back with the same request id when the stream only emits ready then closes without done', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createStreamResponse([
        'event: ready\ndata: {"transport":"completed-turn-sse"}\n\n',
      ]))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: '已通过同一请求恢复。',
          session: {},
          pendingProposal: null,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).resolves.toMatchObject({
        reply: '已通过同一请求恢复。',
      });
    });

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { requestId?: string };
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string) as { requestId?: string };

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(secondBody.requestId).toBe(firstBody.requestId);
  });

  it('does not fall back when actual partial stream data arrives before the next read stalls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createStallingStreamResponse(
        'event: ready\ndata: {"transport":"completed-turn-sse"}\n\n'
        + 'event: proposal_item\ndata: {"path":"2-设定/2.1_创意脑暴.md"}\n\n',
      ))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: '不应提交 fallback。',
          session: {},
          pendingProposal: null,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      requestTimeoutMs: 1,
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).rejects.toThrow('STREAM_PARTIAL_ERROR');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not surface stream error events as recoverable errors after actual partial stream data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createStreamResponse([
        'event: ready\ndata: {"transport":"completed-turn-sse"}\n\n',
        'event: proposal_item\ndata: {"path":"2-设定/2.1_创意脑暴.md"}\n\n',
        'event: error\ndata: {"statusCode":502,"error":{"code":"chat-generation-failed","message":"模型服务异常。"}}\n\n',
      ]))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: '不应提交 fallback。',
          session: {},
          pendingProposal: null,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).rejects.toThrow('STREAM_PARTIAL_ERROR');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to non-stream chat when the stream request never responds', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: '已生成第4章草稿，请确认后写入。',
          session: {},
          pendingProposal: { proposedWrites: [{ path: '4-正文/第004章_草稿.md' }] },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      requestTimeoutMs: 1,
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('不用讨论，直接写第4章正文。', false, [])).resolves.toMatchObject({
        reply: '已生成第4章草稿，请确认后写入。',
        pendingProposal: { proposedWrites: [{ path: '4-正文/第004章_草稿.md' }] },
      });
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chat/stream',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.isStreaming).toBe(false);
  });

  it('falls back to non-stream chat when stream headers arrive but the body stalls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: () => new Promise(() => {}),
          }),
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: '已恢复同一轮请求。',
          session: {},
          pendingProposal: null,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      requestTimeoutMs: 1,
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('继续', false, [])).resolves.toMatchObject({
        reply: '已恢复同一轮请求。',
      });
    });

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { requestId?: string };
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string) as { requestId?: string };

    expect(secondBody.requestId).toBe(firstBody.requestId);
    expect(result.current.isStreaming).toBe(false);
  }, 1_000);

  it('reuses the same request id when stream fallback submits the recovery request', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('stream disconnected'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: '已生成第4章草稿，请确认后写入。',
          session: {},
          pendingProposal: { proposedWrites: [{ path: '4-正文/第004章_草稿.md' }] },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatStream({
      onAssistantStart: () => {},
      onAssistantChunk: () => {},
      streamEnabled: true,
    }));

    await act(async () => {
      await expect(result.current.send('不用讨论，直接写第4章正文。', false, [])).resolves.toMatchObject({
        reply: '已生成第4章草稿，请确认后写入。',
      });
    });

    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { requestId?: string };
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string) as { requestId?: string };

    expect(firstBody.requestId).toMatch(/^chat-turn-/);
    expect(secondBody.requestId).toBe(firstBody.requestId);
  });
});
