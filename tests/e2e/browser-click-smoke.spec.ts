import { expect, test } from '@playwright/test';

const projectsPayload = {
  activeProjectId: 'proj-1',
  projects: [
    {
      id: 'proj-1',
      projectId: 'proj-1',
      displayName: 'Test Project 1',
      rootPath: '/tmp/proj-1',
      status: 'ready',
      phase: '新书方向定义',
      coreTask: '明确故事预期',
      nextSuggestion: '继续推进预期文档',
      currentChapterNumber: 1,
      lastOpenedAt: '2026-04-26T09:00:00.000Z',
      lastOpenedDocument: '1-边界/预期.md',
    },
    {
      id: 'proj-2',
      projectId: 'proj-2',
      displayName: 'Test Project 2',
      rootPath: '/tmp/proj-2',
      status: 'ready',
      phase: '新书方向定义',
      coreTask: '切换验证',
      nextSuggestion: '继续推进预期文档',
      currentChapterNumber: 1,
      lastOpenedAt: '2026-04-26T09:00:00.000Z',
      lastOpenedDocument: '1-边界/预期.md',
    },
  ],
};

const sessionPayload = {
  initialized: true,
  currentStepId: 'define-direction',
  currentModule: 'define',
  currentStepTitle: '新书方向定义',
  currentChapterNumber: 1,
  waitingForApproval: false,
  interactionMode: 'discussion',
  writeTargetHint: {
    strictWorkflowWrites: ['1-边界/预期.md'],
    chatAllowedWrites: ['1-边界/预期.md', '2-设定/2.1_创意脑暴.md'],
    activeDocumentPath: '1-边界/预期.md',
    hasPendingProposal: false,
  },
};

const progressPayload = {
  session: sessionPayload,
  requiredProjectReads: ['1-边界/预期.md'],
  allowedWrites: ['1-边界/预期.md', '2-设定/2.1_创意脑暴.md'],
  strictWorkflowWrites: ['1-边界/预期.md'],
  chatAllowedWrites: ['1-边界/预期.md', '2-设定/2.1_创意脑暴.md'],
  manualWritablePaths: ['1-边界/预期.md', '2-设定/2.1_创意脑暴.md'],
  nextStepId: null,
  progressSummary: {
    phase: '方向定义',
    coreTask: '明确故事预期',
    nextSuggestion: '继续推进预期文档',
    callableModules: ['create', 'analyze'],
  },
  pendingDecision: null,
  pendingProposal: null,
};

const fileTreePayload = {
  rootFiles: [],
  groups: [
    {
      title: '1-边界',
      files: [{ path: '1-边界/预期.md', label: '预期.md' }],
    },
    {
      title: '2-设定',
      files: [{ path: '2-设定/2.1_创意脑暴.md', label: '2.1_创意脑暴.md' }],
    },
  ],
};

const fileContentByPath: Record<string, string> = {
  '1-边界/预期.md': '# 新书预期\n\n这是启动后的默认文稿。',
  '2-设定/2.1_创意脑暴.md': '# 创意脑暴\n\n这里是切换后的设定文稿。',
};

async function mockWorkbenchApi(page: import('@playwright/test').Page) {
  const chatRequestBodies: unknown[] = [];
  const savedFiles: Array<{ path: string; content: string }> = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;
    const method = request.method();

    if (!pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (pathname === '/api/projects' && method === 'GET') {
      await route.fulfill({ status: 200, json: projectsPayload });
      return;
    }

    if (pathname === '/api/projects/open' && method === 'POST') {
      const body = request.postDataJSON() as { projectId?: string } | null;
      const projectId = body?.projectId ?? 'proj-1';
      const project = projectsPayload.projects.find((entry) => entry.id === projectId) ?? projectsPayload.projects[0];
      await route.fulfill({
        status: 200,
        json: {
          activeProjectId: project.id,
          project: {
            id: project.id,
            projectId: project.projectId,
            displayName: project.displayName,
          },
        },
      });
      return;
    }

    if (pathname === '/api/session' && method === 'GET') {
      await route.fulfill({ status: 200, json: sessionPayload });
      return;
    }

    if (pathname === '/api/progress' && method === 'GET') {
      await route.fulfill({ status: 200, json: progressPayload });
      return;
    }

    if (pathname === '/api/files/tree' && method === 'GET') {
      await route.fulfill({ status: 200, json: fileTreePayload });
      return;
    }

    if (pathname === '/api/file' && method === 'GET') {
      const path = searchParams.get('path') ?? '1-边界/预期.md';
      await route.fulfill({
        status: 200,
        json: {
          path,
          content: fileContentByPath[path] ?? '# 未知文稿',
        },
      });
      return;
    }

    if (pathname === '/api/chat/session' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          messages: [{ role: 'assistant', content: '已载入项目会话。' }],
          writeTargetHint: sessionPayload.writeTargetHint,
        },
      });
      return;
    }

    if (pathname === '/api/chat/session' && method === 'PUT') {
      await route.fulfill({
        status: 200,
        json: {
          messages: [{ role: 'assistant', content: '已载入项目会话。' }],
          writeTargetHint: sessionPayload.writeTargetHint,
        },
      });
      return;
    }

    if (pathname === '/api/settings/model' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          provider: 'openai-compatible',
          baseUrl: 'https://example.com/v1',
          apiKey: '',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          stream: true,
        },
      });
      return;
    }

    if (pathname === '/api/file' && method === 'PUT') {
      const body = request.postDataJSON() as { path: string; content: string };
      savedFiles.push(body);
      fileContentByPath[body.path] = body.content;
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          session: sessionPayload,
          pendingDecision: null,
          pendingProposal: null,
        },
      });
      return;
    }

    if (pathname === '/api/chat/stream' && method === 'POST') {
      chatRequestBodies.push(request.postDataJSON());
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: '',
      });
      return;
    }

    if (pathname === '/api/chat' && method === 'POST') {
      chatRequestBodies.push(request.postDataJSON());
      await route.fulfill({
        status: 200,
        json: {
          reply: '已收到你的想法。',
          session: sessionPayload,
          pendingDecision: null,
          pendingProposal: null,
        },
      });
      return;
    }

    await route.fulfill({
      status: 404,
      json: {
        error: {
          code: 'unmocked-route',
          message: `${method} ${pathname} was not mocked in browser-click-smoke.spec.ts`,
        },
      },
    });
  });

  return {
    chatRequestBodies,
    savedFiles,
  };
}

test('launcher can click into the workbench, submit chat, save, and guard dirty project switches', async ({ page }) => {
  const api = await mockWorkbenchApi(page);

  await page.goto('/');

  await expect(page.getByRole('navigation', { name: '首页导航' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择并继续 Test Project 1' })).toBeVisible();

  await page.getByRole('button', { name: '选择并继续 Test Project 1' }).click();

  await expect(page).toHaveURL(/\/projects\/proj-1$/);
  const topBar = page.getByLabel('工作台顶部栏');
  await expect(topBar).toBeVisible();
  await expect(page.getByLabel('当前文档编辑器')).toHaveValue(/新书预期/);
  await expect(page.getByLabel('创作助手对话区')).toBeVisible();
  await expect(topBar.getByRole('button', { name: '打开流程状态' })).toBeVisible();
  await expect(topBar.getByRole('button', { name: '打开文稿导航' })).toBeVisible();

  await topBar.getByRole('button', { name: '打开流程状态' }).click();
  await expect(page.locator('[data-shell-region="workbench-context-rail"]')).toHaveAttribute(
    'data-context-rail-panel',
    'workflow',
  );
  await expect(page.getByLabel('流程状态侧栏')).toBeVisible();
  await topBar.getByRole('button', { name: '关闭流程状态' }).click();
  await expect(page.locator('[data-shell-region="workbench-context-rail"]')).toHaveCount(0);

  await topBar.getByRole('button', { name: '打开文稿导航' }).click();
  await expect(page.locator('[data-shell-region="workbench-context-rail"]')).toHaveAttribute(
    'data-context-rail-panel',
    'files',
  );
  await expect(page.getByLabel('文件树导航')).toBeVisible();
  await page.getByRole('button', { name: '2.1_创意脑暴.md' }).click();

  await expect(page.getByLabel('当前文档编辑器')).toHaveValue(/创意脑暴/);

  await page.getByLabel('聊天输入框').fill('继续讨论这个设定');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('已收到你的想法。')).toBeVisible();
  expect(api.chatRequestBodies).toHaveLength(2);
  const streamRequest = api.chatRequestBodies[0] as { requestId?: string };
  const fallbackRequest = api.chatRequestBodies[1] as { requestId?: string };
  expect(streamRequest.requestId).toBeTruthy();
  expect(fallbackRequest.requestId).toBe(streamRequest.requestId);

  await page.getByLabel('当前文档编辑器').fill('# 创意脑暴\n\n已手动修改的设定文稿。');
  await expect(page.getByRole('button', { name: '保存当前文档' })).toBeEnabled();
  await page.getByRole('button', { name: '保存当前文档' }).click();
  await expect(page.getByText('草稿已保存')).toBeVisible();
  expect(api.savedFiles.at(-1)).toMatchObject({
    path: '2-设定/2.1_创意脑暴.md',
    content: '# 创意脑暴\n\n已手动修改的设定文稿。',
  });

  await page.getByLabel('当前文档编辑器').fill('# 创意脑暴\n\n未保存的切换验证。');
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '选择并继续 Test Project 2' }).click();
  await expect(page.getByRole('heading', { name: '未保存的更改' })).toBeVisible();
  await page.getByRole('button', { name: '放弃更改并切换' }).click();
  await expect(page).toHaveURL(/\/projects\/proj-2$/);
});
