import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProject, createSampleProject, fetchRecentProjects, pickProjectFolder } from './projectApi';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('projectApi', () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it('maps backend project list response to frontend ProjectInfo[]', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeProjectId: 'backend-id-1',
        projects: [
          {
            id: 'backend-id-1',
            displayName: 'Backend Project',
            rootPath: '/path/to/project',
            status: 'ready',
            phase: 'writing',
            coreTask: 'write chapter 1',
            nextSuggestion: 'continue',
            currentChapterNumber: 1,
            lastOpenedAt: '2026-04-04T12:00:00.000Z',
            lastOpenedDocument: 'doc.md',
          },
          {
            id: null,
            displayName: 'Missing ID Project',
            rootPath: '/path/to/missing',
            status: 'archived',
            phase: null,
            coreTask: null,
            nextSuggestion: null,
            currentChapterNumber: null,
            lastOpenedAt: null,
            lastOpenedDocument: null,
          },
        ],
      }),
    });

    const projects = await fetchRecentProjects();

    expect(projects).toHaveLength(2);
    expect(projects[0]).toEqual({
      id: 'backend-id-1',
      name: 'Backend Project',
      rootPath: '/path/to/project',
      lastModified: new Date('2026-04-04T12:00:00.000Z').getTime(),
      status: 'active',
      phase: 'writing',
      coreTask: 'write chapter 1',
    });
    expect(projects[1]).toEqual({
      id: '/path/to/missing',
      name: 'Missing ID Project',
      rootPath: '/path/to/missing',
      lastModified: expect.any(Number),
      status: 'archived',
      phase: null,
      coreTask: null,
    });
  });

  it('posts create-project payload and maps created project response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeProjectId: 'proj-new',
        project: {
          id: 'proj-new',
          displayName: '新项目',
          rootPath: '/tmp/novel/new-project',
          status: 'ready',
          phase: null,
          coreTask: null,
          nextSuggestion: null,
          currentChapterNumber: null,
          lastOpenedAt: '2026-04-04T12:00:00.000Z',
          lastOpenedDocument: null,
        },
      }),
    });

    const project = await createProject({
      displayName: '新项目',
      rootPath: '/tmp/novel/new-project',
      entryMode: 'create',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: '新项目',
        rootPath: '/tmp/novel/new-project',
        entryMode: 'create',
      }),
    });
    expect(project).toEqual({
      id: 'proj-new',
      name: '新项目',
      rootPath: '/tmp/novel/new-project',
      lastModified: new Date('2026-04-04T12:00:00.000Z').getTime(),
      status: 'active',
      phase: null,
      coreTask: null,
    });
  });

  it('posts sample-project request and maps created sample response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeProjectId: 'sample_workflow',
        project: {
          id: 'sample_workflow',
          displayName: 'Workflow Sample',
          rootPath: '/tmp/auctorforge-sample',
          status: 'ready',
          phase: '示例阶段',
          coreTask: '熟悉工作台',
          nextSuggestion: null,
          currentChapterNumber: null,
          lastOpenedAt: '2026-05-02T00:00:00.000Z',
          lastOpenedDocument: null,
        },
      }),
    });

    const project = await createSampleProject();

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/sample', { method: 'POST' });
    expect(project).toEqual({
      id: 'sample_workflow',
      name: 'Workflow Sample',
      rootPath: '/tmp/auctorforge-sample',
      lastModified: new Date('2026-05-02T00:00:00.000Z').getTime(),
      status: 'active',
      phase: '示例阶段',
      coreTask: '熟悉工作台',
    });
  });

  it('posts native folder picker request and returns the selected path', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ path: '/tmp/native-picked-folder' }),
    });

    const picked = await pickProjectFolder({
      purpose: 'create',
      defaultPath: '/tmp',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/pick-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'create',
        defaultPath: '/tmp',
      }),
    });
    expect(picked).toBe('/tmp/native-picked-folder');
  });

  it('surfaces structured backend error messages when project creation fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: {
          code: 'manifest-conflict',
          message: '目标目录已经包含另一个项目清单。',
        },
      }),
    });

    await expect(createProject({
      displayName: '冲突项目',
      rootPath: '/tmp/conflict',
      entryMode: 'create',
    })).rejects.toThrow('目标目录已经包含另一个项目清单。');
  });
});
