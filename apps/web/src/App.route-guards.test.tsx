import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

const fetchMock = vi.fn();

function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  render(<App />);
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

describe('App route guards', () => {
  afterEach(async () => {
    cleanup();
    await Promise.resolve();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('preserves the dirty draft when navigating between compatibility lenses in the same project', async () => {
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
            currentStepId: 'analyze-entry',
            currentModule: 'analyze',
            currentStepTitle: '样板书分析',
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
              currentStepId: 'analyze-entry',
              currentModule: 'analyze',
              currentStepTitle: '样板书分析',
              currentChapterNumber: 1,
              waitingForApproval: false,
              hasPendingProposal: false,
            },
            requiredProjectReads: ['1-边界/预期.md'],
            allowedWrites: ['1-边界/预期.md'],
            strictWorkflowWrites: ['1-边界/预期.md'],
            chatAllowedWrites: ['1-边界/预期.md'],
            manualWritablePaths: ['1-边界/预期.md'],
            nextStepId: 'analyze-entry',
            pendingProposal: null,
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
            stream: false,
          }),
        });
      }

      if (input === '/api/files/tree') {
        return Promise.resolve({ ok: true, json: async () => ({ rootFiles: [], groups: [] }) });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${input}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    renderAppAt('/projects/proj-1?lens=analyze');

    await waitFor(() => {
      expect(document.body.textContent).toContain('样板书分析');
      expect(document.body.textContent).toContain('Test Project 1');
      expect(window.location.pathname).toBe('/projects/proj-1');
      expect(window.location.search).toBe('?lens=analyze');
      expect(screen.getByText('已进入 Analyze 模式。')).toBeInTheDocument();
      expect(fetchMock.mock.calls.filter(([input]) => typeof input === 'string' && input.startsWith('/api/file?path=')).length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.change(screen.getAllByLabelText('当前文档编辑器')[0], { target: { value: '# 已修改的新书预期' } });

    await waitFor(() => {
      expect(screen.getAllByText('●').length).toBeGreaterThan(0);
      expect(window.location.pathname).toBe('/projects/proj-1');
      expect(window.location.search).toBe('?lens=analyze');
    });

    await navigateBrowserTo('/projects/proj-1');

    await waitFor(() => {
      const switchDialog = document.querySelector('dialog[data-overlay-surface="switch-dialog"]') as HTMLDialogElement | null;
      expect(switchDialog).not.toBeNull();
      expect(switchDialog).toHaveAttribute('data-dialog-state', 'closed');
      expect(window.location.pathname).toBe('/projects/proj-1');
      expect(window.location.search).toBe('');
      expect(screen.getAllByText('●').length).toBeGreaterThan(0);
      expect(screen.getAllByLabelText('当前文档编辑器')[0]).toHaveValue('# 已修改的新书预期');
    });
  });
});
