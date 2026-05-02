import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatSessionRequest, WriteTargetHint } from '../workflow/types';
import { loadChatSession, saveChatSession } from './chatSessionApi';

const defaultWriteTargetHint: WriteTargetHint = {
  strictWorkflowWrites: ['1-边界/预期.md'],
  chatAllowedWrites: ['1-边界/预期.md'],
  activeDocumentPath: null,
  hasPendingProposal: false,
};

describe('chatSessionApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('loads messages and writeTargetHint without surfacing preferredChatMode as frontend state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [{ role: 'assistant', content: '已恢复会话。' }],
        preferredChatMode: 'write',
        writeTargetHint: defaultWriteTargetHint,
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await loadChatSession('1-边界/预期.md');

    expect(fetchMock).toHaveBeenCalledWith('/api/chat/session', {
      headers: {
        'x-active-document-path': encodeURIComponent('1-边界/预期.md'),
      },
    });
    expect(result).toEqual({
      messages: [{ role: 'assistant', content: '已恢复会话。' }],
      writeTargetHint: defaultWriteTargetHint,
    });
    expect(result).not.toHaveProperty('preferredChatMode');
  });

  it('saves messages without persisting preferredChatMode and preserves writeTargetHint from the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [{ role: 'assistant', content: '已保存会话。' }],
        preferredChatMode: 'plan',
        writeTargetHint: defaultWriteTargetHint,
      }),
    });
    const legacyRequest = {
      messages: [{ role: 'assistant', content: '需要保留的消息。' }],
      preferredChatMode: 'write',
    } as ChatSessionRequest & { preferredChatMode?: 'plan' | 'write' | null };

    vi.stubGlobal('fetch', fetchMock);

    const result = await saveChatSession(legacyRequest, '1-边界/预期.md');

    expect(fetchMock).toHaveBeenCalledWith('/api/chat/session', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-active-document-path': encodeURIComponent('1-边界/预期.md'),
      },
      body: JSON.stringify({
        messages: [{ role: 'assistant', content: '需要保留的消息。' }],
      }),
    });
    expect(result).toEqual({
      messages: [{ role: 'assistant', content: '已保存会话。' }],
      writeTargetHint: defaultWriteTargetHint,
    });
    expect(result).not.toHaveProperty('preferredChatMode');
  });

  it('adds the active route project id to chat session requests', async () => {
    window.history.replaceState({}, '', '/projects/proj-alpha/files/1-%E8%BE%B9%E7%95%8C/%E9%A2%84%E6%9C%9F.md');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [],
        writeTargetHint: defaultWriteTargetHint,
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await loadChatSession('1-边界/预期.md');

    expect(fetchMock).toHaveBeenCalledWith('/api/chat/session', {
      headers: {
        'x-active-document-path': encodeURIComponent('1-边界/预期.md'),
        'x-project-id': 'proj-alpha',
      },
    });
  });

  it('surfaces structured backend errors when loading the session fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          code: 'no-active-project',
          message: '请先打开项目。',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(loadChatSession('1-边界/预期.md')).rejects.toThrow('请先打开项目。');
  });

  it('surfaces structured backend errors when saving the session fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          code: 'invalid-chat-session',
          message: '会话内容格式不正确。',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(saveChatSession({ messages: [] }, '1-边界/预期.md')).rejects.toThrow('会话内容格式不正确。');
  });
});
