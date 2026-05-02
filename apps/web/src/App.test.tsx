import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY } from './features/layout/workbenchCreativeSplit';

const srcDirectory = dirname(fileURLToPath(import.meta.url));
const injectedSurfaceStyles = [
  readFileSync(resolve(srcDirectory, './styles/tokens.css'), 'utf8'),
  readFileSync(resolve(srcDirectory, './styles.css'), 'utf8'),
].join('\n');

if (!document.head.querySelector('[data-test-styles="surface-contract"]')) {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-test-styles', 'surface-contract');
  styleElement.textContent = injectedSurfaceStyles;
  document.head.appendChild(styleElement);
}

function readCustomProperty(element: Element | null, propertyName: string) {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  return getComputedStyle(element).getPropertyValue(propertyName).trim();
}

function createDomRect({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubCreativeWorkspaceRect(rect: { left: number; top: number; width: number; height: number }) {
  const creativeWorkspace = document.querySelector<HTMLElement>('[data-shell-region="creative-workspace"]');

  expect(creativeWorkspace).not.toBeNull();

  Object.defineProperty(creativeWorkspace, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(rect),
  });

  return creativeWorkspace as HTMLElement;
}

function stubPointerCapture(trigger: HTMLElement) {
  let capturedPointerId: number | null = null;
  const setPointerCapture = vi.fn((pointerId: number) => {
    capturedPointerId = pointerId;
  });
  const releasePointerCapture = vi.fn((pointerId: number) => {
    if (capturedPointerId === pointerId) {
      capturedPointerId = null;
    }
  });
  const hasPointerCapture = vi.fn((pointerId: number) => capturedPointerId === pointerId);

  Object.defineProperties(trigger, {
    setPointerCapture: {
      configurable: true,
      value: setPointerCapture,
    },
    releasePointerCapture: {
      configurable: true,
      value: releasePointerCapture,
    },
    hasPointerCapture: {
      configurable: true,
      value: hasPointerCapture,
    },
  });

  return { setPointerCapture, releasePointerCapture, hasPointerCapture };
}

function dispatchPointerEvent(
  target: Element,
  type: string,
  init: {
    button?: number;
    buttons?: number;
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    pointerType?: string;
    isPrimary?: boolean;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button,
    buttons: init.buttons,
    clientX: init.clientX,
    clientY: init.clientY,
  });

  Object.defineProperties(event, {
    pointerId: {
      configurable: true,
      value: init.pointerId,
    },
    pointerType: {
      configurable: true,
      value: init.pointerType,
    },
    isPrimary: {
      configurable: true,
      value: init.isPrimary,
    },
  });

  fireEvent(target, event);
}

function clearWorkbenchUiStorage() {
  window.localStorage.removeItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY);
}

function getInlineTopContext(container: ParentNode = document) {
  return container.querySelector<HTMLElement>('[data-shell-region="top-bar-context-inline"]');
}

function isSilentUnexpectedFetch(input: string) {
  return input === '/api/chat/session' || input === '/api/chat/stream' || input === '/api/workspace/init';
}

function rejectUnexpectedFetch(input: string) {
  if (!isSilentUnexpectedFetch(input)) {
    console.error('Unexpected fetch:', input);
  }
  return Promise.reject(new Error(`Unexpected fetch: ${input}`));
}

async function bootstrapApp(mode: 'create' | 'analyze' = 'create') {
  window.history.replaceState({}, '', '/');
  render(<App />);
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
  });
  fireEvent.click(screen.getAllByRole('button', { name: /Test Project 1/ })[0]);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: mode === 'create' ? /继续当前项目创作/ : /进入参考模式/ })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? /继续当前项目创作/ : /进入参考模式/ }));
  await waitFor(() => {
    expect(screen.getAllByRole('heading', { name: '创作助手' }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('当前文档编辑器').length).toBeGreaterThan(0);
  });
}

async function bootstrapWorkbenchShell(mode: 'create' | 'analyze' = 'create') {
  window.history.replaceState({}, '', '/');
  render(<App />);
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
  });
  fireEvent.click(screen.getAllByRole('button', { name: /Test Project 1/ })[0]);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: mode === 'create' ? /继续当前项目创作/ : /进入参考模式/ })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? /继续当前项目创作/ : /进入参考模式/ }));
  await waitFor(() => {
    const workbenchShell = document.querySelector('[data-shell-region="workbench-shell"]');
    expect(workbenchShell).not.toBeNull();
  });
}

function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  render(<App />);
}

function getCurrentDocumentEditor() {
  const editors = screen.getAllByLabelText('当前文档编辑器') as HTMLTextAreaElement[];
  return editors[editors.length - 1];
}

function getTopBarControl(name: string) {
  return within(screen.getByLabelText('工作台顶部栏')).getByRole('button', { name });
}

function expandWorkflowRailIfCollapsed() {
  const [openDrawerButton] = screen.queryAllByRole('button', { name: '打开流程状态' });

  if (openDrawerButton?.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(openDrawerButton);
  }

  const [expandButton] = screen.queryAllByRole('button', { name: '展开流程状态栏' });

  if (expandButton) {
    fireEvent.click(expandButton);
  }
}

async function navigateBrowserTo(path: string, method: 'push' | 'replace' = 'push') {
  await act(async () => {
    if (method === 'replace') {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }

    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}


const fetchMock = vi.fn();

const defaultWriteTargetHint = {
  strictWorkflowWrites: ['1-边界/预期.md'],
  chatAllowedWrites: ['1-边界/预期.md'],
  activeDocumentPath: null,
  hasPendingProposal: false,
};

type MockChatReply =
  | {
      ok: false;
      status?: number;
    }
  | {
      reply?: string;
      session?: Record<string, unknown>;
      pendingProposal?: unknown;
    };

type MockChatErrorResponse = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type MockFileTreeData =
  | {
      rootFiles: Array<{ path: string; label: string }>;
      groups: Array<{ title: string; files: Array<{ path: string; label: string }> }>;
    }
  | Array<{ title: string; files: Array<{ path: string; label: string }> }>;

function isFailedMockChatReply(reply: MockChatReply): reply is Extract<MockChatReply, { ok: false }> {
  return 'ok' in reply && reply.ok === false;
}

function setupWorkbenchFetchMock(options?: {
  session?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  chatSession?: unknown;
  chatReplies?: MockChatReply[];
  chatErrorResponse?: MockChatErrorResponse;
  fileTreeData?: MockFileTreeData;
  fileContentByPath?: Record<string, string>;
  onChatRequest?: (body: string) => void;
  onChatSessionPut?: (body: string) => void;
  onFileSave?: (body: string) => void;
}) {
  const sessionPayload = {
    initialized: true,
    currentStepId: 'define-direction',
    currentModule: 'define',
    currentStepTitle: '新书方向定义',
    waitingForApproval: false,
    ...options?.session,
  };
  const chatReplies = [...(options?.chatReplies ?? [{ reply: '助手回复', session: sessionPayload, pendingProposal: null }])];

  fetchMock.mockImplementation((input: string, init?: RequestInit) => {
    if (input === '/api/projects/open' && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          activeProjectId: 'proj-1',
          project: { id: 'proj-1', displayName: 'Test Project 1' },
        }),
      });
    }

    if (input === '/api/projects') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          activeProjectId: 'proj-1',
          projects: [
            {
              id: 'proj-1',
              displayName: 'Test Project 1',
              rootPath: '/tmp/proj-1',
              lastOpenedAt: new Date().toISOString(),
              status: 'ready',
            },
          ],
        }),
      });
    }

    if (input === '/api/session') {
      return Promise.resolve({
        ok: true,
        json: async () => sessionPayload,
      });
    }

    if (input === '/api/progress') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          session: sessionPayload,
          requiredProjectReads: ['1-边界/预期.md'],
          allowedWrites: ['1-边界/预期.md'],
          strictWorkflowWrites: ['1-边界/预期.md'],
          chatAllowedWrites: ['1-边界/预期.md'],
          manualWritablePaths: ['1-边界/预期.md'],
          nextStepId: null,
          pendingProposal: null,
          ...options?.progress,
        }),
      });
    }

    if (input === '/api/chat/session' && (!init || init.method === undefined)) {
      return Promise.resolve({
        ok: true,
        json: async () =>
          options?.chatSession ?? {
            messages: [{ role: 'assistant', content: '已载入项目会话。' }],
            writeTargetHint: defaultWriteTargetHint,
          },
      });
    }

    if (input === '/api/chat/session' && init?.method === 'PUT') {
      options?.onChatSessionPut?.(String(init.body ?? ''));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          messages: [{ role: 'assistant', content: '已载入项目会话。' }],
          writeTargetHint: defaultWriteTargetHint,
        }),
      });
    }

    if (input === '/api/workspace/init' && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => sessionPayload,
      });
    }

    if (input.startsWith('/api/file?path=')) {
      const requestedPath = new URL(input, window.location.origin).searchParams.get('path') ?? '1-边界/预期.md';
      return Promise.resolve({
        ok: true,
        json: async () => ({
          path: requestedPath,
          content: options?.fileContentByPath?.[requestedPath] ?? '# 新书预期',
        }),
      });
    }

    if (input === '/api/file' && init?.method === 'PUT') {
      options?.onFileSave?.(String(init.body ?? ''));
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      });
    }

    if (input === '/api/settings/model') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          provider: 'openai-compatible',
          baseUrl: 'https://example.com/v1',
          apiKey: '',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          stream: false,
        }),
      });
    }

    if (input === '/api/files/tree') {
      return Promise.resolve({ ok: true, json: async () => options?.fileTreeData ?? { rootFiles: [], groups: [] } });
    }

    if (input === '/api/chat' && init?.method === 'POST') {
      options?.onChatRequest?.(String(init.body ?? ''));
      const nextReply: MockChatReply = chatReplies.shift() ?? {
        reply: '助手回复',
        session: sessionPayload,
        pendingProposal: null,
      };

      if (isFailedMockChatReply(nextReply)) {
        return Promise.resolve({
          ok: false,
          status: nextReply.status ?? 500,
          json: async () => (options?.chatErrorResponse ? { error: options.chatErrorResponse } : {}),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          reply: nextReply.reply ?? '助手回复',
          session: {
            ...sessionPayload,
            ...nextReply.session,
          },
          pendingProposal: nextReply.pendingProposal ?? null,
        }),
      });
    }

    return Promise.reject(new Error(`Unexpected fetch: ${input}`));
  });

vi.stubGlobal('fetch', fetchMock);
}

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  clearWorkbenchUiStorage();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('App', () => {
  it('keeps tolerated auxiliary fetch failures silent', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(rejectUnexpectedFetch('/api/chat/session')).rejects.toThrow('Unexpected fetch: /api/chat/session');
    await expect(rejectUnexpectedFetch('/api/chat/stream')).rejects.toThrow('Unexpected fetch: /api/chat/stream');
    await expect(rejectUnexpectedFetch('/api/workspace/init')).rejects.toThrow('Unexpected fetch: /api/workspace/init');
    await expect(rejectUnexpectedFetch('/api/not-allowed')).rejects.toThrow('Unexpected fetch: /api/not-allowed');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unexpected fetch:', '/api/not-allowed');

    consoleErrorSpy.mockRestore();
  });

  it('sends the route project id on project-scoped document refresh requests', async () => {
    setupWorkbenchFetchMock();

    renderAppAt('/projects/proj-1');

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: '创作助手' }).length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => input === '/api/file?path=1-%E8%BE%B9%E7%95%8C%2F%E9%A2%84%E6%9C%9F.md')).toBe(true);
    });

    for (const input of ['/api/session', '/api/progress', '/api/files/tree']) {
      const matchingCall = fetchMock.mock.calls.find(([callInput]) => callInput === input);
      expect(matchingCall?.[1]).toMatchObject({
        headers: {
          'x-project-id': 'proj-1',
        },
      });
    }

    const fileReadCall = fetchMock.mock.calls.find(([input]) => input === '/api/file?path=1-%E8%BE%B9%E7%95%8C%2F%E9%A2%84%E6%9C%9F.md');
    expect(fileReadCall?.[1]).toMatchObject({
      headers: {
        'x-project-id': 'proj-1',
      },
    });
  });

  it('sends the switched project id when initializing an unopened project workspace', async () => {
    setupWorkbenchFetchMock({
      session: {
        initialized: false,
        currentStepId: 'define-direction',
        currentModule: 'define',
        currentStepTitle: '新书方向定义',
        waitingForApproval: false,
      },
    });

    window.history.replaceState({}, '', '/');
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 1/ })[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      const initCall = fetchMock.mock.calls.find(([input, requestInit]) => input === '/api/workspace/init' && requestInit?.method === 'POST');
      expect(initCall).toBeDefined();
      expect(initCall?.[1]).toMatchObject({
        headers: {
          'x-project-id': 'proj-1',
        },
      });
    });
  });

  it('bootstraps into the Project Center even if an active project exists', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: {
              id: 'proj-1',
              displayName: 'Test Project 1',
            },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: true,
            },
            requiredProjectReads: ['2-设定/2.1_创意脑暴.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            nextStepId: 'ideation-build',
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: false,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'AuctorForge' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
    });
    
    expect(screen.queryByRole('heading', { name: '创作助手' })).not.toBeInTheDocument();
  });

  it('restores launcher management from the URL query state', async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: null,
            projects: [
              {
                projectId: 'proj-1',
                displayName: 'Test Project 1',
                rootPath: '/tmp/proj-1',
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
                phase: null,
                coreTask: null,
                nextSuggestion: null,
                currentChapterNumber: null,
                lastOpenedDocument: null,
              },
            ],
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: false,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/?panel=manage');

    await waitFor(() => {
      expect(document.querySelector('[data-entry-surface="management-panel"]')).toBeTruthy();
    });

    expect(screen.queryByText(/已选择项目 ·/)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?panel=manage');
  });

  it('restores the selected launcher project from the URL query state', async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: null,
            projects: [
              {
                projectId: 'proj-1',
                displayName: 'Test Project 1',
                rootPath: '/tmp/proj-1',
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
                phase: null,
                coreTask: null,
                nextSuggestion: null,
                currentChapterNumber: null,
                lastOpenedDocument: null,
              },
            ],
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: false,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/?projectId=proj-1');

    await waitFor(() => {
      expect(screen.getByText('已选择项目 · Test Project 1')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?projectId=proj-1');
  });

  it('restores launcher selection and management together from the URL query state', async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: null,
            projects: [
              {
                projectId: 'proj-1',
                displayName: 'Test Project 1',
                rootPath: '/tmp/proj-1',
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
                phase: null,
                coreTask: null,
                nextSuggestion: null,
                currentChapterNumber: null,
                lastOpenedDocument: null,
              },
            ],
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/?projectId=proj-1&panel=manage');

    await waitFor(() => {
      expect(document.querySelector('[data-entry-surface="management-panel"]')).toBeTruthy();
      expect(document.querySelector('[data-entry-surface="project-card"][data-project-state="selected"]')).toHaveTextContent('Test Project 1');
    });

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?projectId=proj-1&panel=manage');
  });

  it('replaces empty launcher project query values with a canonical URL', async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: null,
            projects: [],
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/?projectId=&panel=manage');

    await waitFor(() => {
      expect(document.querySelector('[data-entry-surface="management-panel"]')).toBeTruthy();
    });

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?panel=manage');
  });

  it('replaces malformed workbench URLs with the canonical launcher URL', async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: null,
            projects: [],
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/%E0%A4%A/create');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'AuctorForge' })).toBeInTheDocument();
    });

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
  });

  it('opens the create workbench directly from the workbench route', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: {
              id: 'proj-1',
              displayName: 'Test Project 1',
            },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              {
                id: 'proj-1',
                projectId: 'proj-1',
                displayName: 'Test Project 1',
                rootPath: '/tmp/proj-1',
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
                phase: null,
                coreTask: null,
                nextSuggestion: null,
                currentChapterNumber: null,
                lastOpenedDocument: null,
              },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentMode: 'standard',
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: ['2-设定/2.1_创意脑暴.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            progressSummary: {
              phase: '标准模式',
              coreTask: '定义新书方向',
              nextSuggestion: '创意脑暴',
              callableModules: ['define'],
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: '# 预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/proj-1');

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: '创作助手' }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole('heading', { name: 'AuctorForge' })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/projects/proj-1');
    expect(window.location.search).toBe('');
  });

  it('opens analyze mode directly from the analyze route as a contextual focus inside the same workspace', async () => {
    let analyzeEntered = false;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: {
              id: 'proj-1',
              displayName: 'Test Project 1',
            },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              {
                id: 'proj-1',
                projectId: 'proj-1',
                displayName: 'Test Project 1',
                rootPath: '/tmp/proj-1',
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
                phase: null,
                coreTask: null,
                nextSuggestion: null,
                currentChapterNumber: null,
                lastOpenedDocument: null,
              },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: analyzeEntered ? 'analyze-entry' : 'define-direction',
            currentModule: analyzeEntered ? 'analyze' : 'define',
            currentStepTitle: analyzeEntered ? '样板书分析' : '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: analyzeEntered,
            hasPendingProposal: analyzeEntered,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: analyzeEntered ? 'analyze-entry' : 'define-direction',
              currentModule: analyzeEntered ? 'analyze' : 'define',
              currentStepTitle: analyzeEntered ? '样板书分析' : '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: analyzeEntered,
              hasPendingProposal: analyzeEntered,
            },
            requiredProjectReads: analyzeEntered ? [] : ['1-边界/预期.md'],
            allowedWrites: analyzeEntered ? [] : ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: analyzeEntered ? [] : ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: analyzeEntered ? [] : ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: analyzeEntered ? [] : ['2-设定/2.1_创意脑暴.md'],
            nextStepId: analyzeEntered ? 'analyze-entry' : 'ideation-build',
            pendingProposal: analyzeEntered
              ? {
                  proposedWrites: [{ path: '1-边界/1.1_全书故事梗概.md' }],
                }
              : null,
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/chat') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body).toMatchObject({ message: 'analyze', approved: false });
        analyzeEntered = true;

        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: '已切换到参考分析焦点。',
            session: {
              initialized: true,
              currentStepId: 'analyze-entry',
              currentModule: 'analyze',
              currentStepTitle: '样板书分析',
              currentChapterNumber: 1,
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            pendingProposal: {
              proposedWrites: [{ path: '1-边界/1.1_全书故事梗概.md' }],
            },
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: false,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/proj-1?lens=analyze');

    await waitFor(() => {
      expect(screen.getByText('已切换到参考分析焦点。')).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { name: '创作助手' }).length).toBeGreaterThan(0);
    });

    expect(window.location.pathname).toBe('/projects/proj-1');
    expect(window.location.search).toBe('?lens=analyze');
  });

  it('returns to the launcher URL on browser back from a workbench route', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: {
              id: 'proj-1',
              displayName: 'Test Project 1',
            },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              {
                id: 'proj-1',
                projectId: 'proj-1',
                displayName: 'Test Project 1',
                rootPath: '/tmp/proj-1',
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
                phase: null,
                coreTask: null,
                nextSuggestion: null,
                currentChapterNumber: null,
                lastOpenedDocument: null,
              },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentMode: 'standard',
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            progressSummary: {
              phase: '标准模式',
              coreTask: '定义新书方向',
              nextSuggestion: '创意脑暴',
              callableModules: ['define'],
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: '# 预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    window.history.replaceState({}, '', '/');
    window.history.pushState({}, '', '/projects/proj-1');

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: '创作助手' }).length).toBeGreaterThan(0);
    });

    act(() => {
      window.history.back();
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'AuctorForge' })).toBeInTheDocument();
    });

    expect(window.location.pathname).toBe('/');
  });

  it('renders one workspace with lighter utility rails and the current workflow step after selecting a project and mode', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: {
              id: 'proj-1',
              displayName: 'Test Project 1',
            },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }


      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: true,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            nextStepId: 'ideation-build',
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    const workbenchShell = document.querySelector<HTMLElement>('[data-shell-region="workbench-shell"]');
    const topBar = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="top-bar"]') ?? null;
    const workbenchGrid = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="workbench-grid"]') ?? null;
    const editorWorkspace = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="editor-primary"]') ?? null;
    const assistantDock = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="assistant-dock"]') ?? null;
    const creativeWorkspace = editorWorkspace?.querySelector<HTMLElement>('[data-shell-region="creative-workspace"]') ?? null;
    const topBarInlineContext = getInlineTopContext(workbenchShell ?? document);
    const chatPanel = screen.getByLabelText('创作助手对话区');
    const documentSurface = workbenchShell?.querySelector<HTMLElement>('[data-ui-surface="document"]') ?? null;
    const fileTreeRail = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="file-tree-rail"]') ?? null;
    const workflowRail = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="workflow-rail"]') ?? null;
    const contextRail = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="workbench-context-rail"]') ?? null;
    const workAreaEdge = workbenchShell?.querySelector<HTMLElement>('[data-shell-region="work-area-edge"]') ?? null;
    const topBarPrimary = topBar?.querySelector<HTMLElement>('[data-shell-region="top-bar-primary"]') ?? null;
    const topBarStory = topBar?.querySelector<HTMLElement>('[data-shell-region="top-bar-story"]') ?? null;
    const topBarProject = topBar?.querySelector<HTMLElement>('[data-shell-region="top-bar-project"]') ?? null;
    const topBarContext = topBar?.querySelector<HTMLElement>('[data-shell-region="top-bar-context"]') ?? null;
    const topBarControls = within(topBar as HTMLElement).getByRole('toolbar', { name: '工作台控制区' });
    const topBarIntent = topBar?.querySelector<HTMLElement>('[data-ui-intent-weight="supporting"]') ?? null;
    const topBarStatusChip = topBar?.querySelector<HTMLElement>('[data-topbar-chip-style]') ?? null;
    const backButton = screen.getByRole('button', { name: '返回' });
    const settingsButton = screen.getByRole('button', { name: '模型配置' });

    expect(workbenchShell).toHaveAttribute('data-ui-layer', 'shell');
    expect(workbenchShell).toHaveAttribute('data-shell-region', 'workbench-shell');
    expect(workbenchShell).toHaveAttribute('data-ui-surface', 'workbench-shell');
    expect(workbenchShell).toHaveAttribute('data-shell-structure', 'quiet-environment');
    expect(workbenchShell).toHaveAttribute('data-workbench-context', 'single-workspace');
    expect(screen.getByLabelText('工作台顶部栏')).toBe(topBar);
    expect(topBar).not.toBeNull();
    expect(workbenchGrid).not.toBeNull();
    expect(editorWorkspace).not.toBeNull();
    expect(assistantDock).not.toBeNull();
    expect(creativeWorkspace).not.toBeNull();
    expect(document.querySelector('[data-shell-region="continuity-strip"]')).toBeNull();
    expect(topBarInlineContext).toBeNull();
    expect(fileTreeRail).toBeNull();
    expect(workflowRail).toBeNull();
    expect(contextRail).toBeNull();
    expect(workAreaEdge).toBeNull();
    expect(topBar).toHaveAttribute('data-ui-surface', 'top-bar');
    expect(topBar).toHaveAttribute('data-topbar-layout', 'compact-navigation');
    expect(topBar).toHaveAttribute('data-topbar-tone', 'supportive-editorial');
    expect(topBar).toHaveAttribute('data-shell-chrome', 'quiet');
    expect(topBar).toHaveAttribute('data-shell-cohesion', 'sunken-band');
    expect(workbenchGrid).toHaveAttribute('data-ui-surface', 'workbench-grid');
    expect(workbenchGrid).toHaveAttribute('data-workbench-layout', 'editor-primary');
    expect(workbenchGrid).toHaveAttribute('data-shell-balance', 'creative-dominant');
    expect(workbenchGrid).toHaveAttribute('data-shell-continuity', 'shared-environment');
    expect(workbenchGrid).toHaveAttribute('data-context-rail-state', 'closed');
    expect(workbenchGrid).toHaveAttribute('data-context-rail-panel', 'none');
    expect(editorWorkspace).toHaveAttribute('data-shell-role', 'primary-editor');
    expect(editorWorkspace).toHaveAttribute('data-ui-surface', 'editor-primary');
    expect(editorWorkspace).toHaveAttribute('data-shell-tone', 'manuscript-stage');
    expect(editorWorkspace).toHaveAttribute('data-shell-frame', 'single-canvas');
    expect(assistantDock).not.toHaveAttribute('data-ui-surface');
    expect(assistantDock).toHaveAttribute('data-shell-tone', 'collaborator-dock');
    expect(assistantDock).toHaveAttribute('data-shell-balance', 'supporting');
    expect(assistantDock).toHaveAttribute('data-dock-relationship', 'attached');
    expect(assistantDock).toHaveAttribute('data-shell-continuity', 'manuscript-linked');
    expect(assistantDock).toHaveAttribute('data-shell-cohesion', 'live-band');
    expect(creativeWorkspace).toHaveAttribute('data-shell-balance', 'creative-dominant');
    expect(creativeWorkspace).toHaveAttribute('data-shell-composition', 'maximized-writing-surface');
    expect(creativeWorkspace).toHaveAttribute('data-workbench-split-state', 'idle');
    expect(creativeWorkspace?.style.getPropertyValue('--workbench-assistant-split-ratio')).toBe('0.18');
    expect(readCustomProperty(creativeWorkspace, '--workbench-split-handle-width')).toBe('10px');
    expect(editorWorkspace).toContainElement(assistantDock);
    expect(screen.getByRole('separator', { name: '调整编辑区和创作助手宽度' })).toHaveAttribute(
      'data-workbench-split-handle',
      'editor-assistant',
    );
    expect(editorWorkspace?.querySelector('[data-editor-surface="tab-strip"]')).toHaveAttribute('data-editor-chrome', 'contextual-navigation');
    expect(editorWorkspace?.querySelector('[data-editor-surface="tab-strip"]')).toHaveAttribute('data-editor-edge', 'attached');
    expect(editorWorkspace?.querySelector('[data-editor-surface="document-shell"]')).not.toBeNull();
    expect(editorWorkspace?.querySelector('[data-editor-surface="document-shell"]')?.querySelector('[data-editor-surface="manuscript-meta"]')).toBeNull();
    expect(assistantDock?.querySelector('[data-ui-surface="chat-panel"]')).not.toBeNull();
    expect(chatPanel).toHaveAttribute('data-ui-surface', 'chat-panel');
    expect(chatPanel).toHaveAttribute('data-chat-tone', 'collaborator-dock');
    expect(chatPanel).toHaveAttribute('data-chat-frame', 'integrated-dock');
    expect(chatPanel).toHaveAttribute('data-chat-relationship', 'manuscript-attached');
    expect(chatPanel).toHaveAttribute('data-chat-shell-link', 'continuity-band');
    expect(documentSurface).toHaveAttribute('data-ui-surface', 'document');
    expect(within(topBar as HTMLElement).getByRole('button', { name: '打开文稿导航' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '展开文件树' })).not.toBeInTheDocument();
    expect(within(topBar as HTMLElement).getByRole('button', { name: '打开流程状态' })).toHaveAttribute('aria-expanded', 'false');
    expect(topBarStory).not.toBeNull();
    expect(topBarPrimary).not.toBeNull();
    expect(topBarProject).not.toBeNull();
    expect(topBarContext).not.toBeNull();
    expect(topBarIntent).not.toBeNull();
    expect(topBarProject).toHaveAttribute('data-context-tone', 'embedded');
    expect(topBarStory).toHaveAttribute('data-topbar-layout', 'continuous');
    expect(topBarStatusChip).toHaveAttribute('data-topbar-chip-style', 'muted');
    expect(backButton).toHaveAttribute('data-topbar-control-style', 'ambient');
    expect(settingsButton).toHaveAttribute('data-topbar-control-style', 'ambient');
    expect(topBarIntent).toHaveAttribute('data-ui-intent-weight', 'supporting');
    expect(topBarIntent).not.toBeEmptyDOMElement();
    expect(within(topBar as HTMLElement).queryByText('当前推进')).not.toBeInTheDocument();
    expect(within(topBar as HTMLElement).queryByText('接续目标')).not.toBeInTheDocument();
    expect(within(topBar as HTMLElement).getByText('Test Project 1')).toBeInTheDocument();
    expect(within(topBar as HTMLElement).getByRole('navigation', { name: '页面导航' })).toHaveTextContent('新书方向定义');
    expect(topBarControls).toHaveAttribute('role', 'toolbar');
    expect(topBarControls).toHaveAttribute('aria-label', '工作台控制区');
    expect(within(topBarControls as HTMLElement).getByRole('button', { name: '模型配置' })).toBe(settingsButton);
    expect(topBarControls).not.toContainElement(topBarStatusChip);
    expect(within(topBar as HTMLElement).getByRole('navigation', { name: '页面导航' })).toHaveAttribute('data-breadcrumb-tone', 'embedded');
    expect(consoleErrorSpy.mock.calls).not.toContainEqual(['Unexpected fetch:', '/api/settings/model']);
    expect(consoleErrorSpy.mock.calls).not.toContainEqual(['Unexpected fetch:', '/api/files/tree']);

    consoleErrorSpy.mockRestore();
  });

  it('keeps one lightweight top-bar intent across workbench contexts', async () => {
    setupWorkbenchFetchMock({
      session: {
        currentModule: 'analyze',
        currentStepTitle: '参考分析与整理',
      },
    });

    await bootstrapApp('analyze');

    const topBarIntent = document.querySelector<HTMLElement>('[data-shell-region="top-bar"] [data-ui-intent-weight="supporting"]');

    expect(topBarIntent).not.toBeNull();
    expect(topBarIntent).toHaveAttribute('data-ui-intent-weight', 'supporting');
    expect(topBarIntent).not.toBeEmptyDOMElement();
  });

  it('renders a desktop split handle between the editor and creative assistant', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
    });

    await bootstrapWorkbenchShell();

    const handle = screen.getByRole('separator', { name: '调整编辑区和创作助手宽度' });

    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('data-workbench-split-handle', 'editor-assistant');
  });

  it('updates and persists the assistant split ratio after dragging the handle', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
    });

    await bootstrapWorkbenchShell();
    const creativeWorkspace = stubCreativeWorkspaceRect({ left: 0, top: 0, width: 1000, height: 720 });
    const handle = screen.getByRole('separator', { name: '调整编辑区和创作助手宽度' });
    stubPointerCapture(handle);

    dispatchPointerEvent(handle, 'pointerdown', {
      button: 0,
      clientX: 820,
      clientY: 360,
      pointerId: 21,
      pointerType: 'mouse',
      isPrimary: true,
    });
    dispatchPointerEvent(handle, 'pointermove', {
      buttons: 1,
      clientX: 680,
      clientY: 360,
      pointerId: 21,
      pointerType: 'mouse',
      isPrimary: true,
    });
    dispatchPointerEvent(handle, 'pointerup', {
      button: 0,
      clientX: 680,
      clientY: 360,
      pointerId: 21,
      pointerType: 'mouse',
      isPrimary: true,
    });

    expect(creativeWorkspace.style.getPropertyValue('--workbench-assistant-split-ratio')).toBe('0.318');
    expect(window.localStorage.getItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY)).toBe('0.318');
  });

  it('clamps an oversized saved split ratio back into the safe assistant range', async () => {
    window.localStorage.setItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY, JSON.stringify(0.98));

    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
    });

    await bootstrapWorkbenchShell();

    const creativeWorkspace = document.querySelector<HTMLElement>('[data-shell-region="creative-workspace"]');

    expect(creativeWorkspace?.style.getPropertyValue('--workbench-assistant-split-ratio')).toBe('0.42');
  });

  it('resets the global split ratio on handle double click', async () => {
    window.localStorage.setItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY, JSON.stringify(0.36));

    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
    });

    await bootstrapWorkbenchShell();

    const creativeWorkspace = document.querySelector<HTMLElement>('[data-shell-region="creative-workspace"]');
    const handle = screen.getByRole('separator', { name: '调整编辑区和创作助手宽度' });

    fireEvent.doubleClick(handle);

    expect(creativeWorkspace?.style.getPropertyValue('--workbench-assistant-split-ratio')).toBe('0.18');
    expect(window.localStorage.getItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY)).toBeNull();
  });

  it('keeps the top chrome compact instead of rendering a second workflow-context band', async () => {
    setupWorkbenchFetchMock({
      progress: {
        allowedWrites: [],
        strictWorkflowWrites: [],
        chatAllowedWrites: ['3-正文/3.2_聊天收束.md'],
        manualWritablePaths: ['5-正文/5.3_手动收束.md'],
        nextStepId: 'ideation-build',
        progressSummary: {
          phase: '标准模式',
          coreTask: '定义新书方向',
          nextSuggestion: '创意脑暴',
          callableModules: ['define'],
        },
      },
    });

    await bootstrapApp();
    fireEvent.click(getTopBarControl('打开流程状态'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'workflow');
    });

    const topBar = document.querySelector<HTMLElement>('[data-shell-region="top-bar"]');
    const inlineTopContext = getInlineTopContext();
    const workflowSummary = document.querySelector<HTMLElement>('[data-shell-region="workflow-hero"] [data-workflow-summary="inline-context"]');
    const nextWrite = document.querySelector<HTMLElement>('[data-workflow-action="next-write"]');

    expect(document.querySelector('[data-shell-region="continuity-strip"]')).toBeNull();
    expect(topBar).toHaveAttribute('data-topbar-layout', 'compact-navigation');
    expect(inlineTopContext).toBeNull();
    expect(workflowSummary).toBeInTheDocument();
    expect(workflowSummary).toHaveTextContent('当前文档：');
    expect(workflowSummary).toHaveTextContent('围绕正文继续推进');
    expect(workflowSummary).toHaveTextContent('等待下一步');
    expect(workflowSummary).toHaveTextContent('下一目标：3.2_聊天收束.md');
    expect(workflowSummary).toHaveTextContent('3-正文/3.2_聊天收束.md');
    expect(workflowSummary).not.toHaveTextContent('下一目标：3-正文/3.2_聊天收束.md');
    expect(nextWrite).toHaveTextContent('3-正文/3.2_聊天收束.md');
    expect(within(topBar as HTMLElement).queryByText('当前推进')).not.toBeInTheDocument();
    expect(within(topBar as HTMLElement).queryByText('接续目标')).not.toBeInTheDocument();
    expect(within(topBar as HTMLElement).getByRole('navigation', { name: '页面导航' })).toHaveTextContent('新书方向定义');
  });

  it('keeps workflow summary target precedence aligned with the panel when strict targets are absent', async () => {
    setupWorkbenchFetchMock({
      progress: {
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: undefined,
        chatAllowedWrites: ['3-正文/3.2_聊天收束.md'],
        manualWritablePaths: ['5-正文/5.3_手动收束.md'],
        nextStepId: 'ideation-build',
        progressSummary: {
          phase: '标准模式',
          coreTask: '定义新书方向',
          nextSuggestion: '创意脑暴',
          callableModules: ['define'],
        },
      },
    });

    await bootstrapApp();
    fireEvent.click(getTopBarControl('打开流程状态'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'workflow');
    });

    const workflowSummary = document.querySelector<HTMLElement>('[data-shell-region="workflow-hero"] [data-workflow-summary="inline-context"]');
    const workflowAction = document.querySelector<HTMLElement>('[data-workflow-action="next-write"]');

    expect(workflowSummary).toBeInTheDocument();
    expect(workflowSummary).toHaveTextContent('下一目标：2.1_创意脑暴.md');
    expect(workflowSummary).toHaveTextContent('2-设定/2.1_创意脑暴.md');
    expect(workflowSummary).not.toHaveTextContent('3.2_聊天收束.md');
    expect(workflowSummary).not.toHaveTextContent('5.3_手动收束.md');
    expect(workflowAction).toHaveTextContent('2-设定/2.1_创意脑暴.md');
  });

  it('keeps context rail closed by default with only top-bar controls exposed', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
      progress: {
        requiredProjectReads: ['1-边界/预期.md'],
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
        manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
      },
    });

    await bootstrapWorkbenchShell();

    const topBar = screen.getByLabelText('工作台顶部栏');

    expect(within(topBar).getByRole('button', { name: '打开文稿导航' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(topBar).getByRole('button', { name: '打开流程状态' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-shell-region="work-area-edge"]')).toBeNull();
    expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
  });

  it('renders a dedicated startup screen before workspace initialization', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: false,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: false,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: [],
            allowedWrites: [],
            nextStepId: 'ideation-build',
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'AuctorForge' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 1/ })[0]);

    expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /进入参考模式/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '创作助手' })).not.toBeInTheDocument();

    const entryShell = document.querySelector<HTMLElement>('[data-ui-surface="entry"]');
    const hero = document.querySelector<HTMLElement>('[data-entry-surface="hero"]');
    const recentProjects = document.querySelector<HTMLElement>('[data-entry-surface="recent-projects"]');
    const startPaths = document.querySelector<HTMLElement>('[data-entry-surface="start-paths"]');
    const managementEntry = document.querySelector<HTMLElement>('[data-entry-surface="management-entry"]');

    expect(entryShell).toHaveAttribute('data-ui-layer', 'entry');
    expect(hero).not.toBeNull();
    expect(recentProjects).not.toBeNull();
    expect(startPaths).not.toBeNull();
    expect(managementEntry).toBeNull();
    expect(readCustomProperty(hero, '--ui-entry-treatment')).toBe('hero-flow');
    expect(readCustomProperty(recentProjects, '--ui-entry-treatment')).toBe('supporting-entry');
    expect(readCustomProperty(startPaths, '--ui-entry-treatment')).toBe('supporting-entry');
  });

  it('shows a loading gate before the workspace bootstrap completes after selecting a project', async () => {
    let resolveSession: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }


      if (input === '/api/session') {
        return new Promise((resolve) => {
          resolveSession = resolve;
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: false,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: [],
            allowedWrites: [],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Test Project 1')[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Test Project 1')[0].closest('button')!);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(screen.getByText('正在读取工作区...')).toBeInTheDocument();
    });
    expect(screen.queryByText('标准模式')).not.toBeInTheDocument();

    resolveSession?.({
      ok: true,
      json: async () => ({
        initialized: false,
        currentStepId: 'define-direction',
        currentModule: 'define',
        currentStepTitle: '新书方向定义',
        waitingForApproval: false,
      }),
    });
  });

  it('refreshes workflow guidance after saving a document', async () => {
    let progressCallCount = 0;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'write-chapter',
            currentModule: 'write',
            currentStepTitle: '单章正文写作',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        progressCallCount += 1;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: [],
            allowedWrites: ['4-正文/第001章_草稿.md'],
            strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
            chatAllowedWrites: ['4-正文/第001章_草稿.md'],
            manualWritablePaths: ['4-正文/第001章_草稿.md'],
            nextStepId: 'review-chapter',
            progressSummary: progressCallCount === 1
              ? {
                  phase: '正文写作',
                  coreTask: '完成第001章草稿',
                  nextSuggestion: '第001章草稿',
                  callableModules: ['write'],
                }
              : {
                  phase: '章节收束',
                  coreTask: '决定是继续修订第001章，还是进入下一章',
                  nextSuggestion: '第002章草稿',
                  callableModules: ['write', 'review'],
                },
            pendingProposal: null,
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '4-正文/第001章_草稿.md',
            content: '# 第001章草稿',
          }),
        });
      }

      if (input === '/api/file' && init?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            session: {
              initialized: true,
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    expandWorkflowRailIfCollapsed();

    await waitFor(() => {
      expect(screen.getByText('正文写作 · 完成第001章草稿')).toBeInTheDocument();
    });

    fireEvent.change(getCurrentDocumentEditor(), { target: { value: '# 第001章草稿\n\n更新后的正文。' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存当前文档' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '保存当前文档' }));

    await waitFor(() => {
      expect(screen.getByText('章节收束 · 决定是继续修订第001章，还是进入下一章')).toBeInTheDocument();
      expect(screen.getAllByText('下一步：第002章草稿').length).toBeGreaterThan(0);
    });
  });

  it('falls back to the first writable document when the primary read target is missing', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'ideation-build',
            currentModule: 'ideation',
            currentStepTitle: '创意孵化与设定构建',
            waitingForApproval: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'ideation-build',
              currentModule: 'ideation',
              currentStepTitle: '创意孵化与设定构建',
              waitingForApproval: true,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.2_新书设定案.md'],
            strictWorkflowWrites: ['2-设定/2.2_新书设定案.md'],
            chatAllowedWrites: ['2-设定/2.2_新书设定案.md'],
            manualWritablePaths: ['2-设定/2.2_新书设定案.md'],
            nextStepId: 'outline-plan',
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'not found' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    await waitFor(() => {
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('2-设定/2.2_新书设定案.md');
      expect(getCurrentDocumentEditor()).toHaveValue('');
    });
  });

  it('shows the pending write proposal in the workflow panel and opens its preview in the editor', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: true,
            hasPendingProposal: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
            nextStepId: 'ideation-build',
            pendingProposal: {
              proposedWrites: [
                { path: '2-设定/2.1_创意脑暴.md', content: '# 提案中的创意脑暴' },
                { path: '1-边界/1.2_文风.md' },
              ],
            },
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    expandWorkflowRailIfCollapsed();

    await waitFor(() => {
      const inlineTopContext = getInlineTopContext();
      const chatPanel = document.querySelector<HTMLElement>('[data-ui-surface="chat-panel"]');
      const proposalNotice = chatPanel?.querySelector('[data-chat-surface="proposal-notice"]');
      expect(document.querySelector('[data-workflow-card="context-fold"][data-workflow-tone="proposal"]')).not.toBeNull();
      expect(screen.getAllByText('2-设定/2.1_创意脑暴.md').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('1-边界/1.2_文风.md').length).toBeGreaterThanOrEqual(2);
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('2-设定/2.1_创意脑暴.md');
      expect(getCurrentDocumentEditor()).toHaveValue('# 提案中的创意脑暴');
      expect(screen.getByRole('button', { name: '保存当前文档' })).toBeDisabled();
      expect(document.querySelector('[data-editor-surface="readonly-note"]')).not.toBeNull();
      expect(chatPanel).not.toBeNull();
      expect(chatPanel).toHaveAttribute('data-chat-context-state', 'proposal-pending');
      expect(proposalNotice).not.toBeNull();
      expect(proposalNotice?.closest('[data-ui-surface="chat-panel"]')).toBe(chatPanel);
      expect(proposalNotice).toHaveTextContent('2.1_创意脑暴.md');
      expect(proposalNotice).not.toHaveTextContent('预期.md');
      expect(inlineTopContext).toBeNull();
    });
  });

  it('does not restore the removed inline top-context row when the current manuscript has unsaved changes', async () => {
    setupWorkbenchFetchMock();

    await bootstrapApp();

    const editor = screen.getAllByLabelText('当前文档编辑器')[0];
    fireEvent.change(editor, { target: { value: '# 新书预期\n\n补充一段草稿。' } });

    await waitFor(() => {
      const inlineTopContext = getInlineTopContext();
      expect(editor).toHaveValue('# 新书预期\n\n补充一段草稿。');
      expect(inlineTopContext).toBeNull();
    });
  });

  it('keeps proposal preview in the editor without reviving the removed inline top-context row', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([{ projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: true,
            hasPendingProposal: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            progressSummary: {
              phase: '标准模式',
              coreTask: '定义新书方向',
              nextSuggestion: '创意脑暴',
              callableModules: ['define'],
            },
            pendingProposal: {
              proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案内容' }],
            },
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            rootFiles: [
              { id: 'expectation', label: '预期.md', path: '1-边界/预期.md' },
              { id: 'proposal', label: '2.1_创意脑暴.md', path: '2-设定/2.1_创意脑暴.md' },
            ],
            groups: [],
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        const path = decodeURIComponent(input.split('path=')[1] ?? '');
        if (path === '2-设定/2.1_创意脑暴.md') {
          return Promise.resolve({ ok: true, json: async () => ({ path, content: '# 已落盘旧稿' }) });
        }

        return Promise.resolve({ ok: true, json: async () => ({ path: '1-边界/预期.md', content: '# 新书预期' }) });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ provider: 'openai-compatible', baseUrl: 'https://example.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7, stream: true }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    fireEvent.click(getTopBarControl('打开文稿导航'));

    fireEvent.click(screen.getByLabelText('主控文件 2.1_创意脑暴.md'));

    await waitFor(() => {
      const inlineTopContext = getInlineTopContext();
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('2-设定/2.1_创意脑暴.md');
      expect(getCurrentDocumentEditor()).toHaveValue('# 提案内容');
      expect(getCurrentDocumentEditor()).not.toHaveValue('# 已落盘旧稿');
      expect(document.querySelector('[data-editor-surface="readonly-note"]')).not.toBeNull();
      expect(inlineTopContext).toBeNull();
    }, { timeout: 5000 });
  }, 10000);

  it('opens the proposal preview when pendingProposal exists and reference files are missing', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: true,
            hasPendingProposal: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            pendingProposal: {
              proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案内容' }],
            },
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'not found' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    expandWorkflowRailIfCollapsed();

    await waitFor(() => {
      expect(document.querySelector('[data-workflow-card="context-fold"][data-workflow-tone="proposal"]')).not.toBeNull();
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('2-设定/2.1_创意脑暴.md');
      expect(getCurrentDocumentEditor()).toHaveValue('# 提案内容');
      expect(document.querySelector('[data-editor-surface="readonly-note"]')).not.toBeNull();
    });
  });

  it('opens a newly generated proposal preview after chat refresh instead of preserving the previous reference document', async () => {
    const pendingProposal = {
      proposedWrites: [
        { path: '4-正文/第001章_草稿.md', content: '# 第1章 逼债与绝境\n\n沈砚推门入夜。' },
      ],
    };
    let hasGeneratedProposal = false;

    setupWorkbenchFetchMock({
      session: {
        currentStepId: 'write-chapter',
        currentModule: 'write',
        currentStepTitle: '单章正文写作',
      },
      progress: {
        requiredProjectReads: ['3-大纲/第01卷_章纲.md'],
        allowedWrites: ['4-正文/第001章_草稿.md'],
        strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
        chatAllowedWrites: ['4-正文/第001章_草稿.md'],
        manualWritablePaths: ['4-正文/第001章_草稿.md'],
        pendingProposal: null,
      },
      fileContentByPath: {
        '3-大纲/第01卷_章纲.md': '# 第一卷章纲',
      },
      chatReplies: [
        {
          reply: '已生成待确认提案。',
          session: {
            currentStepId: 'write-chapter',
            currentModule: 'write',
            currentStepTitle: '单章正文写作',
            waitingForApproval: true,
            hasPendingProposal: true,
          },
          pendingProposal,
        },
      ],
      onChatRequest: () => {
        hasGeneratedProposal = true;
      },
    });

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              {
                id: 'proj-1',
                displayName: 'Test Project 1',
                rootPath: '/tmp/proj-1',
                lastOpenedAt: new Date().toISOString(),
                status: 'ready',
              },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'write-chapter',
            currentModule: 'write',
            currentStepTitle: '单章正文写作',
            waitingForApproval: hasGeneratedProposal,
            hasPendingProposal: hasGeneratedProposal,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              waitingForApproval: hasGeneratedProposal,
              hasPendingProposal: hasGeneratedProposal,
            },
            requiredProjectReads: ['3-大纲/第01卷_章纲.md'],
            allowedWrites: ['4-正文/第001章_草稿.md'],
            strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
            chatAllowedWrites: ['4-正文/第001章_草稿.md'],
            manualWritablePaths: ['4-正文/第001章_草稿.md'],
            nextStepId: null,
            pendingProposal: hasGeneratedProposal ? pendingProposal : null,
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        const requestedPath = new URL(input, window.location.origin).searchParams.get('path') ?? '';
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: requestedPath,
            content: requestedPath === '3-大纲/第01卷_章纲.md' ? '# 第一卷章纲' : '',
          }),
        });
      }

      if (input === '/api/chat/session' && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [{ role: 'assistant', content: '已载入项目会话。' }],
            writeTargetHint: defaultWriteTargetHint,
          }),
        });
      }

      if (input === '/api/chat/session' && init?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [{ role: 'assistant', content: '已载入项目会话。' }],
            writeTargetHint: defaultWriteTargetHint,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: false,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input === '/api/chat' && init?.method === 'POST') {
        hasGeneratedProposal = true;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: '已生成待确认提案。',
            session: {
              initialized: true,
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            pendingProposal,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    await waitFor(() => {
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('3-大纲/第01卷_章纲.md');
    });

    fireEvent.change(screen.getByLabelText('聊天输入框'), {
      target: { value: '请生成第1章正文提案' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('4-正文/第001章_草稿.md');
      expect(getCurrentDocumentEditor()).toHaveValue('# 第1章 逼债与绝境\n\n沈砚推门入夜。');
      expect(document.querySelector('[data-editor-surface="readonly-note"]')).not.toBeNull();
    });
  });

  it('does not create an orphan dirty draft when editing with no loaded document', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([{ projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: true,
            hasPendingProposal: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            pendingProposal: {
              proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案内容' }],
            },
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'not found' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    expandWorkflowRailIfCollapsed();

    const editor = getCurrentDocumentEditor();
    fireEvent.change(editor, { target: { value: '不应落入空路径草稿' } });

    await waitFor(() => {
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('2-设定/2.1_创意脑暴.md');
      expect(editor).toHaveValue('# 提案内容');
      expect(document.querySelectorAll('[data-editor-surface="dirty-marker"]')).toHaveLength(0);
      expect(document.querySelector('[data-editor-surface="readonly-note"]')).not.toBeNull();
    });
  });

  it('does not crash saveability checks when allowedWrites is absent', async () => {
    setupWorkbenchFetchMock({
      progress: {
        allowedWrites: undefined,
        manualWritablePaths: ['1-边界/预期.md'],
      },
    });

    await bootstrapApp();

    expect(getCurrentDocumentEditor()).toBeInTheDocument();
    expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('1-边界/预期.md');

    fireEvent.change(getCurrentDocumentEditor(), { target: { value: '# 新书预期\n\n补充一行。' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存当前文档' })).toBeEnabled();
    });
  });

  it('allows manually opened project files outside workflow write targets to be edited and saved', async () => {
    const currentPath = '2-设定/角色资料/配角.md';
    const savedBodies: string[] = [];

    setupWorkbenchFetchMock({
      progress: {
        requiredProjectReads: [currentPath],
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
        manualWritablePaths: [],
      },
      fileContentByPath: {
        [currentPath]: '# 配角\n\n旧设定',
      },
      onFileSave: (body) => savedBodies.push(body),
    });

    await bootstrapApp();

    expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe(currentPath);

    fireEvent.change(getCurrentDocumentEditor(), { target: { value: '# 配角\n\n新设定' } });

    const saveButton = screen.getByRole('button', { name: '保存当前文档' });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(savedBodies.at(-1)).toBe(JSON.stringify({ path: currentPath, content: '# 配角\n\n新设定' }));
    });
  });

  it('does not auto-approve ordinary continue messages', async () => {
    let progressCallCount = 0;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'write-chapter',
            currentModule: 'write',
            currentStepTitle: '单章正文写作',
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        progressCallCount += 1;
        if (progressCallCount > 1) {
          expect(init?.headers).toMatchObject({
            'x-active-document-path': encodeURIComponent('3-大纲/第01卷_章纲.md'),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: ['3-大纲/第01卷_章纲.md'],
            allowedWrites: ['4-正文/第001章_草稿.md'],
            strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
            chatAllowedWrites: ['4-正文/第001章_草稿.md'],
            manualWritablePaths: ['4-正文/第001章_草稿.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '3-大纲/第01卷_章纲.md',
            content: '# 章纲',
          }),
        });
      }

      if (input === '/api/chat') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.approved).toBe(false);
        expect(body.activeDocumentPath).toBe('3-大纲/第01卷_章纲.md');

        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: '已收到，先生成提案。',
            session: {
              initialized: true,
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    await waitFor(() => {
      expect(document.body.textContent).toContain('单章正文写作');
    });

    fireEvent.change(screen.getByLabelText('聊天输入框'), {
      target: { value: '继续优化这一章，但先别落盘' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(screen.getByText('已收到，先生成提案。')).toBeInTheDocument();
    });
  });

  it('shows workflow guidance cards and current chapter label in the workbench', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'write-chapter',
            currentModule: 'write',
            currentStepTitle: '单章正文写作',
            currentChapterNumber: 3,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              currentChapterNumber: 3,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: ['3-大纲/第01卷_章纲.md'],
            allowedWrites: ['4-正文/第003章_草稿.md'],
            strictWorkflowWrites: ['4-正文/第003章_草稿.md'],
            chatAllowedWrites: ['4-正文/第003章_草稿.md'],
            manualWritablePaths: ['4-正文/第003章_草稿.md'],
            nextStepId: 'review-chapter',
            progressSummary: {
              phase: '章节收束',
              coreTask: '决定是继续修订第003章，还是进入下一章',
              nextSuggestion: '第004章草稿',
              callableModules: ['write', 'review'],
              assetPointers: [
                { section: '世界索引', label: '新书设定', path: '2-设定/2.2_新书设定案.md' },
                { section: '大纲索引', label: '总纲', path: '3-大纲/3.1_全书结构总纲.md' },
              ],
            },
            pendingProposal: null,
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '3-大纲/第01卷_章纲.md',
            content: '# 章纲',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    expandWorkflowRailIfCollapsed();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
      expect(screen.getByText('模型未配置')).toBeInTheDocument();
      expect(screen.getByText('当前章节：第003章')).toBeInTheDocument();
      expect(screen.getByText('章节收束 · 决定是继续修订第003章，还是进入下一章')).toBeInTheDocument();
      expect(document.querySelector('[data-workflow-action="current-task"]')).toBeNull();
      expect(document.querySelector('[data-workflow-action="next-write"]')).toHaveTextContent('4-正文/第003章_草稿.md');
      expect(document.querySelector('[data-workflow-action="blocking"]')).toHaveTextContent('3-大纲/第01卷_章纲.md');
      expect(document.body.textContent).toContain('关键资产：新书设定');
      expect(document.body.textContent).toContain('关键资产：总纲');
      expect(document.body.textContent).toContain('2-设定/2.2_新书设定案.md');
      expect(document.body.textContent).toContain('3-大纲/3.1_全书结构总纲.md');
    expect(screen.queryByRole('button', { name: /继续当前项目创作/ })).not.toBeInTheDocument();
    });
  });

  it('starts the unified creative entry from the startup screen', async () => {
    let initialized = false;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized,
            currentMode: 'standard',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized,
              currentMode: 'standard',
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: [],
            allowedWrites: initialized ? ['2-设定/2.1_创意脑暴.md'] : [],
            strictWorkflowWrites: initialized ? ['2-设定/2.1_创意脑暴.md'] : [],
            chatAllowedWrites: initialized ? ['2-设定/2.1_创意脑暴.md'] : [],
            manualWritablePaths: initialized ? ['2-设定/2.1_创意脑暴.md'] : [],
            nextStepId: 'ideation-build',
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/workspace/init') {
        initialized = true;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'missing' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);
    await bootstrapApp();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '创作助手' })).toBeInTheDocument();
      expect(screen.getByText(/我们先从统一创作入口开始/)).toBeInTheDocument();
    });
  });

  it('returns to the launcher when the top-bar back button is clicked', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentMode: 'standard',
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            progressSummary: {
              phase: '标准模式',
              coreTask: '定义新书方向',
              nextSuggestion: '创意脑暴',
              callableModules: ['define'],
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: '# 预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'AuctorForge' })).toBeInTheDocument();
      expect(screen.getByText('已选择项目 · Test Project 1')).toBeInTheDocument();
    });

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?projectId=proj-1');
  });

  it('opens an explicit dialog before closing a dirty editor tab', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    let saveCalls = 0;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'write-chapter',
            currentModule: 'write',
            currentStepTitle: '单章正文写作',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentMode: 'standard',
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: [],
            allowedWrites: ['4-正文/第001章_草稿.md'],
            strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
            chatAllowedWrites: ['4-正文/第001章_草稿.md'],
            manualWritablePaths: ['4-正文/第001章_草稿.md'],
            nextStepId: 'review-chapter',
            progressSummary: {
              phase: '正文写作',
              coreTask: '完成第001章草稿',
              nextSuggestion: '第001章草稿',
              callableModules: ['write'],
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '4-正文/第001章_草稿.md', content: '# 第001章草稿' }),
        });
      }

      if (input === '/api/file' && init?.method === 'PUT') {
        saveCalls += 1;
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);
    await bootstrapApp();

    await waitFor(() => {
      expect(getCurrentDocumentEditor()).toBeInTheDocument();
    });

    fireEvent.change(getCurrentDocumentEditor(), { target: { value: '# 已修改草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '关闭 4-正文/第001章_草稿.md' }));

    expect(globalThis.confirm).not.toHaveBeenCalled();

    const closeDialog = await screen.findByRole('dialog', { name: '未保存的更改' });
    expect(closeDialog).toHaveAttribute('aria-modal', 'true');
    expect(within(closeDialog).getByText('“4-正文/第001章_草稿.md” 有未保存的更改。')).toBeInTheDocument();

    fireEvent.click(within(closeDialog).getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '未保存的更改' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '关闭 4-正文/第001章_草稿.md' })).toBeInTheDocument();
    expect(saveCalls).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '关闭 4-正文/第001章_草稿.md' }));
    const reopenedDialog = await screen.findByRole('dialog', { name: '未保存的更改' });
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: '保存并关闭' }));

    await waitFor(() => {
      expect(saveCalls).toBe(1);
      expect(screen.queryByRole('button', { name: '关闭 4-正文/第001章_草稿.md' })).not.toBeInTheDocument();
    });
  });

  it('aborts save-and-switch when saving dirty files fails', async () => {
    let activeProject = 'proj-1';
    const openCalls: string[] = [];

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        openCalls.push(body.projectId);
        activeProject = body.projectId;
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            { projectId: 'proj-2', displayName: 'Test Project 2', lastOpenedAt: new Date().toISOString(), status: 'ready' },
          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: activeProject === 'proj-1' ? '# 项目一预期' : '# 项目二预期',
          }),
        });
      }

      if (input === '/api/file' && init?.method === 'PUT') {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'save failed' }) });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/proj-1');

    await waitFor(() => {
      expect(screen.getAllByLabelText('当前文档编辑器').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getAllByLabelText('当前文档编辑器')[0], { target: { value: '# 已修改项目一预期' } });
    await waitFor(() => {
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 已修改项目一预期');
      expect(document.querySelectorAll('[data-editor-surface="dirty-marker"]').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 2/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 2/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });

    const switchDialog = document.querySelector('dialog[data-overlay-surface="switch-dialog"]') as HTMLDialogElement | null;
    expect(switchDialog).not.toBeNull();
    expect(switchDialog).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(switchDialog).toHaveAttribute('open');
    });

    fireEvent.click(within(switchDialog as HTMLElement).getByRole('button', { name: '保存并切换' }));

    await waitFor(() => {
      expect(screen.getByText('保存并切换')).toBeInTheDocument();
      expect(openCalls).toEqual(['proj-1']);
    });
  });

  it('allows discard-and-switch without saving dirty files', async () => {
    let activeProject = 'proj-1';
    let saveCalls = 0;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        activeProject = body.projectId;
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            { projectId: 'proj-2', displayName: 'Test Project 2', lastOpenedAt: new Date().toISOString(), status: 'ready' },
          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: activeProject === 'proj-1' ? '# 项目一预期' : '# 项目二预期',
          }),
        });
      }

      if (input === '/api/file' && init?.method === 'PUT') {
        saveCalls += 1;
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/proj-1');

    await waitFor(() => {
      expect(screen.getAllByLabelText('当前文档编辑器').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getAllByLabelText('当前文档编辑器')[0], { target: { value: '# 已修改项目一预期' } });
    await waitFor(() => {
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 已修改项目一预期');
      expect(document.querySelectorAll('[data-editor-surface="dirty-marker"]').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 2/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 2/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });

    const switchDialog = document.querySelector('dialog[data-overlay-surface="switch-dialog"]') as HTMLDialogElement | null;
    expect(switchDialog).not.toBeNull();
    expect(switchDialog).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(switchDialog).toHaveAttribute('open');
    });

    fireEvent.click(within(switchDialog as HTMLElement).getByRole('button', { name: '放弃更改并切换' }));

    await waitFor(() => {
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 项目二预期');
      expect(document.body.textContent).toContain('Test Project 2');
    });

    expect(saveCalls).toBe(0);
  });

  it('keeps the current project route when a dirty draft blocks a route-driven project switch', async () => {
    let activeProject = 'proj-1';
    const openCalls: string[] = [];

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        openCalls.push(body.projectId);
        activeProject = body.projectId;
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            { projectId: 'proj-2', displayName: 'Test Project 2', lastOpenedAt: new Date().toISOString(), status: 'ready' },
          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: activeProject === 'proj-1' ? '# 项目一预期' : '# 项目二预期',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    fireEvent.change(screen.getAllByLabelText('当前文档编辑器')[0], { target: { value: '# 已修改项目一预期' } });

    await waitFor(() => {
      expect(document.querySelectorAll('[data-editor-surface="dirty-marker"]').length).toBeGreaterThan(0);
      expect(window.location.pathname).toBe('/projects/proj-1');
      expect(window.location.search).toBe('');
    });

    await navigateBrowserTo('/projects/proj-2');

    await waitFor(() => {
      const switchDialog = document.querySelector('dialog[data-overlay-surface="switch-dialog"]') as HTMLDialogElement | null;
      expect(switchDialog).not.toBeNull();
      expect(switchDialog).toHaveAttribute('open');
      expect(window.location.pathname).toBe('/projects/proj-1');
      expect(window.location.search).toBe('');
    });

    expect(openCalls).toEqual(['proj-1']);
  });

  it('restores the current project state if the target project init fails during switch', async () => {
    let activeProject = 'proj-1';

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        activeProject = body.projectId;
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            { projectId: 'proj-2', displayName: 'Test Project 2', lastOpenedAt: new Date().toISOString(), status: 'ready' },
          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: activeProject === 'proj-1',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: activeProject === 'proj-1',
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: activeProject === 'proj-1' ? '项目一' : '项目二',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/workspace/init') {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'init failed' }) });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: activeProject === 'proj-1' ? '# 项目一预期' : '# 项目二预期',
          }),
        });
      }

      if (input === '/api.settings/model') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    fireEvent.change(screen.getAllByLabelText('当前文档编辑器')[0], { target: { value: '# 已修改项目一预期' } });
    await waitFor(() => {
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 已修改项目一预期');
      expect(document.querySelectorAll('[data-editor-surface="dirty-marker"]').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 2/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 2/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });

    const switchDialog = document.querySelector('dialog[data-overlay-surface="switch-dialog"]') as HTMLDialogElement | null;
    expect(switchDialog).not.toBeNull();
    expect(switchDialog).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(switchDialog).toHaveAttribute('open');
    });

    fireEvent.click(within(switchDialog as HTMLElement).getByRole('button', { name: '放弃更改并切换' }));

    await waitFor(() => {
      expect(screen.getByText('初始化项目失败，请稍后重试。')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 1/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 已修改项目一预期');
    });
  });

  it('opens file navigation in the shared context rail', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
    });

    await bootstrapWorkbenchShell();

    fireEvent.click(getTopBarControl('打开文稿导航'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
      expect(document.querySelector('[data-ui-surface="workbench-grid"]')).toHaveAttribute('data-context-rail-state', 'open');
      expect(document.querySelector('[data-ui-surface="workbench-grid"]')).toHaveAttribute('data-context-rail-panel', 'files');
      expect(document.querySelector('[data-shell-region="workbench-context-rail-panel"]')).not.toBeNull();
    });

    const contextRail = document.querySelector<HTMLElement>('[data-shell-region="workbench-context-rail"]');
    const panel = contextRail?.querySelector<HTMLElement>('[data-shell-region="workbench-context-rail-panel"]') ?? null;
    const fileTreeRail = within(contextRail as HTMLElement).getByLabelText('文件树导航');

    expect(contextRail).toHaveAttribute('id', 'workbench-context-rail');
    expect(panel).not.toBeNull();
    expect(fileTreeRail).toHaveAttribute('data-shell-region', 'file-tree-rail');
    expect(fileTreeRail).toHaveAttribute('data-panel-state', 'expanded');
  });

  it('keeps the opened 文稿导航 rail interactive so files inside remain clickable', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [
          { title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] },
          { title: '2-设定', files: [{ path: '2-设定/角色.md', label: '角色.md' }] },
        ],
      },
      fileContentByPath: {
        '1-边界/预期.md': '# 新书预期',
        '2-设定/角色.md': '# 角色设定',
      },
    });

    await bootstrapWorkbenchShell();

    const trigger = getTopBarControl('打开文稿导航');
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
    });

    const contextRail = document.querySelector<HTMLElement>('[data-shell-region="workbench-context-rail"]');
    const railPanel = contextRail?.querySelector<HTMLElement>('[data-shell-region="workbench-context-rail-panel"]') ?? null;
    const fileTreeRail = contextRail?.querySelector<HTMLElement>('[data-shell-region="file-tree-rail"]') ?? null;

    expect(getComputedStyle(railPanel as HTMLElement).pointerEvents).toBe('auto');
    expect(getComputedStyle(fileTreeRail as HTMLElement).pointerEvents).toBe('auto');

    fireEvent.click(screen.getByText('角色.md'));

    await waitFor(() => {
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('2-设定/角色.md');
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 角色设定');
    });
  });

  it('closes the file context rail from its close button or Escape', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
    });

    await bootstrapWorkbenchShell();

    const drawerTrigger = getTopBarControl('打开文稿导航');

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
      expect(drawerTrigger).toHaveAttribute('aria-expanded', 'true');
    });

    let fileTreeRail = document.querySelector<HTMLElement>('[data-shell-region="file-tree-rail"]');
    fireEvent.click(within(fileTreeRail as HTMLElement).getByRole('button', { name: '关闭文稿导航' }));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(document.querySelector('[data-shell-region="file-tree-rail"]')).toBeNull();
      expect(drawerTrigger).toHaveFocus();
    });

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(document.querySelector('[data-shell-region="file-tree-rail"]')).toBeNull();
      expect(drawerTrigger).toHaveAttribute('aria-expanded', 'false');
      expect(drawerTrigger).toHaveFocus();
    });
  });

  it('moves focus into the file drawer on open and returns it to the trigger on close', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
    });

    await bootstrapWorkbenchShell();

    const drawerTrigger = getTopBarControl('打开文稿导航');

    expect(screen.queryByRole('button', { name: '关闭文稿导航' })).toBeNull();

    drawerTrigger.focus();
    expect(drawerTrigger).toHaveFocus();

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
      const fileTreeRail = document.querySelector<HTMLElement>('[data-shell-region="file-tree-rail"]');
      expect(within(fileTreeRail as HTMLElement).getByRole('button', { name: '关闭文稿导航' })).toHaveFocus();
    });

    const fileTreeRail = document.querySelector<HTMLElement>('[data-shell-region="file-tree-rail"]');
    fireEvent.click(within(fileTreeRail as HTMLElement).getByRole('button', { name: '关闭文稿导航' }));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(drawerTrigger).toHaveFocus();
    });
  });

  it('preserves file-tree state across drawer close and reopen', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [
          {
            title: '.novelkit',
            files: [
              { path: '.novelkit/constitution/MASTER.md', label: 'MASTER.md' },
              { path: '.novelkit/memory/character_state.md', label: 'character_state.md' },
            ],
          },
        ],
      },
      fileContentByPath: {
        '1-边界/预期.md': '# 新书预期',
        '.novelkit/memory/character_state.md': '# 人物状态',
        '.novelkit/constitution/MASTER.md': '# 核心宪章',
        'PROJECT.md': '# 主控文件',
      },
    });

    await bootstrapWorkbenchShell();

    fireEvent.click(getTopBarControl('打开文稿导航'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
    });

    let fileTreeRail = document.querySelector<HTMLElement>('[data-shell-region="file-tree-rail"]');

    expect(screen.getByLabelText('主控文件 PROJECT.md')).toBeInTheDocument();
    expect(screen.getByText('constitution')).toBeInTheDocument();
    expect(screen.getByText('memory')).toBeInTheDocument();

    fireEvent.click(screen.getByText('character_state.md'));

    await waitFor(() => {
      expect(getCurrentDocumentEditor()).toHaveValue('# 人物状态');
    });

    fireEvent.click(screen.getByRole('button', { name: '折叠目录 constitution' }));

    expect(screen.queryByText('MASTER.md')).not.toBeInTheDocument();

    fireEvent.click(within(fileTreeRail as HTMLElement).getByRole('button', { name: '关闭文稿导航' }));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
    });

    fireEvent.click(getTopBarControl('打开文稿导航'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
    });

    fileTreeRail = document.querySelector<HTMLElement>('[data-shell-region="file-tree-rail"]');

    expect(screen.queryByText('MASTER.md')).not.toBeInTheDocument();
    expect(within(fileTreeRail as HTMLElement).getByText('character_state.md').closest('button')).toHaveClass('active');
    expect(screen.getByLabelText('主控文件 PROJECT.md')).toBeInTheDocument();
    expect(getCurrentDocumentEditor()).toHaveValue('# 人物状态');
  });

  it('opens workflow status in the shared context rail', async () => {
    setupWorkbenchFetchMock({
      progress: {
        requiredProjectReads: ['1-边界/预期.md'],
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
        manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
      },
    });

    await bootstrapWorkbenchShell();

    fireEvent.click(getTopBarControl('打开流程状态'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'workflow');
    });

    const contextRail = document.querySelector<HTMLElement>('[data-shell-region="workbench-context-rail"]');
    const panel = contextRail?.querySelector<HTMLElement>('[data-shell-region="workbench-context-rail-panel"]') ?? null;
    const workflowRail = within(contextRail as HTMLElement).getByRole('complementary', { name: '流程状态侧栏' });

    expect(contextRail).toHaveAttribute('id', 'workbench-context-rail');
    expect(panel).not.toBeNull();
    expect(workflowRail).toHaveAttribute('data-shell-region', 'workflow-rail');
    expect(workflowRail).toHaveAttribute('data-panel-state', 'expanded');
  });

  it('opens, switches, and closes the shared context rail from top-bar controls', async () => {
    setupWorkbenchFetchMock({
      fileTreeData: {
        rootFiles: [{ path: 'PROJECT.md', label: 'PROJECT.md' }],
        groups: [{ title: '1-边界', files: [{ path: '1-边界/预期.md', label: '预期.md' }] }],
      },
      progress: {
        requiredProjectReads: ['1-边界/预期.md'],
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
        manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
      },
    });

    await bootstrapWorkbenchShell();

    fireEvent.click(getTopBarControl('打开文稿导航'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'files');
      expect(document.querySelector('[data-shell-region="file-tree-rail"]')).toBeInTheDocument();
      expect(screen.queryByRole('complementary', { name: '流程状态侧栏' })).not.toBeInTheDocument();
      expect(getTopBarControl('关闭文稿导航')).toHaveAttribute('aria-expanded', 'true');
      expect(getTopBarControl('打开流程状态')).toHaveAttribute('aria-expanded', 'false');
    });

    fireEvent.click(getTopBarControl('打开流程状态'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'workflow');
      expect(document.querySelector('[data-shell-region="file-tree-rail"]')).not.toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: '流程状态侧栏' })).toBeVisible();
      expect(getTopBarControl('打开文稿导航')).toHaveAttribute('aria-expanded', 'false');
      expect(getTopBarControl('关闭流程状态')).toHaveAttribute('aria-expanded', 'true');
    });

    fireEvent.click(getTopBarControl('关闭流程状态'));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(document.querySelector('.workbench-context-rail')).toBeNull();
      expect(getTopBarControl('打开文稿导航')).toHaveAttribute('aria-expanded', 'false');
      expect(getTopBarControl('打开流程状态')).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('closes the workflow context rail from its close button or Escape', async () => {
    setupWorkbenchFetchMock({
      progress: {
        requiredProjectReads: ['1-边界/预期.md'],
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
        manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
      },
    });

    await bootstrapWorkbenchShell();

    const drawerTrigger = getTopBarControl('打开流程状态');

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'workflow');
      expect(drawerTrigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: '折叠流程状态栏' })).toBeInTheDocument();
    });

    let workflowRail = document.querySelector<HTMLElement>('[data-shell-region="workflow-rail"]');
    fireEvent.click(within(workflowRail as HTMLElement).getByRole('button', { name: '关闭流程状态' }));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(document.querySelector('.workbench-context-rail')).toBeNull();
      expect(drawerTrigger).toHaveFocus();
    });

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'workflow');
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(document.querySelector('.workbench-context-rail')).toBeNull();
      expect(drawerTrigger).toHaveAttribute('aria-expanded', 'false');
      expect(drawerTrigger).toHaveFocus();
    });
  });

  it('moves focus into the workflow drawer on open and returns it to the trigger on close', async () => {
    setupWorkbenchFetchMock({
      progress: {
        requiredProjectReads: ['1-边界/预期.md'],
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
        manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
      },
    });

    await bootstrapWorkbenchShell();

    const drawerTrigger = getTopBarControl('打开流程状态');

    expect(screen.queryByRole('button', { name: '关闭流程状态' })).toBeNull();

    drawerTrigger.focus();
    expect(drawerTrigger).toHaveFocus();

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toHaveAttribute('data-context-rail-panel', 'workflow');
      const workflowRail = document.querySelector<HTMLElement>('[data-shell-region="workflow-rail"]');
      expect(within(workflowRail as HTMLElement).getByRole('button', { name: '关闭流程状态' })).toHaveFocus();
    });

    const workflowRail = document.querySelector<HTMLElement>('[data-shell-region="workflow-rail"]');
    fireEvent.click(within(workflowRail as HTMLElement).getByRole('button', { name: '关闭流程状态' }));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(document.querySelector('.workbench-context-rail')).toBeNull();
      expect(drawerTrigger).toHaveFocus();
    });

    expect(screen.queryByRole('button', { name: '关闭流程状态' })).toBeNull();
  });

  it('preserves workflow disclosure state across drawer close and reopen', async () => {
    setupWorkbenchFetchMock({
      progress: {
        requiredProjectReads: ['1-边界/预期.md'],
        allowedWrites: ['2-设定/2.1_创意脑暴.md'],
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
        chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
        manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
        pendingProposal: {
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
        },
      },
    });

    await bootstrapWorkbenchShell();

    const drawerTrigger = getTopBarControl('打开流程状态');

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: '流程状态侧栏' })).toBeVisible();
    });

    const referencesDetails = screen.getByText('参考文件').closest('details');
    const proposalDetails = screen.getByText('待确认提案').closest('details');

    expect(referencesDetails).not.toHaveAttribute('open');
    expect(proposalDetails).toHaveAttribute('open');

    fireEvent.click(screen.getByText('参考文件'));
    fireEvent.click(screen.getByText('待确认提案'));

    expect(referencesDetails).toHaveAttribute('open');
    expect(proposalDetails).not.toHaveAttribute('open');

    let workflowRail = document.querySelector<HTMLElement>('[data-shell-region="workflow-rail"]');
    fireEvent.click(within(workflowRail as HTMLElement).getByRole('button', { name: '关闭流程状态' }));

    await waitFor(() => {
      expect(document.querySelector('[data-shell-region="workbench-context-rail"]')).toBeNull();
      expect(document.querySelector('.workbench-context-rail')).toBeNull();
      expect(document.querySelector('.workbench-context-rail-state-cache')).toHaveAttribute('hidden');
      expect(document.querySelector('.workbench-context-rail-state-cache')).toHaveAttribute('aria-hidden', 'true');
    });

    fireEvent.click(drawerTrigger);

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: '流程状态侧栏' })).toBeVisible();
    });

    expect(screen.getByText('参考文件').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('待确认提案').closest('details')).not.toHaveAttribute('open');
  });

  it('shows a startup error when bootstrap fails', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.reject(new Error('network down'));
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 1/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(screen.getByText('打开项目失败，请稍后重试。')).toBeInTheDocument();
    });
  });
  });

  it('does not keep a stale startup error banner when a later bootstrap succeeds', async () => {
    let sessionCallCount = 0;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        sessionCallCount += 1;

        if (sessionCallCount === 1) {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('stale startup failure')), 20);
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            nextStepId: 'ideation-build',
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 1/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(screen.getByText('打开项目失败，请稍后重试。')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
      expect(screen.getByText('已选择项目 · Test Project 1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('# 新书预期')).toBeInTheDocument();
      expect(screen.queryByText('打开项目失败，请稍后重试。')).not.toBeInTheDocument();
    });
  });

  it('shows a save error when the backend rejects file writes', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'write-chapter',
            currentModule: 'write',
            currentStepTitle: '单章正文写作',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentMode: 'standard',
              currentStepId: 'write-chapter',
              currentModule: 'write',
              currentStepTitle: '单章正文写作',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: [],
            allowedWrites: ['4-正文/第001章_草稿.md'],
            strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
            chatAllowedWrites: ['4-正文/第001章_草稿.md'],
            manualWritablePaths: ['4-正文/第001章_草稿.md'],
            nextStepId: 'review-chapter',
            progressSummary: {
              phase: '正文写作',
              coreTask: '完成第001章草稿',
              nextSuggestion: '第001章草稿',
              callableModules: ['write'],
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '4-正文/第001章_草稿.md', content: '# 第001章草稿' }),
        });
      }

      if (input === '/api/file' && init?.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'conflict' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/proj-1');

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '保存当前文档' }).length).toBeGreaterThan(0);
    });

    fireEvent.change(getCurrentDocumentEditor(), { target: { value: '# 第001章草稿\n\n触发失败保存。' } });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '保存当前文档' })[0]).toBeEnabled();
    });

    fireEvent.click(screen.getAllByRole('button', { name: '保存当前文档' })[0]);

    await waitFor(() => {
      expect(screen.getByText('保存失败，请稍后重试。')).toBeInTheDocument();
    });
  });

  it('shows a file-tree error when project tree loading fails', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentMode: 'standard',
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            progressSummary: {
              phase: '标准模式',
              coreTask: '定义新书方向',
              nextSuggestion: '创意脑暴',
              callableModules: ['define'],
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.reject(new Error('tree failed'));
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: '# 预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/proj-1');

    await waitFor(() => {
      expect(screen.getByText('文件树加载失败，已回退为当前文件模式。')).toBeInTheDocument();
    });
  });

  it('shows a decision card when pendingDecision exists without a proposal', async () => {
    const localFetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([{ projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: true,
            hasPendingDecision: true,
            interactionMode: 'decision',
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: true,
              hasPendingDecision: true,
              interactionMode: 'decision',
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            pendingDecision: {
              decisionType: 'substep_confirmation',
              reply: '是否确认当前方向？',
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/chat/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [{ role: 'assistant', content: '已载入项目会话。' }],
            writeTargetHint: defaultWriteTargetHint,
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: '# 新书预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ provider: 'openai-compatible', baseUrl: 'https://example.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7, stream: true }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', localFetchMock);

    window.history.replaceState({}, '', '/');
    const view = render(<App />);

    await waitFor(() => {
      expect(within(view.container).getAllByRole('button', { name: /Test Project 1/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(within(view.container).getAllByRole('button', { name: /Test Project 1/ })[0]);

    await waitFor(() => {
      expect(within(view.container).getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });

    fireEvent.click(within(view.container).getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      expect(within(view.container).getAllByRole('button', { name: '打开流程状态' }).length).toBeGreaterThan(0);
    });

    fireEvent.click(within(view.container).getAllByRole('button', { name: '打开流程状态' })[0]);

    await waitFor(() => {
      const workbenchShell = view.container.querySelector('[data-shell-region="workbench-shell"]');
      const inlineTopContext = getInlineTopContext(workbenchShell ?? document);
      expect(workbenchShell?.querySelector('[data-workflow-card="context-fold"][data-workflow-tone="decision"]')).not.toBeNull();
      expect(workbenchShell?.querySelector('[data-workflow-card="context-fold"][data-workflow-tone="proposal"]')).toBeNull();
      expect(inlineTopContext).toBeNull();
    }, { timeout: 5000 });
  }, 10000);

  it('prioritizes pending proposal content over reference reads on bootstrap', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentMode: 'standard',
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: true,
            hasPendingProposal: true,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentMode: 'standard',
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md'],
            nextStepId: 'ideation-build',
            progressSummary: {
              phase: '标准模式',
              coreTask: '定义新书方向',
              nextSuggestion: '创意脑暴',
              callableModules: ['define'],
            },
            pendingProposal: {
              proposedWrites: [
                { path: '2-设定/2.1_创意脑暴.md', content: '# 提案内容' },
              ],
            },
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/chat') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: '已切换到参考分析焦点。',
            session: {
              initialized: true,
              currentStepId: 'analyze-entry',
              currentModule: 'analyze',
              currentStepTitle: '样板书分析',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    await waitFor(() => {
      const inlineTopContext = getInlineTopContext();
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('2-设定/2.1_创意脑暴.md');
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 提案内容');
      expect(document.querySelector('[data-editor-surface="readonly-note"]')).not.toBeNull();
      expect(inlineTopContext).toBeNull();
    });
  });

  it('starts analyze mode from the startup screen and treats same-project create navigation as a lens change', async () => {
    let initialized = false;
    let analyzeEntered = false;
    let analyzeRequests = 0;
    const openProjectCalls: string[] = [];

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { projectId: string };
        openProjectCalls.push(body.projectId);
        analyzeEntered = false;
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized,
            currentStepId: analyzeEntered ? 'analyze-entry' : 'define-direction',
            currentModule: analyzeEntered ? 'analyze' : 'define',
            currentStepTitle: analyzeEntered ? '样板书分析' : '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: analyzeEntered,
            hasPendingProposal: analyzeEntered,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized,
              currentStepId: analyzeEntered ? 'analyze-entry' : 'define-direction',
              currentModule: analyzeEntered ? 'analyze' : 'define',
              currentStepTitle: analyzeEntered ? '样板书分析' : '新书方向定义',
              currentChapterNumber: 1,
              waitingForApproval: analyzeEntered,
              hasPendingProposal: analyzeEntered,
            },
            requiredProjectReads: initialized && !analyzeEntered ? ['1-边界/预期.md'] : [],
            allowedWrites: initialized && !analyzeEntered ? ['2-设定/2.1_创意脑暴.md'] : [],
            strictWorkflowWrites: initialized && !analyzeEntered ? ['2-设定/2.1_创意脑暴.md'] : [],
            chatAllowedWrites: initialized && !analyzeEntered ? ['2-设定/2.1_创意脑暴.md'] : [],
            manualWritablePaths: initialized && !analyzeEntered ? ['2-设定/2.1_创意脑暴.md'] : [],
            nextStepId: analyzeEntered ? 'analyze-entry' : 'ideation-build',
            pendingProposal: analyzeEntered
              ? {
                  proposedWrites: [{ path: '1-边界/1.1_全书故事梗概.md' }],
                }
              : null,
          }),
        });
      }

      if (input === '/api/workspace/init') {
        initialized = true;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            currentChapterNumber: 1,
            waitingForApproval: false,
            hasPendingProposal: false,
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/chat') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body).toMatchObject({ message: 'analyze', approved: false });
        analyzeRequests += 1;
        analyzeEntered = true;

        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: '已进入 Analyze 模式。',
            session: {
              initialized: true,
              currentStepId: 'analyze-entry',
              currentModule: 'analyze',
              currentStepTitle: '样板书分析',
              currentChapterNumber: 1,
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            pendingProposal: {
              proposedWrites: [{ path: '1-边界/1.1_全书故事梗概.md' }],
            },
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp('analyze');

    const topBarIntent = document.querySelector<HTMLElement>('[data-shell-region="top-bar"] [data-ui-intent-weight="supporting"]');

    await waitFor(() => {
      expect(topBarIntent).not.toBeNull();
      expect(topBarIntent).toHaveAttribute('data-ui-intent-weight', 'supporting');
      expect(topBarIntent).not.toBeEmptyDOMElement();
      expect(screen.getAllByRole('heading', { name: '创作助手' }).length).toBeGreaterThan(0);
    });

    await navigateBrowserTo('/projects/proj-1');

    await waitFor(() => {
      const switchDialog = document.querySelector('dialog[data-overlay-surface="switch-dialog"]') as HTMLDialogElement | null;
      expect(window.location.pathname).toBe('/projects/proj-1');
      expect(window.location.search).toBe('');
      expect(switchDialog).not.toBeNull();
      expect(switchDialog).toHaveAttribute('data-dialog-state', 'closed');
      expect(screen.getAllByRole('heading', { name: '创作助手' }).length).toBeGreaterThan(0);
      expect(document.body.textContent).toContain('样板书分析');
    });

    expect(analyzeRequests).toBe(1);
    expect(openProjectCalls).toEqual(['proj-1']);
  });

  it('shows soft guidance in the workflow panel and allows manual writes to non-strict targets', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['2-设定/2.1_创意脑暴.md'],
            strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md'],
            chatAllowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            manualWritablePaths: ['2-设定/2.1_创意脑暴.md', '1-边界/预期.md'],
            nextStepId: 'ideation-build',
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    expandWorkflowRailIfCollapsed();

    await waitFor(() => {
      expect(document.querySelector('[data-workflow-scope="strict"]')).not.toBeNull();
      expect(document.querySelector('[data-workflow-scope="flexible"]')).not.toBeNull();
      expect(document.querySelector('[data-workflow-action="next-write"]')).toHaveTextContent('2-设定/2.1_创意脑暴.md');
      
      expect(screen.getAllByText('2-设定/2.1_创意脑暴.md').length).toBeGreaterThan(0);
      
      expect(screen.getAllByText('1-边界/预期.md').length).toBeGreaterThan(0);
      
      expect(document.querySelector('[data-editor-surface="path"]')?.textContent).toBe('1-边界/预期.md');
    });

    fireEvent.change(getCurrentDocumentEditor(), { target: { value: '# 新书预期\n\n可保存草稿。' } });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '保存当前文档' })[0]).toBeEnabled();
    });
  });

  it('shows a thinking indicator while waiting for the assistant reply', async () => {
    let resolveChat: ((value: any) => void) | undefined;

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { projectId: 'proj-1', displayName: 'Test Project 1', lastOpenedAt: new Date().toISOString(), status: 'ready' }

          ]),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: [],
            allowedWrites: [],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/chat') {
        return new Promise((resolve) => {
          resolveChat = resolve;
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: '1-边界/预期.md',
            content: '# 新书预期',
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: false,
          }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    fireEvent.change(screen.getAllByLabelText('聊天输入框')[0], {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(screen.getByRole('status', { name: '正在构思回复' })).toBeInTheDocument();
    });

    resolveChat?.({
      ok: true,
      json: async () => ({
        reply: 'hi there',
        session: {
          initialized: true,
          currentStepId: 'define-direction',
          currentModule: 'define',
          currentStepTitle: '新书方向定义',
          waitingForApproval: false,
        },
        pendingProposal: null,
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('hi there')).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: '正在构思回复' })).not.toBeInTheDocument();
      expect(screen.getAllByText(/思考 \d+\.\ds/).length).toBeGreaterThan(0);
    });
  });

  it('requests project-local chat history when entering create mode', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [{ id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' }],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/chat/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [
              { role: 'assistant', content: '这是项目自己的历史开场。' },
              { role: 'user', content: '继续这个项目。' },
            ],
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: '# 新书预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    expect(
      fetchMock.mock.calls.some(([input, init]) => input === '/api/chat/session' && (!init || init.method === undefined)),
    ).toBe(true);
  });

  it('uses the newly opened document path when loading chat history during a project switch', async () => {
    let activeProjectId = 'proj-1';

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        activeProjectId = body.projectId;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId,
            project: { id: activeProjectId, displayName: activeProjectId === 'proj-1' ? 'Test Project 1' : 'Test Project 2' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId,
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
              { id: 'proj-2', displayName: 'Test Project 2', rootPath: '/tmp/proj-2', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        const currentPath = activeProjectId === 'proj-1' ? '1-边界/项目一.md' : '1-边界/项目二.md';
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: [currentPath],
            allowedWrites: [currentPath],
            strictWorkflowWrites: [currentPath],
            chatAllowedWrites: [currentPath],
            manualWritablePaths: [currentPath],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/chat/session' && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [{ role: 'assistant', content: activeProjectId === 'proj-1' ? '项目一历史。' : '项目二历史。' }],
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        const currentPath = activeProjectId === 'proj-1' ? '1-边界/项目一.md' : '1-边界/项目二.md';
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: currentPath, content: `# ${currentPath}` }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    fireEvent.click(screen.getAllByRole('button', { name: '返回' })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 2/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 2/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      const projectSessionGets = fetchMock.mock.calls.filter(([input]) => input === '/api/session');
      expect(projectSessionGets.at(-1)?.[1]).toMatchObject({
        headers: {
          'x-project-id': 'proj-2',
        },
      });

      const sessionGets = fetchMock.mock.calls.filter(([input, requestInit]) => input === '/api/chat/session' && (!requestInit || requestInit.method === undefined));
      const lastCall = sessionGets.at(-1);
      expect(lastCall?.[1]).toMatchObject({
        headers: {
          'x-active-document-path': encodeURIComponent('1-边界/项目二.md'),
          'x-project-id': 'proj-2',
        },
      });
    });

    await waitFor(() => {
      const chatPanel = document.querySelector('[data-ui-surface="chat-panel"]') as HTMLElement | null;
      expect(chatPanel).not.toBeNull();
      expect(within(chatPanel as HTMLElement).queryByText('这是项目 A 的历史消息。')).not.toBeInTheDocument();
      expect((chatPanel as HTMLElement).querySelector('[data-chat-surface="log"] article')).not.toBeNull();
    });
  });

  it('falls back to the default greeting when chat history loading fails', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            project: { id: 'proj-1', displayName: 'Test Project 1' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId: 'proj-1',
            projects: [{ id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' }],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/chat/session') {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'session failed' }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: '# 新书预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    await waitFor(() => {
      const chatPanels = document.querySelectorAll('[data-ui-surface="chat-panel"]');
      const chatPanel = chatPanels[chatPanels.length - 1] as HTMLElement | undefined;
      expect(chatPanel).not.toBeNull();
      expect(within(chatPanel as HTMLElement).queryByText('session failed')).not.toBeInTheDocument();
      expect((chatPanel as HTMLElement).querySelector('[data-chat-surface="log"] article')).not.toBeNull();
      expect(chatPanel).toHaveAttribute('data-chat-context-state', 'document-attached');
    });
  });

  it('does not leak project A chat history into a project with no valid session', async () => {
    let activeProjectId = 'proj-1';

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        activeProjectId = body.projectId;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId,
            project: { id: activeProjectId, displayName: activeProjectId === 'proj-1' ? 'Test Project 1' : 'Test Project 2' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId,
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
              { id: 'proj-2', displayName: 'Test Project 2', rootPath: '/tmp/proj-2', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/chat/session') {
        if (activeProjectId === 'proj-1') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [{ role: 'assistant', content: '这是项目 A 的历史消息。' }] }),
          });
        }

        return Promise.resolve({ ok: false, json: async () => ({ message: 'missing history' }) });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: activeProjectId === 'proj-1' ? '# 项目一预期' : '# 项目二预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();

    fireEvent.click(screen.getAllByRole('button', { name: '返回' })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 2/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 2/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /继续当前项目创作/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /继续当前项目创作/ }));

    await waitFor(() => {
      const putBodies = fetchMock.mock.calls
        .filter(([input, init]) => input === '/api/chat/session' && init?.method === 'PUT')
        .map(([, init]) => String(init?.body ?? ''));
      expect(putBodies.length).toBeGreaterThan(0);
      const latestPutBody = JSON.parse(String(putBodies.at(-1) ?? '{}')) as { messages?: Array<{ role?: string; content?: string }> };
      expect(latestPutBody.messages?.some((message) => message.role === 'assistant')).toBe(true);
      expect(latestPutBody.messages?.some((message) => message.content?.includes('这是项目 A 的历史消息。'))).toBe(false);
    });
  });

  it('does not save project A chat history into project B when switching directly into analyze mode', async () => {
    let activeProjectId = 'proj-1';

    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === '/api/projects/open' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        activeProjectId = body.projectId;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId,
            project: { id: activeProjectId, displayName: activeProjectId === 'proj-1' ? 'Test Project 1' : 'Test Project 2' },
          }),
        });
      }

      if (input === '/api/projects') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            activeProjectId,
            projects: [
              { id: 'proj-1', displayName: 'Test Project 1', rootPath: '/tmp/proj-1', lastOpenedAt: new Date().toISOString(), status: 'ready' },
              { id: 'proj-2', displayName: 'Test Project 2', rootPath: '/tmp/proj-2', lastOpenedAt: new Date().toISOString(), status: 'ready' },
            ],
          }),
        });
      }

      if (input === '/api/session') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            initialized: true,
            currentStepId: 'define-direction',
            currentModule: 'define',
            currentStepTitle: '新书方向定义',
            waitingForApproval: false,
          }),
        });
      }

      if (input === '/api/progress') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: {
              initialized: true,
              currentStepId: 'define-direction',
              currentModule: 'define',
              currentStepTitle: '新书方向定义',
              waitingForApproval: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: null,
            pendingProposal: null,
          }),
        });
      }

      if (input === '/api/chat/session' && (!init || init.method === undefined)) {
        if (activeProjectId === 'proj-1') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [{ role: 'assistant', content: '这是项目 A 的历史消息。' }] }),
          });
        }

        return Promise.resolve({ ok: false, json: async () => ({ message: 'missing history' }) });
      }

      if (input === '/api/chat/session' && init?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }

      if (input === '/api/chat') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: '已切换到参考分析焦点。',
            session: {
              initialized: true,
              currentStepId: 'analyze-entry',
              currentModule: 'analyze',
              currentStepTitle: '样板书分析',
              currentChapterNumber: 1,
              waitingForApproval: true,
              hasPendingProposal: true,
            },
            pendingProposal: {
              proposedWrites: [{ path: '1-边界/1.1_全书故事梗概.md' }],
            },
          }),
        });
      }

      if (input.startsWith('/api/file?path=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: '1-边界/预期.md', content: activeProjectId === 'proj-1' ? '# 项目一预期' : '# 项目二预期' }),
        });
      }

      if (input === '/api/settings/model') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: '',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            stream: true,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      if (input === '/api/chat/stream') {
        return Promise.reject(new Error('Unexpected fetch: /api/chat/stream'));
      }

      return rejectUnexpectedFetch(input);
    });

    vi.stubGlobal('fetch', fetchMock);

    await bootstrapApp();
    fireEvent.click(screen.getAllByRole('button', { name: '返回' })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test Project 2/ }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Test Project 2/ })[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /进入参考模式/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /进入参考模式/ }));

    await waitFor(() => {
      const putBodies = fetchMock.mock.calls
        .filter(([input, requestInit]) => input === '/api/chat/session' && requestInit?.method === 'PUT')
        .map(([, requestInit]) => String(requestInit?.body ?? ''));
      expect(putBodies.length).toBeGreaterThan(0);
      expect(putBodies.at(-1)).not.toContain('这是项目 A 的历史消息。');
    });
  });

  it('preserves input after model failure and does not fabricate assistant reply', async () => {
    setupWorkbenchFetchMock({
      chatReplies: [{ ok: false }],
    });

    await bootstrapWorkbenchShell();

    const input = screen.getAllByLabelText('聊天输入框')[0];
    fireEvent.change(input, { target: { value: '给我一版第一章草案' } });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(document.querySelector('[data-chat-surface="error-banner"]')?.textContent).toContain('聊天失败，请稍后重试。');
    });

    expect(input).toHaveValue('给我一版第一章草案');
    expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Write')).not.toBeInTheDocument();
    expect(screen.queryByText('给我一版第一章草案', { selector: 'p' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-chat-surface="error-banner"]')?.textContent).toContain('聊天失败，请稍后重试。');
  });

  it('does not show a pending proposal when model generation fails during a write-intent turn', async () => {
    setupWorkbenchFetchMock({
      chatReplies: [{ ok: false }],
    });

    await bootstrapWorkbenchShell();

    const input = screen.getAllByLabelText('聊天输入框')[0];
    fireEvent.change(input, { target: { value: '给我一版第一章草案' } });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(document.querySelector('[data-chat-surface="error-banner"]')?.textContent).toContain('聊天失败，请稍后重试。');
      expect(document.querySelector('[data-editor-surface="readonly-note"]')).toBeNull();
    }, { timeout: 5000 });

    expect(document.querySelector('[data-chat-surface="error-banner"]')?.textContent).toContain('聊天失败，请稍后重试。');
  });

  it('does not send mode-only chat session updates after the pure-conversation migration', async () => {
    const chatSessionPutBodies: string[] = [];

    setupWorkbenchFetchMock({
      chatSession: {
        messages: [{ role: 'assistant', content: '已载入项目会话。' }],
        preferredChatMode: 'write',
        writeTargetHint: defaultWriteTargetHint,
      },
      onChatSessionPut: (body) => {
        chatSessionPutBodies.push(body);
      },
    });

    await bootstrapApp();

    expect(chatSessionPutBodies).toEqual([]);
  });

  it('ignores persisted preferred chat mode and leaves ordinary message intent to the backend', async () => {
    const chatRequestBodies: string[] = [];

    setupWorkbenchFetchMock({
      chatSession: {
        messages: [{ role: 'assistant', content: '已恢复项目偏好。' }],
        preferredChatMode: 'write',
        writeTargetHint: defaultWriteTargetHint,
      },
      onChatRequest: (body) => {
        chatRequestBodies.push(body);
      },
    });

    await bootstrapApp();

    expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Write')).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('聊天输入框')[0], { target: { value: '先聊聊这个主角动机是不是太弱' } });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(chatRequestBodies[0]).toContain('"chatMode":"auto"');
    });
  }, 10000);

  it('sends ordinary strong write intent as auto without rendering mode controls', async () => {
    const chatRequestBodies: string[] = [];

    setupWorkbenchFetchMock({
      onChatRequest: (body) => {
        chatRequestBodies.push(body);
      },
    });

    await bootstrapApp();

    expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Write')).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('聊天输入框')[0], { target: { value: '给我一版第一章草案' } });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(chatRequestBodies[0]).toContain('"chatMode":"auto"');
    });
  }, 10000);

  it('retries the preserved input as discussion when the user chooses 继续讨论，不生成', async () => {
    const chatRequestBodies: string[] = [];

    setupWorkbenchFetchMock({
      onChatRequest: (body) => {
        chatRequestBodies.push(body);
      },
      chatErrorResponse: {
        code: 'proposal-api-key-missing',
        message: '提案生成失败：未配置模型 API Key。',
      },
      chatReplies: [
        { ok: false, status: 400 },
        { reply: '我们先继续讨论人物动机。' },
      ],
    });

    await bootstrapApp();

    fireEvent.change(screen.getAllByLabelText('聊天输入框')[0], { target: { value: '给我一版第一章草案' } });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(document.querySelector('[data-chat-action="continue-discussion"]')).not.toBeNull();
    });

    fireEvent.click(document.querySelector('[data-chat-action="continue-discussion"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(chatRequestBodies[0]).toContain('"chatMode":"auto"');
      expect(chatRequestBodies.at(-1)).toContain('"chatMode":"plan"');
      expect(chatRequestBodies.at(-1)).toContain('"message":"给我一版第一章草案"');
    });
  }, 10000);

  it('keeps explicit proposal approval semantics after mode UI removal', async () => {
    const chatRequestBodies: string[] = [];

    setupWorkbenchFetchMock({
      session: {
        waitingForApproval: true,
      },
      progress: {
        pendingProposal: {
          reply: '待确认提案',
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md' }],
        },
      },
      onChatRequest: (body) => {
        chatRequestBodies.push(body);
      },
    });

    await bootstrapApp();

    fireEvent.change(screen.getAllByLabelText('聊天输入框')[0], { target: { value: '确认' } });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(chatRequestBodies.at(-1)).toContain('"approved":true');
      expect(chatRequestBodies.at(-1)).toContain('"chatMode":"write"');
    });
  });

  it('sends an explicit approval turn from conversational pending proposal confirmation', async () => {
    const chatRequestBodies: string[] = [];

    setupWorkbenchFetchMock({
      session: {
        waitingForApproval: true,
      },
      progress: {
        pendingProposal: {
          reply: '待确认提案',
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md' }],
        },
      },
      onChatRequest: (body) => {
        chatRequestBodies.push(body);
      },
    });

    await bootstrapApp();

    expect(screen.queryByRole('button', { name: '确认写入当前提案' })).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('聊天输入框')[0], { target: { value: '确认' } });
    fireEvent.click(screen.getAllByRole('button', { name: '发送' })[0]);

    await waitFor(() => {
      expect(chatRequestBodies.at(-1)).toContain('"message":"确认"');
      expect(chatRequestBodies.at(-1)).toContain('"approved":true');
      expect(chatRequestBodies.at(-1)).toContain('"chatMode":"write"');
    });
  });
