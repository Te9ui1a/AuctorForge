import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './createApp';
import { createProject } from '../core/projects/projectLifecycle';
import { readProjectSession, resolveProjectSessionPath, writeProjectSession } from '../core/chat/projectSessionStore';

const skillPackPath = fileURLToPath(
  new URL('../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

const tempDirs: string[] = [];

type ChatTurnOptions = {
  chatMode?: 'plan' | 'write';
  activeDocumentPath?: string;
  attachments?: Array<{ name: string; mimeType: string; size: number; textContent: string }>;
};

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-webui-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function propose(app: FastifyInstance, message: string) {
  return withAutoModel(() =>
    app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message,
        approved: false,
      },
    }),
  );
}

async function proposeWithMode(app: FastifyInstance, message: string, options: ChatTurnOptions) {
  return withAutoModel(() =>
    app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message,
        approved: false,
        ...options,
      },
    }),
  );
}

async function approve(app: FastifyInstance, message = '确认') {
  return app.inject({
    method: 'POST',
    url: '/api/chat',
    payload: {
      message,
      approved: true,
    },
  });
}

async function withAutoModel<T>(run: () => Promise<T>, forcedTargetPath?: string) {
  if (vi.isMockFunction(globalThis.fetch)) {
    return run();
  }

  const previousFetch = globalThis.fetch;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousNovelKey = process.env.NOVEL_FLOW_API_KEY;
  if (previousOpenAiKey === '' && previousNovelKey === '') {
    return run();
  }

  process.env.OPENAI_API_KEY = previousOpenAiKey || 'test-key';
  vi.stubGlobal('fetch', createAutoProposalFetch(forcedTargetPath));

  try {
    return await run();
  } finally {
    if (previousOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }

    if (previousNovelKey === undefined) {
      delete process.env.NOVEL_FLOW_API_KEY;
    } else {
      process.env.NOVEL_FLOW_API_KEY = previousNovelKey;
    }

    vi.stubGlobal('fetch', previousFetch);
  }
}

async function proposeWithAutoModel(app: FastifyInstance, message: string) {
  return withAutoModel(() =>
    app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message,
        approved: false,
      },
    }),
  );
}

async function proposeFinalWithAutoModel(app: FastifyInstance, message: string, targetPath: string) {
  return withAutoModel(() =>
    app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message,
        approved: false,
      },
    }),
    targetPath,
  );
}

async function injectWithAutoModel(app: FastifyInstance, options: Parameters<FastifyInstance['inject']>[0]) {
  return withAutoModel(() => app.inject(options));
}

function readSseEvents(body: string) {
  return body
    .trim()
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? '';
      const dataText = /^data:\s*([\s\S]+)$/m.exec(block)?.[1] ?? 'null';

      return {
        event,
        data: JSON.parse(dataText) as unknown,
      };
    });
}

function createAutoProposalFetch(forcedTargetPath?: string) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const requestBody = String(init?.body ?? '');
    const promptText = extractPromptText(requestBody);

    if (promptText.includes('聊天回合规划器')) {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: promptText.includes('写入文件') || promptText.includes('生成') ? 'proposal' : 'discussion',
                  reason: '测试模型按用户措辞规划回合。',
                }),
              },
            },
          ],
        }),
      };
    }

    if (!promptText.includes('请输出 JSON 对象')) {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：当前方向可以继续打磨，确认后再生成写入提案。',
              },
            },
          ],
        }),
      };
    }

    const targetPath = forcedTargetPath
      ?? extractActiveDocumentTarget(promptText)
      ?? extractFirstTargetFromSection(promptText, '### 严格流程写入目标')
      ?? extractFirstTargetFromSection(promptText, '### 聊天可写入范围')
      ?? extractStrictChapterWriteTarget(promptText)
      ?? '2-设定/2.1_创意脑暴.md';
    const proposedWrites = buildAutoProposedWrites(promptText, targetPath);

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: '已生成待确认提案。',
                proposedWrites,
              }),
            },
          },
        ],
      }),
    };
  });
}

function createAutoProposalFetchWithDelay(delayMs: number, forcedTargetPath?: string) {
  const fetchMock = createAutoProposalFetch(forcedTargetPath);

  return vi.fn(async (url: string, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fetchMock(url, init);
  });
}

function extractPromptText(requestBody: string) {
  try {
    const parsed = JSON.parse(requestBody) as {
      messages?: Array<{ content?: string }>;
      system_instruction?: { parts?: Array<{ text?: string }> };
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    return [
      ...(parsed.messages?.map((message) => message.content ?? '') ?? []),
      ...(parsed.system_instruction?.parts?.map((part) => part.text ?? '') ?? []),
      ...(parsed.contents?.flatMap((content) => content.parts?.map((part) => part.text ?? '') ?? []) ?? []),
    ].join('\n\n');
  } catch {
    return requestBody;
  }
}

function extractActiveDocumentTarget(promptText: string) {
  return promptText.match(/### 当前激活文档\n([^\n"]+)/u)?.[1]?.trim() ?? null;
}

function extractFirstTargetFromSection(promptText: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = promptText.match(new RegExp(`${escapedHeading}\\n([\\s\\S]*?)(?:\\n\\n### |$)`, 'u'))?.[1] ?? '';
  const targets = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== 'PROJECT.md');

  return targets[0] ?? null;
}

function extractStrictChapterWriteTarget(promptText: string) {
  const strictWritesSection = promptText.match(/### 严格流程写入目标\n([\s\S]*?)(?:\n\n### |$)/u)?.[1] ?? '';
  return strictWritesSection.match(/4-正文\/第\d{3}章_(?:草稿|定稿)\.md/u)?.[0] ?? null;
}

function buildAutoProposedWrites(promptText: string, targetPath: string) {
  if (targetPath.startsWith('4-正文/')) {
    return [buildAutoWrite(targetPath, promptText)];
  }

  if (targetPath.startsWith('5-审查/')) {
    return [buildAutoReview(targetPath)];
  }

  if (targetPath === '2-设定/2.1_创意脑暴.md') {
    const storySeed = extractLatestDiscussionNote(promptText) ?? extractUserMessage(promptText);

    return [
      {
        path: targetPath,
        content: `# 套路方向与核心设定\n\n## 1. 核心梗 (Core Premise)\n角色甲围绕主题甲完成长期目标。\n\n## 用户补充\n${storySeed}`,
      },
      {
        path: '1-边界/1.2_文风.md',
        content: '# 文风指南 (Style Guide)\n\n强调克制叙事。',
      },
    ];
  }

  if (targetPath === '2-设定/2.2_新书设定案.md') {
    return [
      {
        path: targetPath,
        content: '# 新书设定案\n\n## 世界观\n角色甲围绕主题甲完成长期目标。',
      },
    ];
  }

  if (targetPath === '2-设定/2.3_金手指设定.md') {
    return [
      {
        path: targetPath,
        content: '# 金手指设定\n\n## 核心概念\n能力甲提供阶段性线索。',
      },
    ];
  }

  if (targetPath === '2-设定/2.4_主要角色设定表.md') {
    return [
      {
        path: targetPath,
        content: '# 主要角色设定表\n\n## 主角\n角色甲承担主线行动。',
      },
      {
        path: '.novelkit/constitution/MASTER.md',
        content: '# MASTER\n\n## 项目特有红线\n- 保持角色甲围绕主题甲完成长期目标。',
      },
    ];
  }

  if (targetPath === '3-大纲/3.1_全书结构总纲.md') {
    return [
      {
        path: targetPath,
        content: `# 全书结构总纲\n\n## 全书剧情单元总览\n角色甲逐步完成长期目标。\n\n核心方向：${extractUserMessage(promptText)}`,
      },
    ];
  }

  if (targetPath === '3-大纲/第01卷_完整卷纲.md') {
    return [
      {
        path: targetPath,
        content: '# 第01卷 完整卷纲\n\n卷内冲突明确。',
      },
    ];
  }

  if (targetPath === '3-大纲/第01卷_章纲.md') {
    return [
      {
        path: targetPath,
        content: [
          '# 第01卷 章纲',
          '',
          '第1章：待填写开局章标题',
          '',
          '**章节梗概**：主角在危险环境里第一次显露“保留阶段策略”的核心策略。',
          '',
          '**场景拆解**：',
          '- 场景1：危机降临',
          '- 场景2：低调试探',
          '- 场景3：第一轮小反制',
          '',
          '**结尾钩子**：主角意识到更大的规则压制已经开始。',
          '',
          '第2章：待填写承接章标题',
          '',
          '**章节梗概**：主角借一次意外事件隐藏真实能力，并为下一次破局做准备。',
          '',
          '**场景拆解**：',
          '- 场景1：外部事件升级',
          '- 场景2：主角内部权衡',
          '- 场景3：埋下下一次反击条件',
          '',
          '**结尾钩子**：真正的目标人物出现。',
        ].join('\n'),
      },
    ];
  }

  if (targetPath === '.novelkit/constitution/MASTER.md') {
    return [
      {
        path: targetPath,
        content: '# MASTER\n\n## 项目特有红线\n- 保持角色甲围绕主题甲完成长期目标。',
      },
    ];
  }

  return [
    {
      path: targetPath,
      content: `# ${targetPath.split('/').at(-1)?.replace(/\.md$/u, '') ?? '提案'}\n\n核心方向：${extractUserMessage(promptText)}`,
    },
  ];
}

function buildAutoWrite(targetPath: string, promptText: string) {
  const chapterNumber = Number.parseInt(targetPath.match(/第0*(\d+)章/u)?.[1] ?? '1', 10);
  const chapterLabelText = `第${String(chapterNumber).padStart(3, '0')}章`;
  const draftKind = targetPath.endsWith('_定稿.md') ? '定稿' : '草稿';
  const planTitle = extractPlanTitle(promptText, chapterNumber);
  const roleName = promptText.match(/^#{2,6}\s*([一-龥]{2,4})(?:\n|\s)/mu)?.[1] ?? '主角';
  const body = `${roleName}按照当前项目章纲推进本章事件，保留已经建立的连续性状态。`;

  return {
    path: targetPath,
    content: `# ${chapterLabelText} ${planTitle ?? draftKind}\n\n${body.repeat(260)}`,
  };
}

function extractPlanTitle(requestBody: string, chapterNumber: number) {
  const titleMatch = requestBody.match(new RegExp(`第\\s*0*${chapterNumber}\\s*章[:：]([^\\n"]+)`, 'u'));
  return titleMatch?.[1]?.trim() ?? null;
}

function buildAutoReview(targetPath: string) {
  const chapterNumber = Number.parseInt(targetPath.match(/第0*(\d+)章/u)?.[1] ?? '1', 10);
  const chapterLabelText = `第${String(chapterNumber).padStart(3, '0')}章`;

  return {
    path: targetPath,
    content: [
      `# ${chapterLabelText} 审查报告`,
      '',
      '- 审查评级：PASS',
      '',
      '## AI味专项检查',
      '- 未发现必须阻断的 AI 味问题。',
      '',
      '## 局部改写任务',
      '- 暂无。',
      '',
      '## 结论',
      '- 可以进入章节收束。',
    ].join('\n'),
  };
}

function extractUserMessage(promptText: string) {
  return promptText.match(/用户消息：([^\n]+)/u)?.[1] ?? '测试提案';
}

function extractLatestDiscussionNote(promptText: string) {
  const section = promptText.match(/### 最近讨论记录\n([\s\S]*?)(?:\n\n### |$)/u)?.[1] ?? '';
  const notes = section
    .split('\n')
    .map((line) => line.trim().replace(/^\d+\.\s*/u, ''))
    .filter((line) => line.length > 0);

  return notes.at(-1) ?? null;
}

async function approveWithMode(app: FastifyInstance, message: string, options: ChatTurnOptions) {
  return app.inject({
    method: 'POST',
    url: '/api/chat',
    payload: {
      message,
      approved: true,
      ...options,
    },
  });
}

async function completeDefine(app: FastifyInstance) {
  await propose(app, '我想写一个以主题甲为核心的长篇故事。');
  await propose(app, '生成一版创意脑暴草案');
  return approve(app);
}

async function completeIdeation(app: FastifyInstance) {
  await propose(app, '先补全新书设定案。');
  await approve(app);
  await propose(app, '继续补全金手指设定。');
  await approve(app);
  await propose(app, '继续补全角色设定和宪法约束。');
  return approve(app);
}

async function completeOutline(app: FastifyInstance) {
  await propose(app, '开始规划全书总纲。');
  await approve(app);
  await propose(app, '继续规划第01卷卷纲。');
  await approve(app);
  await propose(app, '继续细化第01卷章纲。');
  return approve(app);
}

function buildProjectProgressContent(phase: string, coreTask: string) {
  return [
    '# PROJECT.md — 项目控制面板',
    '',
    '### 8.1 当前重点与后续步骤',
    `- **阶段**：${phase}`,
    `- **核心任务**：${coreTask}`,
    '- **待办事项**：',
    `  - [ ] ${coreTask}`,
  ].join('\n');
}

describe('createApp', () => {
  it('GET /api/projects returns registered projects with computed summaries', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeFile(
      path.join(alphaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Alpha 阶段', '继续完善 Alpha 大纲'),
      'utf8',
    );

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });

    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      activeProjectId: 'proj_alpha',
      projects: [
        expect.objectContaining({
          id: 'proj_alpha',
          displayName: 'Alpha 项目',
          rootPath: path.resolve(alphaRoot),
          status: 'ready',
          phase: 'Alpha 阶段',
          coreTask: '继续完善 Alpha 大纲',
        }),
      ],
    });

    await app.close();
  });

  it('POST /api/projects/pick-folder returns the selected folder from an injected picker', async () => {
    const userConfigDir = await makeWorkspace();
    const folderPicker = {
      pickFolder: vi.fn().mockResolvedValue('/tmp/chosen-project-folder'),
    };

    const app = createApp({ skillPackPath, userConfigDir, folderPicker });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/pick-folder',
      payload: {
        purpose: 'create',
        defaultPath: '/tmp',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(folderPicker.pickFolder).toHaveBeenCalledWith({
      prompt: '选择项目文件夹或新建文件夹',
      defaultPath: '/tmp',
    });
    expect(JSON.parse(response.body)).toEqual({ path: '/tmp/chosen-project-folder' });

    await app.close();
  });

  it('POST /api/projects/pick-folder returns null when the picker is cancelled', async () => {
    const userConfigDir = await makeWorkspace();
    const folderPicker = {
      pickFolder: vi.fn().mockResolvedValue(null),
    };

    const app = createApp({ skillPackPath, userConfigDir, folderPicker });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/pick-folder',
      payload: {
        purpose: 'import',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ path: null });

    await app.close();
  });

  it('POST /api/projects/sample creates and opens a workflow sample project', async () => {
    const userConfigDir = await makeWorkspace();
    const app = createApp({ skillPackPath, userConfigDir });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/sample',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const sampleRoot = path.join(userConfigDir, '.auctorforge', 'samples', 'workflow-sample');
    expect(body).toMatchObject({
      activeProjectId: 'sample_workflow',
      project: expect.objectContaining({
        id: 'sample_workflow',
        displayName: 'Workflow Sample',
        rootPath: path.resolve(sampleRoot),
        status: 'ready',
      }),
    });
    await expect(readFile(path.join(sampleRoot, 'PROJECT.md'), 'utf8')).resolves.toContain('Workflow Sample');
    await expect(readFile(path.join(sampleRoot, '2-设定', '2.4_主要角色设定表.md'), 'utf8')).resolves.toContain('# 主要角色设定表');
    await expect(readFile(path.join(sampleRoot, '4-正文', '第001章_草稿.md'), 'utf8')).resolves.toContain('# 第001章');

    await app.close();
  });

  it('POST /api/projects/sample reopens the existing sample without duplicating the index note', async () => {
    const userConfigDir = await makeWorkspace();
    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/sample',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/sample',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const sampleRoot = path.join(userConfigDir, '.auctorforge', 'samples', 'workflow-sample');
    expect(body.activeProjectId).toBe('sample_workflow');
    expect(body.project.rootPath).toBe(path.resolve(sampleRoot));
    const projectIndex = await readFile(path.join(sampleRoot, 'PROJECT.md'), 'utf8');
    expect(projectIndex.match(/Workflow Sample/g)?.length ?? 0).toBeGreaterThan(0);

    await app.close();
  });

  it('POST /api/projects/open switches active project and resets live memory state', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'reference',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });

    const primeOpenResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
        entryMode: 'create',
      },
    });
    expect(primeOpenResponse.statusCode).toBe(200);

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const pendingResponse = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(pendingResponse.body)).toMatchObject({
      session: {
        initialized: true,
        hasPendingProposal: true,
        waitingForApproval: true,
      },
    });

    const openResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_beta',
        entryMode: 'reference',
      },
    });

    expect(openResponse.statusCode).toBe(200);
    expect(JSON.parse(openResponse.body)).toMatchObject({
      activeProjectId: 'proj_beta',
      project: expect.objectContaining({
        id: 'proj_beta',
        rootPath: path.resolve(betaRoot),
      }),
      session: {
        initialized: false,
        hasPendingProposal: false,
        hasPendingDecision: false,
        waitingForApproval: false,
      },
    });

    const sessionResponse = await app.inject({ method: 'GET', url: '/api/session' });
    expect(JSON.parse(sessionResponse.body)).toMatchObject({
      initialized: false,
      hasPendingProposal: false,
      hasPendingDecision: false,
      waitingForApproval: false,
    });

    await app.close();
  });

  it('keeps pending proposal isolated when switching away from and back to a project', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'reference',
      skillPackPath,
      now: () => '2026-04-04T10:01:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_alpha', entryMode: 'create' },
    });
    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const alphaProposalResponse = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(alphaProposalResponse.body)).toMatchObject({
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.any(Array),
      }),
      session: {
        hasPendingProposal: true,
        waitingForApproval: true,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_beta', entryMode: 'reference' },
    });
    const betaSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { 'x-project-id': 'proj_beta' },
    });
    expect(JSON.parse(betaSessionResponse.body)).toMatchObject({
      hasPendingProposal: false,
      waitingForApproval: false,
    });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_alpha', entryMode: 'create' },
    });
    const restoredAlphaSessionResponse = await app.inject({ method: 'GET', url: '/api/session' });

    expect(JSON.parse(restoredAlphaSessionResponse.body)).toMatchObject({
      hasPendingProposal: true,
      waitingForApproval: true,
    });

    await app.close();
  });

  it('reuses the original chat result when the same request id is submitted twice', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
        requestId: 'turn-proposal-1',
      },
    });

    const firstApproval = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认',
        approved: true,
        requestId: 'turn-approval-1',
      },
    });
    const secondApproval = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认',
        approved: true,
        requestId: 'turn-approval-1',
      },
    });

    expect(secondApproval.statusCode).toBe(200);
    expect(JSON.parse(secondApproval.body)).toEqual(JSON.parse(firstApproval.body));

    await app.close();
  });

  it('shares one in-flight chat execution for duplicate request ids', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({
      projectRoot: workspaceRoot,
      skillPackPath,
      userConfigDir: workspaceRoot,
    });
    let resolveModelResponse: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveModelResponse = resolve;
        }),
    );

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const firstRequest = app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
        requestId: 'turn-inflight-1',
      },
    });
    const secondRequest = app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
        requestId: 'turn-inflight-1',
      },
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveModelResponse?.({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: '已生成待确认提案。',
                proposedWrites: [
                  {
                    path: '2-设定/2.1_创意脑暴.md',
                    content: '创意脑暴内容',
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse.body)).toEqual(JSON.parse(firstResponse.body));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('does not leave duplicate request ids hanging after handled chat errors', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({
      projectRoot: workspaceRoot,
      skillPackPath,
      userConfigDir: workspaceRoot,
    });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => 'model unavailable',
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const payload = {
      message: '生成一版创意脑暴草案',
      approved: false,
      requestId: 'turn-handled-error-1',
    };
    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload,
    });

    const secondResponse = await Promise.race([
      app.inject({
        method: 'POST',
        url: '/api/chat',
        payload,
      }),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 100)),
    ]);

    expect(firstResponse.statusCode).toBe(502);
    expect(secondResponse).not.toBe('timed-out');
    expect(typeof secondResponse).not.toBe('string');
    if (typeof secondResponse !== 'string') {
      expect(secondResponse.statusCode).toBe(502);
      expect(JSON.parse(secondResponse.body)).toMatchObject({
        error: {
          code: 'proposal-upstream-response',
        },
      });
    }

    await app.close();
  });

  it('settles overlapping duplicate request ids after handled chat errors', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({
      projectRoot: workspaceRoot,
      skillPackPath,
      userConfigDir: workspaceRoot,
    });
    let resolveModelResponse!: () => void;
    const modelResponse = new Promise<void>((resolve) => {
      resolveModelResponse = resolve;
    });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await modelResponse;
        return {
          ok: false,
          status: 503,
          text: async () => 'model unavailable',
        };
      }),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const payload = {
      message: '生成一版创意脑暴草案',
      approved: false,
      requestId: 'turn-handled-error-overlap-1',
    };
    const firstResponsePromise = app.inject({
      method: 'POST',
      url: '/api/chat',
      payload,
    });
    const secondResponsePromise = app.inject({
      method: 'POST',
      url: '/api/chat',
      payload,
    });

    resolveModelResponse();

    const [firstResponse, secondResponse] = await Promise.all([
      firstResponsePromise,
      Promise.race([
        secondResponsePromise,
        new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 100)),
      ]),
    ]);

    expect(firstResponse.statusCode).toBeGreaterThanOrEqual(400);
    expect(secondResponse).not.toBe('timed-out');
    expect(typeof secondResponse).not.toBe('string');
    if (typeof secondResponse !== 'string') {
      expect(secondResponse.statusCode).toBe(502);
      expect(JSON.parse(secondResponse.body)).toMatchObject({
        error: {
          code: 'proposal-upstream-response',
        },
      });
    }

    await app.close();
  });

  it('keeps project runtime state isolated while a chat request overlaps with project switching', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:01:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const app = createApp({
      projectRoot: alphaRoot,
      skillPackPath,
      userConfigDir,
    });
    let resolveModelResponse: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveModelResponse = resolve;
        }),
    );

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_alpha', entryMode: 'create' },
    });
    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const alphaChatRequest = app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成 Alpha 专属创意脑暴草案',
        approved: false,
        requestId: 'alpha-overlap-turn',
      },
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const betaOpenRequest = app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_beta', entryMode: 'create' },
    });

    resolveModelResponse?.({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'Alpha 已生成待确认提案。',
                proposedWrites: [
                  {
                    path: '2-设定/2.1_创意脑暴.md',
                    content: 'Alpha 创意脑暴内容',
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    const [alphaChatResponse, betaOpenResponse] = await Promise.all([alphaChatRequest, betaOpenRequest]);
    expect(alphaChatResponse.statusCode).toBe(200);
    expect(JSON.parse(alphaChatResponse.body)).toMatchObject({
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({
            path: '2-设定/2.1_创意脑暴.md',
            content: 'Alpha 创意脑暴内容',
          }),
        ]),
      }),
      session: {
        hasPendingProposal: true,
        waitingForApproval: true,
      },
    });
    expect(betaOpenResponse.statusCode).toBe(200);
    expect(JSON.parse(betaOpenResponse.body)).toMatchObject({
      activeProjectId: 'proj_beta',
      session: {
        initialized: false,
        hasPendingProposal: false,
        hasPendingDecision: false,
      },
    });

    const betaSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { 'x-project-id': 'proj_beta' },
    });
    expect(JSON.parse(betaSessionResponse.body)).toMatchObject({
      initialized: false,
      hasPendingProposal: false,
      hasPendingDecision: false,
    });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_alpha', entryMode: 'create' },
    });
    const alphaSessionResponse = await app.inject({ method: 'GET', url: '/api/session' });
    expect(JSON.parse(alphaSessionResponse.body)).toMatchObject({
      initialized: true,
      hasPendingProposal: true,
      hasPendingDecision: false,
    });

    await app.close();
  });

  it('keeps an explicit project chat turn scoped when another project is opened before generation finishes', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:01:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const app = createApp({
      projectRoot: alphaRoot,
      skillPackPath,
      userConfigDir,
    });
    let resolveModelResponse: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveModelResponse = resolve;
        }),
    );

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_alpha', entryMode: 'create' },
    });
    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const alphaChatRequest = app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-project-id': 'proj_alpha' },
      payload: {
        message: '生成 Alpha 专属创意脑暴草案',
        approved: false,
        requestId: 'alpha-scoped-overlap-turn',
      },
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const betaOpenResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_beta', entryMode: 'create' },
    });
    expect(betaOpenResponse.statusCode).toBe(200);

    resolveModelResponse?.({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'Alpha scoped proposal ready.',
                proposedWrites: [
                  {
                    path: '2-设定/2.1_创意脑暴.md',
                    content: 'Alpha scoped proposal content',
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    const alphaChatResponse = await alphaChatRequest;
    expect(alphaChatResponse.statusCode).toBe(200);
    expect(JSON.parse(alphaChatResponse.body)).toMatchObject({
      reply: 'Alpha scoped proposal ready.',
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({
            path: '2-设定/2.1_创意脑暴.md',
            content: 'Alpha scoped proposal content',
          }),
        ]),
      }),
      session: {
        initialized: true,
        hasPendingProposal: true,
        waitingForApproval: true,
      },
    });

    const betaSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { 'x-project-id': 'proj_beta' },
    });
    expect(JSON.parse(betaSessionResponse.body)).toMatchObject({
      initialized: false,
      hasPendingProposal: false,
      hasPendingDecision: false,
    });

    const alphaSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { 'x-project-id': 'proj_alpha' },
    });
    expect(JSON.parse(alphaSessionResponse.body)).toMatchObject({
      initialized: true,
      hasPendingProposal: true,
      hasPendingDecision: false,
    });

    const duplicateAlphaResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'x-project-id': 'proj_alpha' },
      payload: {
        message: '生成 Alpha 专属创意脑暴草案',
        approved: false,
        requestId: 'alpha-scoped-overlap-turn',
      },
    });
    expect(duplicateAlphaResponse.statusCode).toBe(200);
    expect(JSON.parse(duplicateAlphaResponse.body)).toMatchObject({
      reply: 'Alpha scoped proposal ready.',
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({ content: 'Alpha scoped proposal content' }),
        ]),
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('GET /api/chat/session returns frontend-safe messages without exposing preferred chat mode memory', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    const legacySession = {
      messages: [
        {
          role: 'assistant',
          content: '这是 Alpha 的已保存回复。',
          thinkingDuration: 500,
          attachments: [{ name: '设定.md' }],
        },
        {
          role: 'user',
          content: '继续保留这段讨论。',
        },
      ],
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'direction-define',
          module: 'define',
          notes: ['这条备注不应该通过接口暴露给前端'],
        },
      ],
      workflow: {
        initialized: true,
        currentMode: 'standard',
        currentStepId: 'ideation-build',
        currentSubstepId: 'setting-draft',
        currentVolumeNumber: 1,
        currentChapterNumber: 1,
        returnTarget: null,
      },
      preferredChatMode: 'write',
    };

    await writeProjectSession(alphaRoot, legacySession);

    const app = createApp({ skillPackPath, userConfigDir });

    const openResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });
    expect(openResponse.statusCode).toBe(200);

    const response = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      messages: Array<{ role: 'assistant' | 'user'; content: string }>;
      writeTargetHint: {
        strictWorkflowWrites: string[];
      };
    };

    expect(body).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: '这是 Alpha 的已保存回复。',
          thinkingDuration: 500,
          attachments: [{ name: '设定.md' }],
        },
        {
          role: 'user',
          content: '继续保留这段讨论。',
        },
      ],
      writeTargetHint: {
        strictWorkflowWrites: expect.any(Array),
      },
    });
    expect(body.writeTargetHint.strictWorkflowWrites.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('preferredChatMode');
    expect(body).not.toHaveProperty('discussionNotes');
    expect(body).not.toHaveProperty('workflow');

    await app.close();
  });

  it('GET /api/chat/session returns no-active-project when nothing is open', async () => {
    const userConfigDir = await makeWorkspace();
    const app = createApp({ skillPackPath, userConfigDir });

    const response = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'no-active-project',
      },
    });

    await app.close();
  });

  it('PUT /api/chat/session saves frontend messages together with safe server-owned snapshots and omits preferred chat mode', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });
    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我还在想主角是不是应该更腹黑一点');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: [
          {
            role: 'assistant',
            content: '已归档的助手回复',
            thinkingDuration: 420.4,
            attachments: [{ name: '设定.md', extra: 'ignored' }, { name: '   ' }],
          },
          {
            role: 'user',
            content: '已归档的用户回复',
            attachments: [{ name: '大纲.md' }],
            ignored: true,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      messages: Array<{ role: 'assistant' | 'user'; content: string }>;
      writeTargetHint: {
        strictWorkflowWrites: string[];
      };
    };

    expect(body).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: '已归档的助手回复',
          thinkingDuration: 420,
          attachments: [{ name: '设定.md' }],
        },
        {
          role: 'user',
          content: '已归档的用户回复',
          attachments: [{ name: '大纲.md' }],
        },
      ],
      writeTargetHint: {
        strictWorkflowWrites: expect.any(Array),
      },
    });
    expect(body.writeTargetHint.strictWorkflowWrites.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('preferredChatMode');

    await expect(readProjectSession(alphaRoot)).resolves.toEqual({
      version: 1,
      savedAt: expect.any(String),
      messages: [
        {
          role: 'assistant',
          content: '已归档的助手回复',
          thinkingDuration: 420,
          attachments: [{ name: '设定.md' }],
        },
        {
          role: 'user',
          content: '已归档的用户回复',
          attachments: [{ name: '大纲.md' }],
        },
      ],
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'direction-define',
          module: 'define',
          notes: ['我还在想主角是不是应该更腹黑一点'],
        },
      ],
      workflow: {
        initialized: true,
        currentMode: 'standard',
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        currentVolumeNumber: 1,
        currentChapterNumber: 1,
        returnTarget: null,
      },
    });

    await app.close();
  });

  it('PUT /api/chat/session returns no-active-project when nothing is open', async () => {
    const userConfigDir = await makeWorkspace();
    const app = createApp({ skillPackPath, userConfigDir });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: [{ role: 'assistant', content: '这条消息不应该被保存。' }],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'no-active-project',
      },
    });

    await app.close();
  });

  it('PUT /api/chat/session rejects a missing messages field and preserves saved history', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeProjectSession(alphaRoot, {
      messages: [{ role: 'assistant', content: '原有历史不应被清空。' }],
      discussionNotes: [],
      workflow: null,
    });

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await expect(readProjectSession(alphaRoot)).resolves.toEqual({
      version: 1,
      savedAt: expect.any(String),
      messages: [{ role: 'assistant', content: '原有历史不应被清空。' }],
      discussionNotes: [],
      workflow: null,
    });

    await app.close();
  });

  it('PUT /api/chat/session rejects a mode-only update and preserves persisted messages', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeProjectSession(alphaRoot, {
      messages: [{ role: 'assistant', content: '原有消息应保留。' }],
      discussionNotes: [],
      workflow: null,
    });

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_alpha' },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        preferredChatMode: 'write',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'invalid-chat-session-payload',
      },
    });

    await expect(readProjectSession(alphaRoot)).resolves.toEqual({
      version: 1,
      savedAt: expect.any(String),
      messages: [{ role: 'assistant', content: '原有消息应保留。' }],
      discussionNotes: [],
      workflow: null,
    });

    await app.close();
  });

  it('PUT /api/chat/session rejects a non-array messages field and preserves saved history', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeProjectSession(alphaRoot, {
      messages: [{ role: 'assistant', content: '非数组请求也不应覆盖我。' }],
      discussionNotes: [],
      workflow: null,
    });

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: {
          role: 'assistant',
          content: '错误结构',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    await expect(readProjectSession(alphaRoot)).resolves.toEqual({
      version: 1,
      savedAt: expect.any(String),
      messages: [{ role: 'assistant', content: '非数组请求也不应覆盖我。' }],
      discussionNotes: [],
      workflow: null,
    });

    await app.close();
  });

  it('PUT /api/chat/session rejects client-supplied workflow or approval state fields even when a legacy preferredChatMode field is present', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: [],
        preferredChatMode: 'write',
        workflow: {
          initialized: true,
          currentMode: 'analyze',
          currentStepId: 'analyze-entry',
          currentSubstepId: 'style-analysis',
          currentVolumeNumber: 1,
          currentChapterNumber: 3,
          returnTarget: null,
        },
        discussionNotes: [
          {
            stepId: 'define-direction',
            substepId: 'direction-define',
            module: 'define',
            notes: ['恶意覆盖'],
          },
        ],
        pendingProposal: {
          reply: '不应该被接受',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(await readProjectSession(alphaRoot)).toBeNull();

    await app.close();
  });

  it('exposes safe write target hint fields in chat session, progress, and session responses', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });
    const activeDocumentPath = '3-大纲/3.1_全书结构总纲.md';

    await app.inject({
      method: 'POST',
      url: '/api/workspace/init',
    });

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: {
        'x-active-document-path': encodeURIComponent(activeDocumentPath),
      },
    });
    expect(sessionResponse.statusCode).toBe(200);
    const sessionBody = JSON.parse(sessionResponse.body) as {
      writeTargetHint: {
        strictWorkflowWrites: string[];
        chatAllowedWrites: string[];
        activeDocumentPath: string | null;
        hasPendingProposal: boolean;
      };
    };
    expect(sessionBody.writeTargetHint.strictWorkflowWrites.length).toBeGreaterThan(0);
    expect(sessionBody.writeTargetHint.chatAllowedWrites).toContain(activeDocumentPath);
    expect(sessionBody.writeTargetHint.activeDocumentPath).toBe(activeDocumentPath);
    expect(sessionBody.writeTargetHint.hasPendingProposal).toBe(false);

    const progressResponse = await app.inject({
      method: 'GET',
      url: '/api/progress',
      headers: {
        'x-active-document-path': encodeURIComponent(activeDocumentPath),
      },
    });
    expect(progressResponse.statusCode).toBe(200);
    const progressBody = JSON.parse(progressResponse.body) as {
      strictWorkflowWrites: string[];
      chatAllowedWrites: string[];
      writeTargetHint: {
        strictWorkflowWrites: string[];
        chatAllowedWrites: string[];
        activeDocumentPath: string | null;
        hasPendingProposal: boolean;
      };
      session: {
        writeTargetHint: {
          strictWorkflowWrites: string[];
          chatAllowedWrites: string[];
          activeDocumentPath: string | null;
          hasPendingProposal: boolean;
        };
      };
    };
    expect(progressBody.writeTargetHint.strictWorkflowWrites).toEqual(progressBody.strictWorkflowWrites);
    expect(progressBody.writeTargetHint.chatAllowedWrites).toEqual(progressBody.chatAllowedWrites);
    expect(progressBody.writeTargetHint.activeDocumentPath).toBe(activeDocumentPath);
    expect(progressBody.writeTargetHint.hasPendingProposal).toBe(false);
    expect(progressBody.session.writeTargetHint.strictWorkflowWrites).toEqual(progressBody.strictWorkflowWrites);
    expect(progressBody.session.writeTargetHint.chatAllowedWrites).toEqual(progressBody.chatAllowedWrites);
    expect(progressBody.session.writeTargetHint.activeDocumentPath).toBe(activeDocumentPath);
    expect(progressBody.session.writeTargetHint.hasPendingProposal).toBe(false);

    const chatSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
      headers: {
        'x-active-document-path': encodeURIComponent(activeDocumentPath),
      },
    });
    expect(chatSessionResponse.statusCode).toBe(200);
    const chatSessionBody = JSON.parse(chatSessionResponse.body) as {
      writeTargetHint: {
        strictWorkflowWrites: string[];
        chatAllowedWrites: string[];
        activeDocumentPath: string | null;
        hasPendingProposal: boolean;
      };
    };
    expect(chatSessionBody.writeTargetHint.strictWorkflowWrites).toEqual(sessionBody.writeTargetHint.strictWorkflowWrites);
    expect(chatSessionBody.writeTargetHint.chatAllowedWrites).toContain(activeDocumentPath);
    expect(chatSessionBody.writeTargetHint.activeDocumentPath).toBe(activeDocumentPath);
    expect(chatSessionBody.writeTargetHint.hasPendingProposal).toBe(false);
    expect(chatSessionBody).not.toHaveProperty('preferredChatMode');

    await proposeWithMode(app, '生成一版创意脑暴草案', {
      chatMode: 'write',
      activeDocumentPath,
    });

    const pendingSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: {
        'x-active-document-path': encodeURIComponent(activeDocumentPath),
      },
    });
    expect(pendingSessionResponse.statusCode).toBe(200);
    expect(
      (JSON.parse(pendingSessionResponse.body) as {
        writeTargetHint: {
          chatAllowedWrites: string[];
          activeDocumentPath: string | null;
          hasPendingProposal: boolean;
        };
      }).writeTargetHint,
    ).toMatchObject({
      chatAllowedWrites: expect.arrayContaining([activeDocumentPath]),
      activeDocumentPath,
      hasPendingProposal: true,
    });

    await app.close();
  });

  it('restores project-local chat session on open without leaking the previous project state', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const betaMessages = [
      {
        role: 'assistant' as const,
        content: '这是 Beta 的历史消息。',
        attachments: [{ name: 'Beta 设定.md' }],
      },
      {
        role: 'user' as const,
        content: '继续沿着 Beta 的方向推进。',
      },
    ];

    const betaLegacySession = {
      messages: betaMessages,
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'direction-define',
          module: 'define',
          notes: ['Beta 的讨论备注'],
        },
      ],
      workflow: {
        initialized: true,
        currentMode: 'standard',
        currentStepId: 'ideation-build',
        currentSubstepId: 'setting-draft',
        currentVolumeNumber: 1,
        currentChapterNumber: 1,
        returnTarget: null,
      },
      preferredChatMode: 'write',
    };

    await writeProjectSession(betaRoot, betaLegacySession);

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });
    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我还在想主角是不是应该更腹黑一点');

    const alphaPending = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(alphaPending.body)).toMatchObject({
      session: {
        hasPendingProposal: true,
        waitingForApproval: true,
      },
    });

    const openResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_beta',
      },
    });

    expect(openResponse.statusCode).toBe(200);
    expect(JSON.parse(openResponse.body)).toMatchObject({
      activeProjectId: 'proj_beta',
      session: {
        initialized: true,
        currentStepId: 'ideation-build',
        currentModule: 'ideation',
        currentSubstepId: 'setting-draft',
        hasPendingProposal: false,
        hasPendingDecision: false,
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
    });

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
    });

    expect(getResponse.statusCode).toBe(200);
    const restoredSession = JSON.parse(getResponse.body) as {
      messages: typeof betaMessages;
      writeTargetHint: {
        strictWorkflowWrites: string[];
      };
    };
    expect(restoredSession).toMatchObject({
      messages: betaMessages,
      writeTargetHint: {
        strictWorkflowWrites: expect.any(Array),
      },
    });
    expect(restoredSession).not.toHaveProperty('preferredChatMode');
    expect(restoredSession.writeTargetHint.strictWorkflowWrites.length).toBeGreaterThan(0);

    const saveResponse = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: betaMessages,
      },
    });
    expect(saveResponse.statusCode).toBe(200);

    await expect(readProjectSession(betaRoot)).resolves.toEqual({
      version: 1,
      savedAt: expect.any(String),
      messages: betaMessages,
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'direction-define',
          module: 'define',
          notes: ['Beta 的讨论备注'],
        },
      ],
      workflow: {
        initialized: true,
        currentMode: 'standard',
        currentStepId: 'ideation-build',
        currentSubstepId: 'setting-draft',
        currentVolumeNumber: 1,
        currentChapterNumber: 1,
        returnTarget: null,
      },
    });

    await app.close();
  });

  it('restores the persisted workflow mode alongside the saved project-local position', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeProjectSession(alphaRoot, {
      messages: [{ role: 'assistant', content: '恢复工作流模式。' }],
      discussionNotes: [],
      workflow: {
        initialized: true,
        currentMode: 'analyze',
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        currentVolumeNumber: 1,
        currentChapterNumber: 1,
        returnTarget: null,
      },
    });

    const app = createApp({ skillPackPath, userConfigDir });

    const openResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });

    expect(openResponse.statusCode).toBe(200);
    expect(JSON.parse(openResponse.body)).toMatchObject({
      activeProjectId: 'proj_alpha',
      session: {
        initialized: true,
        currentMode: 'analyze',
        currentStepId: 'define-direction',
        currentModule: 'define',
        currentSubstepId: 'direction-define',
      },
    });

    await app.close();
  });

  it('restores project-local chat session by discarding only an invalid saved step or substep', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeProjectSession(alphaRoot, {
      messages: [
        { role: 'assistant', content: '这条安全消息应该被恢复。' },
        { role: 'user', content: '即使工作流快照无效也要保留。' },
      ],
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'direction-define',
          module: 'define',
          notes: ['这条讨论备注也应该继续保留'],
        },
      ],
      workflow: {
        initialized: true,
        currentMode: 'standard',
        currentStepId: 'define-direction',
        currentSubstepId: 'missing-substep',
        currentChapterNumber: 1,
        returnTarget: null,
      },
    });

    const app = createApp({ skillPackPath, userConfigDir });

    const openResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });

    expect(openResponse.statusCode).toBe(200);
    expect(JSON.parse(openResponse.body)).toMatchObject({
      activeProjectId: 'proj_alpha',
      session: {
        initialized: false,
        currentMode: 'standard',
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        hasPendingProposal: false,
        hasPendingDecision: false,
        waitingForApproval: false,
      },
    });

    const chatSession = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
    });

    expect(chatSession.statusCode).toBe(200);
    expect(JSON.parse(chatSession.body)).toEqual({
      messages: [
        { role: 'assistant', content: '这条安全消息应该被恢复。' },
        { role: 'user', content: '即使工作流快照无效也要保留。' },
      ],
      writeTargetHint: {
        chatAllowedWrites: [],
        activeDocumentPath: null,
        hasPendingProposal: false,
        strictWorkflowWrites: [],
      },
    });

    await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: [{ role: 'assistant', content: '重新保存以验证讨论缓存仍在。' }],
      },
    });

    await expect(readProjectSession(alphaRoot)).resolves.toEqual({
      version: 1,
      savedAt: expect.any(String),
      messages: [{ role: 'assistant', content: '重新保存以验证讨论缓存仍在。' }],
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'direction-define',
          module: 'define',
          notes: ['这条讨论备注也应该继续保留'],
        },
      ],
      workflow: {
        initialized: false,
        currentMode: 'standard',
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        currentVolumeNumber: 1,
        currentChapterNumber: 1,
        returnTarget: null,
      },
    });

    await app.close();
  });

  it('restores updated discussion memory for guide substeps after project reopen', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    const firstApp = createApp({ skillPackPath, userConfigDir });

    await firstApp.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });
    await firstApp.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(firstApp, 'guide');
    await propose(firstApp, '灵感切入');
    await propose(firstApp, '我只想先写人设');

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：可以先比较角色入口差异，再决定是否生成角色设定表。',
              },
            },
          ],
        }),
      })),
    );

    const discussionTurn = await propose(firstApp, '比较一下先写人设和直接生成角色设定表的差别');
    expect(JSON.parse(discussionTurn.body)).toMatchObject({
      reply: '模型讨论：可以先比较角色入口差异，再决定是否生成角色设定表。',
      session: {
        currentMode: 'guide',
        currentStepId: 'guide-entry',
        currentSubstepId: 'character-first',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.4_主要角色设定表.md' })]),
      }),
    });

    await firstApp.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: [{ role: 'assistant', content: '第一次保存，用来验证 guide 讨论记忆。' }],
      },
    });

    await firstApp.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    const reopenedApp = createApp({ skillPackPath, userConfigDir });

    const openResponse = await reopenedApp.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });

    expect(openResponse.statusCode).toBe(200);
    expect(JSON.parse(openResponse.body)).toMatchObject({
      activeProjectId: 'proj_alpha',
      session: {
        currentMode: 'guide',
        currentStepId: 'guide-entry',
        currentSubstepId: 'character-first',
        waitingForApproval: false,
        hasPendingProposal: false,
      },
    });

    await reopenedApp.inject({
      method: 'PUT',
      url: '/api/chat/session',
      payload: {
        messages: [{ role: 'assistant', content: '第二次保存，用来验证 reopened session。' }],
      },
    });

    const persistedSession = JSON.parse(await readFile(resolveProjectSessionPath(alphaRoot), 'utf8')) as {
      discussionNotes?: Array<{
        stepId: string;
        substepId: string;
        module: string;
        notes: string[];
      }>;
    };

    expect(persistedSession.discussionNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: 'guide-entry',
          substepId: 'character-first',
          module: 'guide',
          notes: expect.arrayContaining(['比较一下先写人设和直接生成角色设定表的差别']),
        }),
      ]),
    );

    await reopenedApp.close();
  });

  it('restores project-local chat session by ignoring malformed saved files during open', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    await writeProjectSession(betaRoot, {
      messages: [{ role: 'assistant', content: '这条历史消息会被损坏文件覆盖。' }],
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'direction-define',
          module: 'define',
          notes: ['这条备注也不应该恢复'],
        },
      ],
      workflow: {
        initialized: true,
        currentMode: 'standard',
        currentStepId: 'ideation-build',
        currentSubstepId: 'setting-draft',
        currentChapterNumber: 1,
        returnTarget: null,
      },
    });
    await writeFile(resolveProjectSessionPath(betaRoot), '{"version":', 'utf8');

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });
    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const alphaPending = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(alphaPending.body)).toMatchObject({
      session: {
        hasPendingProposal: true,
        waitingForApproval: true,
      },
    });

    const openResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_beta',
      },
    });

    expect(openResponse.statusCode).toBe(200);
    expect(JSON.parse(openResponse.body)).toMatchObject({
      activeProjectId: 'proj_beta',
      session: {
        initialized: false,
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        hasPendingProposal: false,
        hasPendingDecision: false,
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
    });

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
    });

    expect(getResponse.statusCode).toBe(200);
    expect(JSON.parse(getResponse.body)).toEqual({
      messages: [],
      writeTargetHint: {
        chatAllowedWrites: [],
        activeDocumentPath: null,
        hasPendingProposal: false,
        strictWorkflowWrites: [],
      },
    });

    await app.close();
  });

  it('POST /api/projects/open returns structured lifecycle errors for missing-path projects', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const missingRoot = path.join(projectsRoot, 'missing-root');

    await createProject({
      userConfigDir,
      rootPath: missingRoot,
      displayName: '待丢失项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T12:00:00.000Z',
      createProjectId: () => 'proj_missing',
    });
    await rm(missingRoot, { recursive: true, force: true });

    const app = createApp({ projectRoot: projectsRoot, skillPackPath, userConfigDir });

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_missing',
        entryMode: 'reference',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'missing-path',
        details: {
          projectId: 'proj_missing',
          rootPath: path.resolve(missingRoot),
        },
      },
    });

    await app.close();
  });

  it('resolves file and progress routes against the active project', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    await writeFile(path.join(alphaRoot, '1-边界', '预期.md'), '# Alpha Marker', 'utf8');
    await writeFile(path.join(betaRoot, '1-边界', '预期.md'), '# Beta Marker', 'utf8');
    await writeFile(
      path.join(alphaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Alpha 阶段', '继续完善 Alpha 大纲'),
      'utf8',
    );
    await writeFile(
      path.join(betaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Beta 阶段', '继续完善 Beta 大纲'),
      'utf8',
    );

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_beta',
        entryMode: 'create',
      },
    });

    const fileResponse = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
    });

    expect(fileResponse.statusCode).toBe(200);
    expect(JSON.parse(fileResponse.body)).toMatchObject({
      path: '1-边界/预期.md',
      content: '# Beta Marker',
    });

    const progressResponse = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(JSON.parse(progressResponse.body)).toMatchObject({
      progressSummary: {
        phase: 'Beta 阶段',
        coreTask: '继续完善 Beta 大纲',
      },
    });

    await app.close();
  });

  it('targets the explicit x-project-id for project routes after another project becomes active', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    await writeFile(path.join(alphaRoot, '1-边界', '预期.md'), '# Alpha Marker', 'utf8');
    await writeFile(path.join(betaRoot, '1-边界', '预期.md'), '# Beta Marker', 'utf8');
    await writeFile(
      path.join(alphaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Alpha 明确阶段', '继续完善 Alpha 明确大纲'),
      'utf8',
    );
    await writeFile(
      path.join(betaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Beta 当前阶段', '继续完善 Beta 当前大纲'),
      'utf8',
    );

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });
    const explicitAlphaHeaders = { 'x-project-id': 'proj_alpha' };
    const reopenBeta = async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/open',
        payload: {
          projectId: 'proj_beta',
          entryMode: 'create',
        },
      });
      expect(response.statusCode).toBe(200);
    };

    const openAlphaResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
        entryMode: 'create',
      },
    });
    expect(openAlphaResponse.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await reopenBeta();
    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    await reopenBeta();
    const saveResponse = await app.inject({
      method: 'PUT',
      url: '/api/file',
      headers: explicitAlphaHeaders,
      payload: {
        path: '3-大纲/3.1_全书结构总纲.md',
        content: '# Alpha Explicit Save',
      },
    });
    expect(saveResponse.statusCode).toBe(200);
    await expect(readFile(path.join(alphaRoot, '3-大纲', '3.1_全书结构总纲.md'), 'utf8')).resolves.toContain('Alpha Explicit Save');
    await expect(access(path.join(betaRoot, '3-大纲', '3.1_全书结构总纲.md'))).rejects.toThrow();

    await reopenBeta();
    const fileResponse = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
      headers: explicitAlphaHeaders,
    });
    expect(fileResponse.statusCode).toBe(200);
    expect(JSON.parse(fileResponse.body)).toMatchObject({
      path: '1-边界/预期.md',
      content: '# Alpha Marker',
    });

    await reopenBeta();
    const saveSessionResponse = await app.inject({
      method: 'PUT',
      url: '/api/chat/session',
      headers: {
        ...explicitAlphaHeaders,
        'content-type': 'application/json',
      },
      payload: {
        messages: [{ role: 'assistant', content: 'Alpha explicit session' }],
      },
    });
    expect(saveSessionResponse.statusCode).toBe(200);

    await reopenBeta();
    const loadSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
      headers: explicitAlphaHeaders,
    });
    expect(loadSessionResponse.statusCode).toBe(200);
    expect(JSON.parse(loadSessionResponse.body)).toMatchObject({
      messages: [{ role: 'assistant', content: 'Alpha explicit session' }],
    });

    await reopenBeta();
    const chatResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: explicitAlphaHeaders,
      payload: {
        message: '检查进度',
        approved: false,
      },
    });
    expect(chatResponse.statusCode).toBe(200);
    expect(JSON.parse(chatResponse.body)).toMatchObject({
      reply: expect.stringContaining('Alpha 明确阶段'),
    });

    await app.close();
  });

  it('targets the explicit x-project-id for session, progress, tree, creation, and stream routes after another project becomes active', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    await writeFile(path.join(alphaRoot, '1-边界', 'alpha-only.md'), '# Alpha Only', 'utf8');
    await writeFile(path.join(betaRoot, '1-边界', 'beta-only.md'), '# Beta Only', 'utf8');
    await writeFile(
      path.join(alphaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Alpha Stream 阶段', '继续完善 Alpha Stream 大纲'),
      'utf8',
    );
    await writeFile(
      path.join(betaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Beta Stream 阶段', '继续完善 Beta Stream 大纲'),
      'utf8',
    );

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });
    const explicitAlphaHeaders = { 'x-project-id': 'proj_alpha' };
    const reopenBeta = async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/open',
        payload: {
          projectId: 'proj_beta',
          entryMode: 'create',
        },
      });
      expect(response.statusCode).toBe(200);
    };

    const openAlphaResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
        entryMode: 'create',
      },
    });
    expect(openAlphaResponse.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await reopenBeta();

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: explicitAlphaHeaders,
    });
    expect(sessionResponse.statusCode).toBe(200);
    expect(JSON.parse(sessionResponse.body)).toMatchObject({
      initialized: true,
      currentStepId: 'define-direction',
    });

    await reopenBeta();
    const progressResponse = await app.inject({
      method: 'GET',
      url: '/api/progress',
      headers: explicitAlphaHeaders,
    });
    expect(progressResponse.statusCode).toBe(200);
    expect(JSON.parse(progressResponse.body)).toMatchObject({
      progressSummary: {
        phase: 'Alpha Stream 阶段',
        coreTask: '继续完善 Alpha Stream 大纲',
      },
    });

    await reopenBeta();
    const treeResponse = await app.inject({
      method: 'GET',
      url: '/api/files/tree',
      headers: explicitAlphaHeaders,
    });
    expect(treeResponse.statusCode).toBe(200);
    expect(treeResponse.body).toContain('alpha-only.md');
    expect(treeResponse.body).not.toContain('beta-only.md');

    await reopenBeta();
    const folderResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-folder',
      headers: explicitAlphaHeaders,
      payload: {
        parentPath: '2-设定',
        name: 'Alpha资料',
      },
    });
    expect(folderResponse.statusCode).toBe(200);
    await expect(access(path.join(alphaRoot, '2-设定', 'Alpha资料'))).resolves.toBeUndefined();
    await expect(access(path.join(betaRoot, '2-设定', 'Alpha资料'))).rejects.toThrow();

    await reopenBeta();
    const fileResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-file',
      headers: explicitAlphaHeaders,
      payload: {
        parentPath: '2-设定/Alpha资料',
        name: '人物.md',
      },
    });
    expect(fileResponse.statusCode).toBe(200);
    await expect(access(path.join(alphaRoot, '2-设定', 'Alpha资料', '人物.md'))).resolves.toBeUndefined();
    await expect(access(path.join(betaRoot, '2-设定', 'Alpha资料', '人物.md'))).rejects.toThrow();

    await reopenBeta();
    const streamResponse = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      headers: explicitAlphaHeaders,
      payload: {
        message: '检查进度',
        approved: false,
      },
    });
    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.body).toContain('event: done');
    expect(streamResponse.body).toContain('Alpha Stream 阶段');
    expect(streamResponse.body).not.toContain('Beta Stream 阶段');

    await app.close();
  });

  it('targets the explicit x-project-id when initializing a workspace after another project becomes active', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });
    const betaOpenResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_beta',
        entryMode: 'create',
      },
    });
    expect(betaOpenResponse.statusCode).toBe(200);

    const initResponse = await app.inject({
      method: 'POST',
      url: '/api/workspace/init',
      headers: { 'x-project-id': 'proj_alpha' },
    });
    expect(initResponse.statusCode).toBe(200);
    expect(JSON.parse(initResponse.body)).toMatchObject({
      initialized: true,
      hasPendingProposal: false,
    });

    const betaSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { 'x-project-id': 'proj_beta' },
    });
    expect(JSON.parse(betaSessionResponse.body)).toMatchObject({
      initialized: false,
      hasPendingProposal: false,
    });

    const alphaSessionResponse = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { 'x-project-id': 'proj_alpha' },
    });
    expect(JSON.parse(alphaSessionResponse.body)).toMatchObject({
      initialized: true,
      hasPendingProposal: false,
    });

    await app.close();
  });

  it('rejects unknown and mismatched explicit project identity without falling back to the active project', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });
    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_beta',
        entryMode: 'create',
      },
    });

    const unknownResponse = await app.inject({
      method: 'GET',
      url: '/api/files/tree',
      headers: { 'x-project-id': 'proj_missing' },
    });
    expect(unknownResponse.statusCode).toBe(404);
    expect(JSON.parse(unknownResponse.body)).toMatchObject({
      error: {
        code: 'project-not-found',
        details: {
          projectId: 'proj_missing',
        },
      },
    });

    const mismatchResponse = await app.inject({
      method: 'GET',
      url: '/api/files/tree',
      headers: {
        'x-project-id': 'proj_alpha',
        'x-project-root': betaRoot,
      },
    });
    expect(mismatchResponse.statusCode).toBe(409);
    expect(JSON.parse(mismatchResponse.body)).toMatchObject({
      error: {
        code: 'project-identity-mismatch',
        details: {
          projectId: 'proj_alpha',
          expectedRootPath: path.resolve(alphaRoot),
          requestedRootPath: path.resolve(betaRoot),
        },
      },
    });

    await app.close();
  });

  it('hydrates active project context from registry on boot', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    await writeFile(path.join(alphaRoot, '1-边界', '预期.md'), '# Alpha Boot Marker', 'utf8');
    await writeFile(path.join(betaRoot, '1-边界', '预期.md'), '# Beta Boot Marker', 'utf8');
    await writeFile(
      path.join(betaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Beta Boot 阶段', '继续完善 Beta Boot 大纲'),
      'utf8',
    );

    const app = createApp({ skillPackPath, userConfigDir });

    const activeResponse = await app.inject({ method: 'GET', url: '/api/projects/active' });
    expect(activeResponse.statusCode).toBe(200);
    expect(JSON.parse(activeResponse.body)).toMatchObject({
      activeProjectId: 'proj_beta',
      project: expect.objectContaining({ id: 'proj_beta' }),
    });

    const fileResponse = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
    });
    expect(fileResponse.statusCode).toBe(200);
    expect(JSON.parse(fileResponse.body)).toMatchObject({
      path: '1-边界/预期.md',
      content: '# Beta Boot Marker',
    });

    const progressResponse = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(progressResponse.statusCode).toBe(200);
    expect(JSON.parse(progressResponse.body)).toMatchObject({
      progressSummary: {
        phase: 'Beta Boot 阶段',
        coreTask: '继续完善 Beta Boot 大纲',
      },
    });

    await app.close();
  });

  it('keeps /api/projects/active consistent with file and progress routes after switching projects', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    await writeFile(path.join(alphaRoot, '1-边界', '预期.md'), '# Alpha Consistency Marker', 'utf8');
    await writeFile(path.join(betaRoot, '1-边界', '预期.md'), '# Beta Consistency Marker', 'utf8');
    await writeFile(
      path.join(alphaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Alpha Consistency 阶段', '继续完善 Alpha 一致性任务'),
      'utf8',
    );
    await writeFile(
      path.join(betaRoot, 'PROJECT.md'),
      buildProjectProgressContent('Beta Consistency 阶段', '继续完善 Beta 一致性任务'),
      'utf8',
    );

    const app = createApp({ skillPackPath, userConfigDir });

    const openAlpha = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });
    expect(openAlpha.statusCode).toBe(200);

    const activeAlpha = await app.inject({ method: 'GET', url: '/api/projects/active' });
    expect(JSON.parse(activeAlpha.body)).toMatchObject({
      activeProjectId: 'proj_alpha',
      project: expect.objectContaining({ id: 'proj_alpha' }),
    });

    const alphaFile = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
    });
    expect(alphaFile.statusCode).toBe(200);
    expect(JSON.parse(alphaFile.body).content).toBe('# Alpha Consistency Marker');

    const alphaProgress = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(alphaProgress.statusCode).toBe(200);
    expect(JSON.parse(alphaProgress.body)).toMatchObject({
      progressSummary: {
        phase: 'Alpha Consistency 阶段',
      },
    });

    const openBeta = await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_beta',
      },
    });
    expect(openBeta.statusCode).toBe(200);

    const activeBeta = await app.inject({ method: 'GET', url: '/api/projects/active' });
    expect(JSON.parse(activeBeta.body)).toMatchObject({
      activeProjectId: 'proj_beta',
      project: expect.objectContaining({ id: 'proj_beta' }),
    });

    const betaFile = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
    });
    expect(betaFile.statusCode).toBe(200);
    expect(JSON.parse(betaFile.body).content).toBe('# Beta Consistency Marker');

    const betaProgress = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(betaProgress.statusCode).toBe(200);
    expect(JSON.parse(betaProgress.body)).toMatchObject({
      progressSummary: {
        phase: 'Beta Consistency 阶段',
      },
    });

    await app.close();
  });

  it('clears active-project context when archiving the active project', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeFile(path.join(alphaRoot, '1-边界', '预期.md'), '# Archive Transition Marker', 'utf8');

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });

    const beforeArchive = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
    });
    expect(beforeArchive.statusCode).toBe(200);

    const archiveResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/archive',
      payload: {
        projectId: 'proj_alpha',
        archived: true,
      },
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(JSON.parse(archiveResponse.body)).toMatchObject({
      activeProjectId: null,
    });

    const activeAfterArchive = await app.inject({ method: 'GET', url: '/api/projects/active' });
    expect(JSON.parse(activeAfterArchive.body)).toMatchObject({
      activeProjectId: null,
      project: null,
    });

    const fileAfterArchive = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
    });
    expect(fileAfterArchive.statusCode).toBe(409);
    expect(JSON.parse(fileAfterArchive.body)).toMatchObject({
      error: {
        code: 'no-active-project',
      },
    });

    await app.close();
  });

  it('clears active-project context when deleting the active project from registry', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeFile(path.join(alphaRoot, '1-边界', '预期.md'), '# Delete Transition Marker', 'utf8');

    const app = createApp({ projectRoot: alphaRoot, skillPackPath, userConfigDir });

    const beforeDelete = await app.inject({
      method: 'GET',
      url: `/api/file?path=${encodeURIComponent('1-边界/预期.md')}`,
    });
    expect(beforeDelete.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/projects/proj_alpha',
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(JSON.parse(deleteResponse.body)).toMatchObject({
      activeProjectId: null,
      removedProjectId: 'proj_alpha',
    });

    const activeAfterDelete = await app.inject({ method: 'GET', url: '/api/projects/active' });
    expect(JSON.parse(activeAfterDelete.body)).toMatchObject({
      activeProjectId: null,
      project: null,
    });

    const progressAfterDelete = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(progressAfterDelete.statusCode).toBe(409);
    expect(JSON.parse(progressAfterDelete.body)).toMatchObject({
      error: {
        code: 'no-active-project',
      },
    });

    await app.close();
  });

  it('initializes the project and reports the current workflow session', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    const initResponse = await app.inject({
      method: 'POST',
      url: '/api/workspace/init',
    });

    expect(initResponse.statusCode).toBe(200);
    expect(JSON.parse(initResponse.body)).toMatchObject({
      initialized: true,
      currentMode: 'standard',
      currentStepId: 'define-direction',
      currentModule: 'define',
      currentSubstepId: 'direction-define',
      currentSubstepTitle: '方向定义',
      requiresApproval: true,
      pendingDecisionType: 'proposal_approval',
      waitingForApproval: false,
      hasPendingDecision: false,
      hasPendingProposal: false,
      interactionMode: 'discussion',
    });

    await expect(access(path.join(workspaceRoot, 'PROJECT.md'))).resolves.toBeUndefined();
    await app.close();
  });

  it('keeps ordinary discussion turns in discussion mode without creating a proposal', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：可以先继续打磨主角性格，再决定是否进入产出。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await propose(app, '我还在想主角是不是应该更腹黑一点');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });
    expect(JSON.parse(response.body).reply).not.toContain('先继续讨论，不会立刻生成待确认提案');
    expect(JSON.parse(response.body).reply).not.toContain('如果你想开始产出，直接说“生成草案”或“写入文件”');

    await app.close();
  });

  it('routes negated discussion wording with explicit generation intent to proposal mode', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await propose(app, '不要继续讨论，直接生成完整新书设定案草案并写入文件。');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.any(Array),
      }),
    });

    await app.close();
  });

  it('keeps plain premise statements in discussion mode until the user explicitly asks to generate', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const discussionResponse = await propose(app, '我想写一个以主题甲为核心的长篇故事。');
    expect(JSON.parse(discussionResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    const proposalResponse = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' })]),
      }),
    });

    await app.close();
  });

  it('lets backend planner route delegated ideation after a premise into proposal mode', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: '模型讨论：传统武侠方向已收到，可以继续构思。',
                },
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'proposal',
                    reason: '用户把传统武侠方向交给助手拿主意，需要产出一版创意提案。',
                  }),
                },
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: '已按传统武侠方向生成待确认提案。',
                    proposedWrites: [
                      {
                        path: '2-设定/2.1_创意脑暴.md',
                        content: '# 套路方向与核心设定\n\n传统武侠提案。',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        }),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const premiseResponse = await propose(app, '我想写一本类似《诛仙》一样的传统武侠小说');
    expect(JSON.parse(premiseResponse.body)).toMatchObject({
      session: {
        interactionMode: 'discussion',
        waitingForApproval: false,
      },
    });

    const proposalResponse = await propose(app, '你拿主意吧，按传统武侠方向推进');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' })]),
      }),
    });

    await app.close();
  });

  it('uses model-driven reply path for standard discussion when model is configured', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：可以先锁定主角动机与核心冲突，再决定修炼体系。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await propose(app, '我还在想主角是不是应该更腹黑一点');
    expect(JSON.parse(response.body)).toMatchObject({
      reply: '模型讨论：可以先锁定主角动机与核心冲突，再决定修炼体系。',
      session: {
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await app.close();
  });

  it('keeps explicit non-write intent turns in discussion mode', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await propose(app, '先别落盘，我们先讨论主角成长线');
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await app.close();
  });

  it('creates a proposal only when the user explicitly asks to generate or write', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' })]),
      }),
    });

    await app.close();
  });

  it('keeps plan-mode define turns in discussion even for strong write-intent phrases', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：先继续讨论当前文档目标，再决定是否进入写入提案。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const ordinaryResponse = await proposeWithMode(app, '我还在想主角成长线要不要更冷硬一些', {
      chatMode: 'plan',
    });
    expect(JSON.parse(ordinaryResponse.body)).toMatchObject({
      reply: '模型讨论：先继续讨论当前文档目标，再决定是否进入写入提案。',
      session: {
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    const writeIntentResponse = await proposeWithMode(app, '写入当前文档', {
      chatMode: 'plan',
      activeDocumentPath: '3-大纲/3.1_全书结构总纲.md',
    });
    expect(JSON.parse(writeIntentResponse.body)).toMatchObject({
      reply: '模型讨论：先继续讨论当前文档目标，再决定是否进入写入提案。',
      session: {
        currentStepId: 'define-direction',
        currentSubstepId: 'direction-define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await app.close();
  });

  it('keeps plan-mode analyze action phrases in discussion instead of creating pending decisions', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：这一步先确认样板书边界，再决定要不要进入下一步。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(path.join(workspaceRoot, '样板书.txt'), '第一章：样板书片段', 'utf8');

    await proposeWithMode(app, 'analyze', { chatMode: 'write' });

    const response = await proposeWithMode(app, '继续下一步', { chatMode: 'plan' });
    expect(JSON.parse(response.body)).toMatchObject({
      reply: '模型讨论：这一步先确认样板书边界，再决定要不要进入下一步。',
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: false,
        interactionMode: 'discussion',
        hasPendingDecision: false,
        hasPendingProposal: false,
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await app.close();
  });

  it('does not approve an existing write proposal when the approval turn is sent in plan mode', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我想写一个以主题甲为核心的长篇故事。');

    const writeProposal = await proposeWithMode(app, '生成一版创意脑暴草案', { chatMode: 'write' });
    expect(JSON.parse(writeProposal.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' })]),
      }),
    });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：当前仍处于讨论阶段，我不会在 plan 模式里执行旧提案。',
              },
            },
          ],
        }),
      })),
    );

    const response = await approveWithMode(app, '确认', { chatMode: 'plan' });
    expect(JSON.parse(response.body)).toMatchObject({
      reply: '模型讨论：当前仍处于讨论阶段，我不会在 plan 模式里执行旧提案。',
      session: {
        currentStepId: 'define-direction',
        currentModule: 'define',
        waitingForApproval: false,
        interactionMode: 'discussion',
        hasPendingDecision: false,
        hasPendingProposal: false,
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.not.toContain('主题甲');

    await app.close();
  });

  it('separates analyze discussion, confirm-only decisions, and write proposals', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    const enterAnalyze = await propose(app, 'analyze');
    expect(JSON.parse(enterAnalyze.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: false,
        interactionMode: 'discussion',
        hasPendingDecision: false,
        hasPendingProposal: false,
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    const discussionTurn = await propose(app, '这个阶段要注意什么？');
    expect(JSON.parse(discussionTurn.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    const continueDecision = await propose(app, '继续下一步');
    expect(JSON.parse(continueDecision.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: true,
        interactionMode: 'decision',
        hasPendingDecision: true,
        hasPendingProposal: false,
      },
      pendingDecision: expect.objectContaining({
        decisionType: 'substep_confirmation',
      }),
      pendingProposal: null,
    });

    const decisionApproved = await approve(app);
    expect(JSON.parse(decisionApproved.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: false,
        interactionMode: 'discussion',
        hasPendingDecision: false,
        hasPendingProposal: false,
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    const modeBProposal = await propose(app, '方式 B');
    expect(JSON.parse(modeBProposal.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: true,
        interactionMode: 'proposal',
        hasPendingDecision: false,
        hasPendingProposal: true,
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.1_全书故事梗概.md' })]),
      }),
    });

    await app.close();
  });

  it('keeps mixed compare phrasing in analyze discussion even when A/B tokens are mentioned', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：可以先比较方式 A 和方式 B 的差别，再决定要不要进入生成。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(path.join(workspaceRoot, '样板书.txt'), '第一章：样板书片段', 'utf8');

    await propose(app, 'analyze');
    await propose(app, '继续下一步');
    await approve(app);

    const response = await propose(app, '比较一下方式 A 和方式 B 的差别，为什么这里先让我们选？');
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await app.close();
  });

  it('still treats explicit analyze mode selection phrases as actions', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(path.join(workspaceRoot, '样板书.txt'), '第一章：样板书片段', 'utf8');

    await propose(app, 'analyze');
    await propose(app, '继续下一步');
    await approve(app);

    const response = await propose(app, '方式 B');
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.1_全书故事梗概.md' })]),
      }),
    });

    await app.close();
  });

  it('escapes a restored analyze session for explicit write-mode proposal requests', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });

    await writeProjectSession(alphaRoot, {
      messages: [{ role: 'assistant', content: '恢复到 Analyze 流程。' }],
      discussionNotes: [],
      workflow: {
        initialized: true,
        currentMode: 'analyze',
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        currentChapterNumber: 1,
        returnTarget: null,
      },
    });

    const app = createApp({ skillPackPath, userConfigDir });

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: {
        projectId: 'proj_alpha',
      },
    });

    const response = await proposeWithMode(
      app,
      '请直接写入 1-边界/1.2_文风.md，给我一版克制、冷峻、带压迫感的文风说明。',
      { chatMode: 'write' },
    );

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentMode: 'standard',
        currentStepId: 'define-direction',
        currentModule: 'define',
        waitingForApproval: true,
        interactionMode: 'proposal',
        hasPendingProposal: true,
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.2_文风.md' })]),
      }),
    });

    await app.close();
  });

  it('returns an empty progress payload before initialization', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    const response = await app.inject({ method: 'GET', url: '/api/progress' });

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        initialized: false,
      },
      progressSummary: {
        phase: '未初始化',
      },
    });

    await app.close();
  });

  it('exposes strict workflow writes separately from chat/manual writable paths', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(JSON.parse(response.body)).toMatchObject({
      strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', 'PROJECT.md'],
      chatAllowedWrites: expect.arrayContaining(['3-大纲/3.1_全书结构总纲.md']),
      manualWritablePaths: expect.arrayContaining(['3-大纲/3.1_全书结构总纲.md']),
    });

    await app.close();
  });

  it('expands progress write scopes when an active document path is provided', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress',
      headers: {
        'x-active-document-path': encodeURIComponent('3-大纲/3.1_全书结构总纲.md'),
      },
    });

    expect(JSON.parse(response.body)).toMatchObject({
      strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', 'PROJECT.md'],
      chatAllowedWrites: expect.arrayContaining(['3-大纲/3.1_全书结构总纲.md']),
      manualWritablePaths: expect.arrayContaining(['3-大纲/3.1_全书结构总纲.md']),
    });

    await app.close();
  });

  it('saves and returns model settings', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/settings/model',
      payload: {
        activeModelId: 'secondary',
        models: {
          primary: {
            provider: 'openai-compatible',
            baseUrl: 'https://example.com/v1',
            apiKey: 'secret-key-a',
            model: 'gpt-4o-mini',
            temperature: 0.5,
            stream: true,
          },
          secondary: {
            provider: 'gemini-native',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            apiKey: 'secret-key-b',
            model: 'gemini-2.5-pro',
            temperature: 0.2,
            stream: true,
          },
        },
      },
    });

    expect(saveResponse.statusCode).toBe(200);

    const readResponse = await app.inject({ method: 'GET', url: '/api/settings/model' });
    expect(JSON.parse(readResponse.body)).toMatchObject({
      activeModelId: 'secondary',
      models: {
        primary: expect.objectContaining({
          provider: 'openai-compatible',
          model: 'gpt-4o-mini',
        }),
        secondary: expect.objectContaining({
          provider: 'gemini-native',
          model: 'gemini-2.5-pro',
        }),
      },
    });

    await app.close();
  });

  it('rejects invalid model settings payloads without persisting them', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/model',
      payload: {
        activeModelId: 'missing',
        models: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'invalid-model-settings',
      },
    });

    const readResponse = await app.inject({ method: 'GET', url: '/api/settings/model' });
    expect(JSON.parse(readResponse.body).activeModelId).toBe('primary');

    await app.close();
  });

  it('rejects invalid model test payloads with structured 400 responses', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/model/test',
      payload: {
        provider: 'openai-compatible',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'invalid-model-settings',
      },
    });

    await app.close();
  });

  it('creates files and folders through the file tree API', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const folderResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-folder',
      payload: {
        parentPath: '2-设定',
        name: '角色资料',
      },
    });
    expect(folderResponse.statusCode).toBe(200);

    const fileResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-file',
      payload: {
        parentPath: '2-设定/角色资料',
        name: '配角.md',
      },
    });
    expect(fileResponse.statusCode).toBe(200);

    await expect(access(path.join(workspaceRoot, '2-设定', '角色资料'))).resolves.toBeUndefined();
    await expect(readFile(path.join(workspaceRoot, '2-设定', '角色资料', '配角.md'), 'utf8')).resolves.toBe('');

    await app.close();
  });

  it('rejects path-shaped file and folder names with structured 400 responses', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const folderResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-folder',
      payload: {
        parentPath: '2-设定',
        name: '角色/资料',
      },
    });
    expect(folderResponse.statusCode).toBe(400);
    expect(JSON.parse(folderResponse.body)).toMatchObject({
      error: {
        code: 'invalid-project-entry-name',
      },
    });

    const fileResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-file',
      payload: {
        parentPath: '2-设定',
        name: '../配角.md',
      },
    });
    expect(fileResponse.statusCode).toBe(400);
    expect(JSON.parse(fileResponse.body)).toMatchObject({
      error: {
        code: 'invalid-project-entry-name',
      },
    });

    const parentEscapeResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-file',
      payload: {
        parentPath: '../outside',
        name: '配角.md',
      },
    });
    expect(parentEscapeResponse.statusCode).toBe(400);
    expect(JSON.parse(parentEscapeResponse.body)).toMatchObject({
      error: {
        code: 'invalid-project-entry-name',
      },
    });

    const malformedBodyResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-folder',
      payload: {
        parentPath: '2-设定',
      },
    });
    expect(malformedBodyResponse.statusCode).toBe(400);
    expect(JSON.parse(malformedBodyResponse.body)).toMatchObject({
      error: {
        code: 'invalid-project-entry-name',
      },
    });

    const missingBodyResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-file',
    });
    expect(missingBodyResponse.statusCode).toBe(400);
    expect(JSON.parse(missingBodyResponse.body)).toMatchObject({
      error: {
        code: 'invalid-project-entry-name',
      },
    });

    await app.close();
  });

  it('rejects file tree creation through symlinked parent directories', async () => {
    const workspaceRoot = await makeWorkspace();
    const outsideRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await symlink(outsideRoot, path.join(workspaceRoot, '2-设定', 'linked-outside'), 'dir');

    const folderResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-folder',
      payload: {
        parentPath: '2-设定/linked-outside',
        name: '角色资料',
      },
    });
    expect(folderResponse.statusCode).toBe(400);

    const fileResponse = await app.inject({
      method: 'POST',
      url: '/api/files/create-file',
      payload: {
        parentPath: '2-设定/linked-outside',
        name: '角色资料.md',
      },
    });
    expect(fileResponse.statusCode).toBe(400);
    await expect(access(path.join(outsideRoot, '角色资料'))).rejects.toThrow();
    await expect(access(path.join(outsideRoot, '角色资料.md'))).rejects.toThrow();

    await app.close();
  });

  it('returns observable chat stream SSE with progress before done and no fake token events', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({
      projectRoot: workspaceRoot,
      skillPackPath,
      userConfigDir: workspaceRoot,
      chatStreamHeartbeatIntervalMs: 1,
    });
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', createAutoProposalFetchWithDelay(5));

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
        requestId: 'stream-progress-success',
      },
    });
    const events = readSseEvents(response.body);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: ready');
    expect(response.body).toContain('data: {"transport":"completed-turn-sse"}');
    expect(response.body.indexOf('event: ready')).toBeLessThan(response.body.indexOf('event: done'));
    expect(events.some((item) => item.event === 'phase')).toBe(true);
    expect(events.some((item) => item.event === 'heartbeat')).toBe(true);
    expect(events.filter((item) => item.event === 'phase').map((item) => (item.data as { phase?: string }).phase)).toEqual(
      expect.arrayContaining(['preparing', 'building_prompt', 'calling_model', 'validating', 'snapshotting']),
    );
    expect(events.find((item) => item.event === 'heartbeat')?.data).toMatchObject({
      requestId: 'stream-progress-success',
      phase: expect.any(String),
    });
    expect(response.body).not.toContain('event: token');
    expect(response.body).toContain('event: proposal_item');
    expect(response.body).toContain('event: done');

    await app.close();
  });

  it('emits model-generation progress phases for explicit project stream requests without a client request id', async () => {
    const userConfigDir = await makeWorkspace();
    const projectsRoot = await makeWorkspace();
    const alphaRoot = path.join(projectsRoot, 'alpha');
    const betaRoot = path.join(projectsRoot, 'beta');

    await createProject({
      userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta 项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_beta',
    });
    const app = createApp({
      projectRoot: alphaRoot,
      skillPackPath,
      userConfigDir,
      chatStreamHeartbeatIntervalMs: 1,
    });
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', createAutoProposalFetchWithDelay(5));

    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_alpha', entryMode: 'create' },
    });
    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await app.inject({
      method: 'POST',
      url: '/api/projects/open',
      payload: { projectId: 'proj_beta', entryMode: 'create' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      headers: { 'x-project-id': 'proj_alpha' },
      payload: {
        message: '生成 Alpha 专属创意脑暴草案',
        approved: false,
      },
    });
    const events = readSseEvents(response.body);
    const phaseEvents = events.filter((item) => item.event === 'phase') as Array<{ event: string; data: { phase?: string; requestId?: string } }>;
    const requestIds = new Set(phaseEvents.map((item) => item.data.requestId).filter(Boolean));

    expect(response.statusCode).toBe(200);
    expect(phaseEvents.map((item) => item.data.phase)).toEqual(
      expect.arrayContaining(['preparing', 'building_prompt', 'calling_model', 'validating', 'snapshotting']),
    );
    expect(requestIds.size).toBe(1);
    expect(response.body).toContain('event: done');

    await app.close();
  });

  it('emits structured stream error events when the injected chat turn fails after ready', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({
      projectRoot: workspaceRoot,
      skillPackPath,
      userConfigDir: workspaceRoot,
    });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: {
            message: 'backend model rejected the request',
          },
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: ready');
    expect(response.body).toContain('event: phase');
    expect(response.body).toContain('event: error');
    expect(response.body.indexOf('event: ready')).toBeLessThan(response.body.indexOf('event: error'));
    expect(response.body.indexOf('event: phase')).toBeLessThan(response.body.indexOf('event: error'));
    expect(response.body).toContain('"statusCode":502');
    expect(response.body).toContain('"code":"proposal-upstream-response"');
    expect(response.body).toContain('"message":"提案生成失败：openai-compatible 模型服务返回了非成功响应。"');
    expect(response.body).toContain('"provider":"openai-compatible"');

    await app.close();
  });

  it('emits structured stream error events when the injected chat turn returns malformed JSON after ready', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });
    const originalInject = app.inject.bind(app);

    vi.spyOn(app, 'inject').mockImplementation(((options: Parameters<typeof app.inject>[0]) => {
      if (typeof options === 'object' && options !== null && 'url' in options && options.url === '/api/chat') {
        return Promise.resolve({
          statusCode: 200,
          body: 'not json',
        });
      }

      return originalInject(options);
    }) as typeof app.inject);

    await originalInject({ method: 'POST', url: '/api/workspace/init' });

    const response = await originalInject({
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: ready');
    expect(response.body).toContain('event: error');
    expect(response.body).toContain('"statusCode":500');
    expect(response.body).toContain('"code":"chat-stream-turn-failed"');
    expect(response.body).toContain('"message":"聊天流响应生成失败，请稍后重试。"');

    await app.close();
  });

  it('returns plan-mode stream compatibility turns as discussion and write-mode turns with proposal items', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：plan 模式下先讨论当前文档目标，不直接生成提案。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const planResponse = await app.inject({
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        message: '写入当前文档',
        approved: false,
        chatMode: 'plan',
        activeDocumentPath: '3-大纲/3.1_全书结构总纲.md',
      },
    });

    expect(planResponse.statusCode).toBe(200);
    expect(planResponse.body).not.toContain('event: token');
    expect(planResponse.body).toContain('event: done');
    expect(planResponse.body).not.toContain('event: proposal_item');
    expect(planResponse.body).toContain('"interactionMode":"discussion"');
    expect(planResponse.body).toContain('"pendingProposal":null');
    expect(planResponse.body).toContain('"pendingDecision":null');

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    const writeResponse = await injectWithAutoModel(app, {
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
        chatMode: 'write',
      },
    });

    expect(writeResponse.statusCode).toBe(200);
    expect(writeResponse.body).toContain('event: proposal_item');
    expect(writeResponse.body).toContain('"interactionMode":"proposal"');

    await app.close();
  });

  it('persists server-owned workflow snapshots after stream approval mutations', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    await injectWithAutoModel(app, {
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });
    await injectWithAutoModel(app, {
      method: 'POST',
      url: '/api/chat/stream',
      payload: {
        message: '确认',
        approved: true,
      },
    });

    await expect(readProjectSession(workspaceRoot)).resolves.toMatchObject({
      workflow: {
        currentStepId: 'ideation-build',
        currentSubstepId: 'setting-draft',
      },
    });

    await app.close();
  });

  it('enters guide mode, migrates legacy assets, and routes to write', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(path.join(workspaceRoot, '旧设定.md'), '# 旧设定\n\n世界观：组织体系甲。', 'utf8');
    await writeFile(
      path.join(workspaceRoot, '旧章纲.md'),
      '第1章：旧章纲开篇\n\n**章节梗概**：先活下来。\n\n**场景拆解**：\n- 场景1：旧势力逼近',
      'utf8',
    );

    const enterResponse = await propose(app, 'guide');

    expect(JSON.parse(enterResponse.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentModule: 'guide',
        currentSubstepId: 'choose-guide-mode',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    const proposalResponse = await propose(app, '带资进组');

    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentModule: 'guide',
        currentSubstepId: 'scan-assets',
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: [
          { path: '2-设定/2.2_新书设定案.md' },
          { path: '3-大纲/第01卷_章纲.md' },
          { path: 'PROJECT.md' },
        ],
      },
    });

    const approvedResponse = await approve(app);

    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      reply: '已写入提案文件，并进入【单章正文写作】。',
      session: {
        currentStepId: 'write-chapter',
        currentModule: 'write',
        currentChapterNumber: 1,
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.2_新书设定案.md'), 'utf8'),
    ).resolves.toContain('组织体系甲');
    await expect(
      readFile(path.join(workspaceRoot, '3-大纲', '第01卷_章纲.md'), 'utf8'),
    ).resolves.toContain('旧章纲开篇');

    await app.close();
  });

  it('supports guide inspiration-first branch and routes to ideation after approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    await propose(app, 'guide');

    const branchChoice = await propose(app, '灵感切入');
    expect(JSON.parse(branchChoice.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentSubstepId: 'choose-entry-focus',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    const branchProposal = await propose(app, '我只想先写人设');
    expect(JSON.parse(branchProposal.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentSubstepId: 'character-first',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.4_主要角色设定表.md' })]),
      }),
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      reply: '已写入提案文件，并进入【创意孵化与设定构建】。',
      session: {
        currentStepId: 'ideation-build',
        currentModule: 'ideation',
        currentSubstepId: 'setting-draft',
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('keeps guide discussion compare turns in discussion mode until the user explicitly asks for a write proposal', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：先比较两个入口的差别，再决定要不要生成角色设定表。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, 'guide');
    await propose(app, '灵感切入');
    await propose(app, '我只想先写人设');

    const discussionResponse = await propose(app, '比较一下先写人设和直接生成角色设定表的差别');
    expect(JSON.parse(discussionResponse.body)).toMatchObject({
      reply: '模型讨论：先比较两个入口的差别，再决定要不要生成角色设定表。',
      session: {
        currentStepId: 'guide-entry',
        currentModule: 'guide',
        currentSubstepId: 'character-first',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.4_主要角色设定表.md' })]),
      }),
    });

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    const proposalResponse = await propose(app, '重新生成一版角色设定表，主角更冷硬一些');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentModule: 'guide',
        currentSubstepId: 'character-first',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.4_主要角色设定表.md' })]),
      }),
    });

    await app.close();
  });

  it('lets guide inspiration substeps regenerate into an active off-stage document without forcing stage advance', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, 'guide');
    await propose(app, '灵感切入');

    const branchProposal = await propose(app, '我只想先写人设');
    expect(JSON.parse(branchProposal.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentSubstepId: 'character-first',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.4_主要角色设定表.md' })]),
      }),
    });

    const regenerated = await injectWithAutoModel(app, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '重新生成一版，写进 3-大纲/3.1_全书结构总纲.md，先整理主线骨架。',
        activeDocumentPath: '3-大纲/3.1_全书结构总纲.md',
        approved: false,
      },
    });

    expect(JSON.parse(regenerated.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentModule: 'guide',
        currentSubstepId: 'character-first',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({ path: '3-大纲/3.1_全书结构总纲.md' }),
        ]),
      }),
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      session: {
        currentStepId: 'guide-entry',
        currentModule: 'guide',
        currentSubstepId: 'character-first',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '3-大纲', '3.1_全书结构总纲.md'), 'utf8'),
    ).resolves.toContain('核心方向');

    await app.close();
  });

  it('can review ideation assets and then return to the same ideation substep', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);

    const reviewProposal = await propose(app, '审查当前设定');
    expect(JSON.parse(reviewProposal.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentModule: 'review',
        currentSubstepId: 'setting-review',
        currentStepTitle: '设定质检',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '5-审查/设定审查报告.md' })]),
      }),
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      reply: '已写入提案文件，并返回【创意孵化与设定构建】。',
      session: {
        currentStepId: 'ideation-build',
        currentModule: 'ideation',
        currentSubstepId: 'setting-draft',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('can review outlines and then return to outline planning', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);

    const blockedResponse = await propose(app, '审查当前大纲');
    expect(JSON.parse(blockedResponse.body)).toMatchObject({
      reply: expect.stringContaining('缺少必要文件'),
      session: {
        currentStepId: 'outline-plan',
        currentSubstepId: 'master-outline',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await completeOutline(app);

    const reviewProposal = await propose(app, '审查当前大纲');
    expect(JSON.parse(reviewProposal.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentModule: 'review',
        currentSubstepId: 'outline-review',
        currentStepTitle: '大纲质检',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '5-审查/大纲审查报告.md' })]),
      }),
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      reply: '已写入提案文件，并返回【单章正文写作】。',
      session: {
        currentStepId: 'write-chapter',
        currentModule: 'write',
        currentSubstepId: 'chapter-draft',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('returns to the preserved standard location when choosing 标准模式 inside guide', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);

    await propose(app, 'guide');

    const response = await propose(app, '标准模式');
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'ideation-build',
        currentModule: 'ideation',
        currentSubstepId: 'setting-draft',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('enters analyze mode, generates reference assets, and routes to ideation', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。\n第二章 初试差异化能力\n线索甲能预知短暂未来，让主角躲过外部压力。\n第三章 阶段反转\n主角借势阶段反转，建立第一轮期待。',
      'utf8',
    );

    const proposalResponse = await propose(app, 'analyze');

    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentModule: 'analyze',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await propose(app, '继续');
    await approve(app);

    const modeBProposal = await propose(app, '方式 B');
    expect(JSON.parse(modeBProposal.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.1_全书故事梗概.md' })]),
      }),
    });
    await approve(app);

    const styleProposal = await propose(app, '继续');
    expect(JSON.parse(styleProposal.body)).toMatchObject({
      session: {
        currentSubstepId: 'style-analysis',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.2_文风.md' })]),
      }),
    });
    await approve(app);

    const tropeProposal = await propose(app, '继续');
    expect(JSON.parse(tropeProposal.body)).toMatchObject({
      session: {
        currentSubstepId: 'trope-analysis',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.3_套路方向.md' })]),
      }),
    });
    await approve(app);

    const frameworkProposal = await propose(app, '继续');
    expect(JSON.parse(frameworkProposal.body)).toMatchObject({
      session: {
        currentSubstepId: 'framework-analysis',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.4_全书框架.md' })]),
      }),
    });
    await approve(app);

    const microProposal = await propose(app, '继续');
    expect(JSON.parse(microProposal.body)).toMatchObject({
      session: {
        currentSubstepId: 'micro-analysis',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.5_微观节奏拆解.md' })]),
      }),
    });
    await approve(app);

    const customProposal = await propose(app, '不需要自定义拆解');
    expect(JSON.parse(customProposal.body)).toMatchObject({
      session: {
        currentSubstepId: 'custom-analysis',
        waitingForApproval: true,
        interactionMode: 'decision',
      },
      pendingDecision: expect.objectContaining({
        decisionType: 'substep_confirmation',
      }),
      pendingProposal: null,
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      reply: '已确认当前决策，并进入【创意孵化与设定构建】。',
      session: {
        currentStepId: 'ideation-build',
        currentModule: 'ideation',
        currentSubstepId: 'setting-draft',
        currentChapterNumber: 1,
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '1.1_全书故事梗概.md'), 'utf8'),
    ).resolves.toContain('开局事件');
    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '1.3_套路方向.md'), 'utf8'),
    ).resolves.toContain('线索甲');

    await app.close();
  });

  it('supports natural-language analyze triggers and can reset back to standard mode', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    const analyzeResponse = await propose(app, '帮我分析样板书');
    expect(JSON.parse(analyzeResponse.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentModule: 'analyze',
        currentSubstepId: 'prepare-sample-book',
      },
    });

    const defineResponse = await propose(app, '切回标准模式');
    expect(JSON.parse(defineResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        currentModule: 'define',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('supports mode A env guidance before continuing story summary', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    await propose(app, 'analyze');
    await propose(app, '继续');
    await approve(app);

    const envResponse = await propose(app, '方式 A');
    expect(JSON.parse(envResponse.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '.env' })]),
      }),
    });

    await approve(app);
    await writeFile(path.join(workspaceRoot, '.env'), 'NOVEL_API_KEY=test\n', 'utf8');

    const readyResponse = await propose(app, '已填写');
    expect(JSON.parse(readyResponse.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'await-env-confirmation',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.1_全书故事梗概.md' })]),
      }),
    });

    await app.close();
  });

  it('keeps analyze hold-intent turns in discussion even with broad action words', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    await propose(app, 'analyze');

    const response = await propose(app, '继续讨论一下，这一步和后面的分析有什么区别，为什么要先做？');
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await app.close();
  });

  it('keeps analyze discussion compare turns in discussion mode until the user explicitly chooses a summary mode', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：可以先比较方式 A 和方式 B 的投入差异，再决定走哪条路。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    await propose(app, 'analyze');
    await propose(app, '继续');
    await approve(app);

    const discussionResponse = await propose(app, '比较一下方式 A 和方式 B 的差别');
    expect(JSON.parse(discussionResponse.body)).toMatchObject({
      reply: '模型讨论：可以先比较方式 A 和方式 B 的投入差异，再决定走哪条路。',
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    const proposalResponse = await propose(app, '方式 B');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'choose-summary-mode',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.1_全书故事梗概.md' })]),
      }),
    });

    await app.close();
  });

  it('uses model-driven reply path for analyze discussion turns when model is configured', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：这一步先确认样板书输入边界，后续各分析维度会更稳定。',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    await propose(app, 'analyze');
    const response = await propose(app, '这个阶段要注意什么？');

    expect(JSON.parse(response.body)).toMatchObject({
      reply: '模型讨论：这一步先确认样板书输入边界，后续各分析维度会更稳定。',
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });

    await app.close();
  });

  it('surfaces a discussion error and clears pending proposal state when held discussion cannot reach a model', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const proposalResponse = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
      },
      pendingProposal: expect.any(Object),
    });

    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const response = await propose(app, '先聊聊为什么要这样设计方向');
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(503);
    expect(payload).toMatchObject({
      error: {
        code: 'discussion-api-key-missing',
        message: expect.stringContaining('API Key'),
      },
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });
    expect(payload).not.toHaveProperty('reply');

    await app.close();
  });

  it('surfaces a discussion error for analyze discussion turns when the model returns a non-ok response', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    await propose(app, 'analyze');

    const response = await propose(app, '这个阶段要注意什么？');
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(502);
    expect(payload).toMatchObject({
      error: {
        code: 'discussion-upstream-response',
        details: {
          provider: 'openai-compatible',
          status: 502,
        },
      },
      session: {
        currentStepId: 'analyze-entry',
        currentSubstepId: 'prepare-sample-book',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });
    expect(payload).not.toHaveProperty('reply');

    await app.close();
  });

  it('surfaces a model-required proposal error when no model credentials are configured', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    const legacySession = {
      messages: [{ role: 'assistant' as const, content: '旧会话模式不应再暴露。' }],
      discussionNotes: [],
      workflow: null,
      preferredChatMode: 'write' as const,
    };

    await writeProjectSession(workspaceRoot, legacySession);

    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(503);
    expect(payload).toMatchObject({
      error: {
        code: 'proposal-model-required',
        message: expect.stringContaining('配置模型'),
      },
      session: {
        currentStepId: 'define-direction',
        currentModule: 'define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });
    expect(payload).not.toHaveProperty('reply');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(JSON.parse(sessionResponse.body)).toMatchObject({
      messages: legacySession.messages,
      writeTargetHint: {
        strictWorkflowWrites: expect.any(Array),
      },
    });
    expect(JSON.parse(sessionResponse.body)).not.toHaveProperty('preferredChatMode');

    await app.close();
  });

  it('does not draft outside Vitest when no model credentials are configured', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(503);
    expect(payload).toMatchObject({
      error: {
        code: 'proposal-model-required',
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('surfaces a proposal parse error instead of falling back locally when model output is invalid', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    const legacySession = {
      messages: [{ role: 'assistant' as const, content: '旧会话模式不应再暴露。' }],
      discussionNotes: [],
      workflow: null,
      preferredChatMode: 'write' as const,
    };

    await writeProjectSession(workspaceRoot, legacySession);

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'not valid json',
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(502);
    expect(payload).toMatchObject({
      error: {
        code: 'proposal-invalid-response',
      },
      session: {
        currentStepId: 'define-direction',
        currentModule: 'define',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingDecision: null,
      pendingProposal: null,
    });
    expect(payload).not.toHaveProperty('reply');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/chat/session',
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(JSON.parse(sessionResponse.body)).toMatchObject({
      messages: legacySession.messages,
      writeTargetHint: {
        strictWorkflowWrites: expect.any(Array),
      },
    });
    expect(JSON.parse(sessionResponse.body)).not.toHaveProperty('preferredChatMode');

    await app.close();
  });

  it('creates a pending write proposal and only writes files after approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我想写一个以主题甲为核心的长篇故事。');

    const proposalResponse = await injectWithAutoModel(app, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });

    expect(proposalResponse.statusCode).toBe(200);
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      pendingProposal: {
        id: expect.any(String),
        version: 1,
        status: 'pending',
        title: expect.any(String),
        kind: 'multi-file',
        proposedWrites: [
          { path: '2-设定/2.1_创意脑暴.md', label: '2.1_创意脑暴.md' },
          { path: '1-边界/1.2_文风.md', label: '1.2_文风.md' },
        ],
      },
      session: {
        currentStepId: 'define-direction',
        currentModule: 'define',
        waitingForApproval: true,
      },
    });
    expect(
      (JSON.parse(proposalResponse.body) as {
        pendingProposal: {
          proposedWrites: Array<{ path: string }>;
        };
      }).pendingProposal.proposedWrites,
    ).not.toContainEqual({ path: 'PROJECT.md' });

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('占位模板');

    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '1.2_文风.md'), 'utf8'),
    ).resolves.toContain('# 文风指南');

    const approvedResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认，写入这些内容并进入下一步',
        approved: true,
      },
    });

    expect(approvedResponse.statusCode).toBe(200);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      pendingProposal: null,
      session: {
        currentStepId: 'ideation-build',
        currentModule: 'ideation',
        waitingForApproval: false,
      },
    });

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('主题甲');

    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '1.2_文风.md'), 'utf8'),
    ).resolves.toContain('# 文风指南 (Style Guide)');
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '# PROJECT.md — 项目控制面板',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '-> 1-边界/1.2_文风.md',
    );

    await app.close();
  });

  it('rejects approval actions that target a stale proposal id', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我想写一个苟道修仙的长篇故事。');

    const proposalResponse = await propose(app, '生成一版创意脑暴草案');
    const proposalPayload = JSON.parse(proposalResponse.body) as {
      pendingProposal: { id: string };
    };

    expect(proposalPayload.pendingProposal.id).toBeTruthy();

    const staleApprovalResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认写入',
        approved: true,
        proposalAction: {
          type: 'approve',
          proposalId: 'proposal-not-current',
        },
      },
    });

    expect(staleApprovalResponse.statusCode).toBe(200);
    expect(JSON.parse(staleApprovalResponse.body)).toMatchObject({
      reply: expect.stringContaining('不再是当前提案'),
      pendingProposal: {
        id: proposalPayload.pendingProposal.id,
      },
    });

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('占位模板');

    await app.close();
  });

  it('approves a matching proposal action payload and writes the pending proposal', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我想写一个苟道修仙的长篇故事。');

    const proposalResponse = await propose(app, '生成一版创意脑暴草案');
    const proposalPayload = JSON.parse(proposalResponse.body) as {
      pendingProposal: { id: string };
    };

    const approvedResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认写入当前提案',
        approved: true,
        proposalAction: {
          type: 'approve',
          proposalId: proposalPayload.pendingProposal.id,
        },
      },
    });

    expect(approvedResponse.statusCode).toBe(200);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      pendingProposal: null,
      session: {
        waitingForApproval: false,
      },
    });
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('苟道修仙');

    await app.close();
  });

  it('discards a matching proposal action payload without writing files', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我想写一个苟道修仙的长篇故事。');

    const proposalResponse = await propose(app, '生成一版创意脑暴草案');
    const proposalPayload = JSON.parse(proposalResponse.body) as {
      pendingProposal: { id: string };
    };

    const discardResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '放弃当前提案',
        approved: false,
        proposalAction: {
          type: 'discard',
          proposalId: proposalPayload.pendingProposal.id,
        },
      },
    });

    expect(discardResponse.statusCode).toBe(200);
    expect(JSON.parse(discardResponse.body)).toMatchObject({
      reply: expect.stringContaining('已放弃当前提案'),
      pendingProposal: null,
      session: {
        waitingForApproval: false,
      },
    });
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('占位模板');

    await app.close();
  });

  it('generates a new proposal version for revision action payloads', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我想写一个苟道修仙的长篇故事。');

    const proposalResponse = await propose(app, '生成一版创意脑暴草案');
    const proposalPayload = JSON.parse(proposalResponse.body) as {
      pendingProposal: { id: string };
    };

    const revisionResponse = await injectWithAutoModel(app, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '改一下：不要源血设定',
        approved: false,
        proposalAction: {
          type: 'revise',
          proposalId: proposalPayload.pendingProposal.id,
          instructions: '改一下：不要源血设定',
        },
      },
    });

    expect(revisionResponse.statusCode).toBe(200);
    expect(JSON.parse(revisionResponse.body)).toMatchObject({
      pendingProposal: {
        id: expect.any(String),
        version: 2,
        status: 'pending',
      },
      session: {
        waitingForApproval: true,
      },
    });
    expect((JSON.parse(revisionResponse.body) as { pendingProposal: { id: string } }).pendingProposal.id).not.toBe(
      proposalPayload.pendingProposal.id,
    );
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('占位模板');

    await app.close();
  });

  it('guards ambiguous continue messages while a proposal is pending', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '我想写一个苟道修仙的长篇故事。');

    const proposalResponse = await propose(app, '生成一版创意脑暴草案');
    const proposalPayload = JSON.parse(proposalResponse.body) as {
      pendingProposal: { id: string };
    };

    const continueResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '继续',
        approved: false,
      },
    });

    expect(continueResponse.statusCode).toBe(200);
    expect(JSON.parse(continueResponse.body)).toMatchObject({
      reply: expect.stringContaining('当前有待确认提案'),
      pendingProposal: {
        id: proposalPayload.pendingProposal.id,
      },
    });

    await app.close();
  });

  it('sanitizes false write claims in pending proposal replies before approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成并写入以下文件：2-设定/2.1_创意脑暴.md，请直接继续下一步。',
                  proposedWrites: [
                    {
                      path: '2-设定/2.1_创意脑暴.md',
                      content: '# 提案\n\n内容。',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(app, '生成一版创意脑暴草案');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: {
        proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md' }],
      },
    });
    expect(JSON.parse(response.body).reply).toContain('尚未写入任何文件');
    expect(JSON.parse(response.body).reply).not.toContain('已生成并写入以下文件');

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('占位模板');

    await app.close();
  });

  it('can write to an active off-stage document without auto-advancing the workflow', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const proposalResponse = await injectWithAutoModel(app, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '请写入当前文档，先给我一版可执行总纲。',
        activeDocumentPath: '3-大纲/3.1_全书结构总纲.md',
        approved: false,
      },
    });

    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: {
        proposedWrites: [{ path: '3-大纲/3.1_全书结构总纲.md' }],
      },
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '3-大纲', '3.1_全书结构总纲.md'), 'utf8'),
    ).resolves.toContain('核心方向：请写入当前文档，先给我一版可执行总纲。');

    await app.close();
  });

  it('allows continued discussion and explicit regeneration while a proposal is pending', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    await propose(app, '我想写一个以主题甲为核心的长篇故事。');
    const initialProposal = await propose(app, '生成一版创意脑暴草案');
    expect(JSON.parse(initialProposal.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' })]),
      }),
    });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '模型讨论：当前方向成立，接下来重点确认主角的情感驱动和阶段目标。',
              },
            },
          ],
        }),
      })),
    );

    const discussionTurn = await propose(app, '先聊聊为什么要这样设计方向');
    expect(discussionTurn.statusCode).toBe(200);
    expect(JSON.parse(discussionTurn.body)).toMatchObject({
      reply: expect.any(String),
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' })]),
      }),
    });
    expect(JSON.parse(discussionTurn.body).reply).not.toContain('我先继续讨论，不会立刻生成待确认提案');

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();

    const regenerated = await propose(app, '重新生成一版，主角改成主角目标调整');
    expect(JSON.parse(regenerated.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingDecision: null,
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md', content: expect.stringContaining('主角改成主角目标调整') }),
        ]),
      }),
    });

    await app.close();
  });

  it('syncs PROJECT indexes after ideation approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);

    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '[新书设定] -> `2-设定/2.2_新书设定案.md`',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '[金手指] -> `2-设定/2.3_金手指设定.md`',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '[角色总表] -> `2-设定/2.4_主要角色设定表.md`',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '-> .novelkit/constitution/MASTER.md',
    );

    await app.close();
  });

  it('invalidates a pending proposal when the target file changes before approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });

    await writeFile(
      path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'),
      '# user changed content',
      'utf8',
    );

    const approvedResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认',
        approved: true,
      },
    });

    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toBe('# user changed content');

    await app.close();
  });

  it('does not advance when a model proposal resolves to zero legal writes', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '这里有一份提案。',
                  proposedWrites: [{ path: '不允许的路径.md', content: 'ignored' }],
                }),
              },
            },
          ],
        }),
      })),
    );

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const proposalResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '生成一版创意脑暴草案',
        approved: false,
      },
    });

    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      pendingProposal: {
        proposedWrites: [],
      },
    });

    const approvedResponse = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认',
        approved: true,
      },
    });

    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('requires explicit approval wording on the server before committing a pending proposal', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '生成一版创意脑暴草案');

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '继续优化，但先别落盘',
        approved: true,
      },
    });

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' }),
        ]),
      }),
    });

    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('占位模板');

    await app.close();
  });

  it('accepts typed explicit approval wording even without the approved flag when a proposal is pending', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const proposalResponse = await propose(app, '请审查第一章草稿。');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: [{ path: '5-审查/第001章_审查报告.md' }],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认',
        approved: false,
      },
    });

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-pause',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '5-审查', '第001章_审查报告.md'), 'utf8'),
    ).resolves.toContain('# 第001章 审查报告');

    await app.close();
  });

  it('rejects direct file saves while a proposal is pending approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '生成一版创意脑暴草案');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/file',
      payload: {
        path: '2-设定/2.1_创意脑暴.md',
        content: '# bypass',
      },
    });

    expect(response.statusCode).toBe(409);
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('占位模板');

    await app.close();
  });

  it.each([
    ['missing path', { content: '# invalid save' }],
    ['non-string path', { path: 42, content: '# invalid save' }],
    ['missing content', { path: '1-边界/预期.md' }],
    ['non-string content', { path: '1-边界/预期.md', content: 42 }],
    ['non-object body', 'not an object'],
  ])('rejects malformed file save payloads before saving: %s', async (_label, payload) => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });
    const targetPath = path.join(workspaceRoot, '1-边界', '预期.md');

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(targetPath, '# Original expectation', 'utf8');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/file',
      headers: typeof payload === 'string' ? { 'content-type': 'application/json' } : undefined,
      payload: typeof payload === 'string' ? JSON.stringify(payload) : payload,
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'invalid-file-save-payload',
      },
    });
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('# Original expectation');

    await app.close();
  });

  it('wraps invalid JSON file save payloads in the file-save validation contract', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });
    const targetPath = path.join(workspaceRoot, '1-边界', '预期.md');

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await writeFile(targetPath, '# Original expectation', 'utf8');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/file',
      headers: { 'content-type': 'application/json' },
      payload: '{"path":"1-边界/预期.md","content":',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: 'invalid-file-save-payload',
      },
    });
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('# Original expectation');

    await app.close();
  });

  it('allows manual off-stage saves and invalidates conflicting pending proposals', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '请写入当前文档，先给我一版总纲。',
        activeDocumentPath: '3-大纲/3.1_全书结构总纲.md',
        approved: false,
      },
    });

    const saveResponse = await app.inject({
      method: 'PUT',
      url: '/api/file',
      payload: {
        path: '3-大纲/3.1_全书结构总纲.md',
        content: '# 手动覆盖\n\n这是人工保存内容。',
      },
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(JSON.parse(saveResponse.body)).toMatchObject({
      ok: true,
      pendingProposal: null,
      session: {
        currentStepId: 'define-direction',
      },
    });

    const approveAfterSave = await approve(app);
    expect(JSON.parse(approveAfterSave.body)).toMatchObject({
      reply: '当前没有待确认事项。请先描述你想推进的内容，我会先给出决策或提案。',
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '3-大纲', '3.1_全书结构总纲.md'), 'utf8'),
    ).resolves.toContain('这是人工保存内容。');

    await app.close();
  });

  it('syncs PROJECT outline index after outline approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);

    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '[总纲] -> `3-大纲/3.1_全书结构总纲.md`',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '[第01卷卷纲] -> `3-大纲/第01卷_完整卷纲.md`',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '[第01卷章纲] -> `3-大纲/第01卷_章纲.md`',
    );

    await app.close();
  });

  it('keeps ideation generation requests in ideation even when the user mentions future review plans', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);

    const response = await propose(
      app,
      '后面我要逐章审查，但现在先补全新书设定案，不要再问我问题，直接生成一版。',
    );

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'ideation-build',
        currentModule: 'ideation',
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: [{ path: '2-设定/2.2_新书设定案.md' }],
      },
    });

    await app.close();
  });

  it('treats "不要再问我问题，直接生成" as proposal intent instead of discussion hold', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });

    const response = await propose(app, '不要再问我问题，直接生成一版创意脑暴草案。');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'define-direction',
        currentModule: 'define',
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
    });
    expect(JSON.parse(response.body).pendingProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' })]),
    );

    await app.close();
  });

  it('updates memory files and PROJECT writing pointers after chapter approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    await expect(
      readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'character_state.md'), 'utf8'),
    ).resolves.toContain('最近完成章节：第001章');
    await expect(
      readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'foreshadowing.md'), 'utf8'),
    ).resolves.toContain('第001章草稿已完成');
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '-> .novelkit/memory/character_state.md',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '-> .novelkit/memory/foreshadowing.md',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '- [x] 第001章草稿',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '- **阶段**：正文审查',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '  - [ ] 第001章审查报告',
    );

    const progressResponse = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(JSON.parse(progressResponse.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentModule: 'review',
      },
      allowedWrites: ['5-审查/第001章_审查报告.md', 'PROJECT.md'],
    });

    await app.close();
  });

  it('writes a review report after the review proposal is approved', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const proposalResponse = await propose(app, '请审查第一章草稿。');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentModule: 'review',
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: [{ path: '5-审查/第001章_审查报告.md' }],
      },
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      reply: '已写入提案文件，并进入【单章收束】。',
      session: {
        currentStepId: 'write-chapter',
        currentModule: 'write',
        currentSubstepId: 'chapter-pause',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      readFile(path.join(workspaceRoot, '5-审查', '第001章_审查报告.md'), 'utf8'),
    ).resolves.toContain('# 第001章 审查报告');
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '- [x] 第001章审查报告',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '- **阶段**：章节收束',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '  - [ ] 第002章草稿',
    );

    const progressResponse = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(JSON.parse(progressResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentModule: 'write',
        currentSubstepId: 'chapter-pause',
      },
      allowedWrites: ['PROJECT.md'],
    });

    await app.close();
  });

  it('creates a review proposal for explicit review requests even if the frontend sends plan mode', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const response = await proposeWithMode(app, '请审查第1章草稿。', { chatMode: 'plan' });

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentSubstepId: 'chapter-review',
        currentChapterNumber: 1,
      },
      pendingProposal: {
        proposedWrites: [{ path: '5-审查/第001章_审查报告.md' }],
      },
    });

    await app.close();
  });

  it('reviews the explicitly requested existing chapter instead of the current workflow chapter', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '继续下一章');
    await proposeWithAutoModel(app, '开始写第2章正文。');
    await approve(app);

    const progressBeforeReview = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(JSON.parse(progressBeforeReview.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentSubstepId: 'chapter-review',
        currentChapterNumber: 2,
      },
    });

    const response = await propose(app, '请审查第1章草稿。');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentSubstepId: 'chapter-review',
        currentChapterNumber: 1,
      },
      pendingProposal: {
        proposedWrites: [{ path: '5-审查/第001章_审查报告.md' }],
      },
    });

    await app.close();
  });

  it('requires an explicit command to continue into the next chapter after review', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);

    const continueResponse = await propose(app, '继续下一章');
    expect(JSON.parse(continueResponse.body)).toMatchObject({
      reply: '已进入第002章写作。',
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 2,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('continues into the next chapter when the user includes writing constraints in the same command', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);

    const continueResponse = await propose(app, '继续，开始写第2章正文。必须一章一章写，只写第2章；正文必须至少2800字。');

    expect(JSON.parse(continueResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 2,
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({ path: '4-正文/第002章_草稿.md' }),
        ]),
      },
    });

    await app.close();
  });

  it('does not treat explicit same-chapter generation in review as next-chapter continuation', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const response = await propose(
      app,
      '继续生成第1章正文提案。请只写第1章；目标文件必须是 4-正文/第001章_草稿.md。',
    );
    const body = JSON.parse(response.body);

    expect(body.session).toMatchObject({
      currentStepId: 'write-chapter',
      currentSubstepId: 'chapter-draft',
      currentChapterNumber: 1,
    });
    expect(body.reply).not.toContain('进入第002章');

    await app.close();
  });

  it('treats plain next-chapter write shortcuts as workflow write intent even when sent with a plan hint', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const continueResponse = await proposeWithMode(app, '写下一章', { chatMode: 'plan' });

    expect(JSON.parse(continueResponse.body)).toMatchObject({
      reply: '已按你的决定跳过第001章修订，进入第002章写作。',
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 2,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('lets the user skip review-stage revisions and continue to the next chapter', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const continueResponse = await propose(app, '这些意见我知道了，先不修，继续下一章。');
    expect(JSON.parse(continueResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 2,
        waitingForApproval: false,
      },
      pendingProposal: null,
    });
    expect(JSON.parse(continueResponse.body).reply).toContain('已按你的决定跳过第001章修订');

    const draftResponse = await proposeWithAutoModel(app, '不用讨论，直接写第2章正文。');
    expect(JSON.parse(draftResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 2,
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: {
        proposedWrites: [{ path: '4-正文/第002章_草稿.md' }],
      },
    });

    await app.close();
  });

  it('does not advance to the next chapter for ambiguous pause-stage questions', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);

    const response = await propose(app, '下一章怎么写？');
    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-pause',
        currentChapterNumber: 1,
      },
    });

    await app.close();
  });

  it('syncs memory and PROJECT when chapter review lands in pause state', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);

    await expect(
      readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'character_state.md'), 'utf8'),
    ).resolves.toContain('章节状态：第001章已收束');
    await expect(
      readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'foreshadowing.md'), 'utf8'),
    ).resolves.toContain('等待决定是否进入第002章');

    await app.close();
  });

  it('returns to current chapter draft mode when asked to revise the same chapter', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);

    const response = await propose(app, '继续修改当前章');
    expect(JSON.parse(response.body)).toMatchObject({
      reply: '已返回第001章草稿继续修改。',
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 1,
      },
      pendingProposal: null,
    });

    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '- **阶段**：正文写作',
    );

    await app.close();
  });

  it('enters current chapter finalization from pause when asked to apply review and generate final draft', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);

    const response = await proposeFinalWithAutoModel(
      app,
      '按第001章审查报告做局部修补，生成 4-正文/第001章_定稿.md',
      '4-正文/第001章_定稿.md',
    );
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-finalize',
        currentChapterNumber: 1,
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: {
        proposedWrites: [{ path: '4-正文/第001章_定稿.md' }],
      },
    });
    expect(body.session.writeTargetHint.chatAllowedWrites).toEqual(
      expect.arrayContaining(['4-正文/第001章_草稿.md', '4-正文/第001章_定稿.md']),
    );

    await approve(app);
    await expect(readFile(path.join(workspaceRoot, '4-正文', '第001章_定稿.md'), 'utf8')).resolves.toContain(
      '# 第001章',
    );

    const continueResponse = await propose(app, '继续下一章');
    expect(JSON.parse(continueResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 2,
      },
    });

    await app.close();
  });

  it('enters current chapter finalization from draft revision mode after a review gate sends the chapter back', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成审查报告。',
                  proposedWrites: [
                    {
                      path: '5-审查/第001章_审查报告.md',
                      content: [
                        '# 第001章 审查报告',
                        '',
                        '- 审查评级：REVISE',
                        '',
                        '## 结论',
                        '- 先做局部修补，再生成定稿。',
                        '',
                        '## 局部改写任务',
                        '- 删除解释性总结句。',
                      ].join('\n'),
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    await propose(app, '请审查第一章草稿。');
    const approvedReviewResponse = await approve(app);
    expect(JSON.parse(approvedReviewResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已按审查意见生成第001章定稿。',
                  proposedWrites: [
                    {
                      path: '4-正文/第001章_定稿.md',
                      content: '# 第001章\n\n定稿正文。',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(app, '按第001章审查报告做局部修补，生成 4-正文/第001章_定稿.md');
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-finalize',
        currentChapterNumber: 1,
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: {
        proposedWrites: [{ path: '4-正文/第001章_定稿.md' }],
      },
    });

    await approve(app);
    await expect(readFile(path.join(workspaceRoot, '4-正文', '第001章_定稿.md'), 'utf8')).resolves.toContain(
      '定稿正文',
    );

    await app.close();
  });

  it('routes explicit finalization requests from chapter review state to final draft generation', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await writeFile(
      path.join(workspaceRoot, '5-审查', '第001章_审查报告.md'),
      [
        '# 第001章 审查报告',
        '',
        '- 审查评级：REVISE',
        '',
        '## 局部改写任务',
        '- 删除解释性总结句。',
      ].join('\n'),
      'utf8',
    );

    await propose(app, '请审查第一章草稿。');

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已按审查报告和修订稿生成第001章定稿。',
                  proposedWrites: [
                    {
                      path: '4-正文/第001章_定稿.md',
                      content: '# 第001章\n\n定稿正文。',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(
      app,
      '按第001章审查报告和刚才修订后的草稿生成第001章最终定稿，写入 4-正文/第001章_定稿.md，先给我待确认提案。',
    );
    const body = JSON.parse(response.body);

    expect(body).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-finalize',
        currentModule: 'write',
        currentChapterNumber: 1,
        waitingForApproval: true,
        interactionMode: 'proposal',
      },
      pendingProposal: {
        proposedWrites: [{ path: '4-正文/第001章_定稿.md' }],
      },
    });
    expect(body.pendingProposal.proposedWrites).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '5-审查/第001章_审查报告.md' })]),
    );

    await app.close();
  });

  it('rejects chapter draft proposals that drift outside the current chapter outline', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成第001章草稿。',
                  proposedWrites: [
                    {
                      path: '4-正文/第001章_草稿.md',
                      content: '# 第001章 待填写后续章标题（大结局）\n\n矿洞在这一章迎来终局。',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(app, '开始写第一章正文。');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentModule: 'write',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });
    expect(JSON.parse(response.body).reply).toContain('超出当前章纲范围');

    await app.close();
  });

  it('keeps chapter draft proposals visible when only AI-flavor repair is needed', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成第001章草稿。',
                  proposedWrites: [
                    {
                      path: '4-正文/第001章_草稿.md',
                      content:
                        '# 第001章 待填写开局章标题\n\n'
                        + '角色甲深吸一口气，沿着场景甲把每一处线索甲线索重新核对。'.repeat(190),
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(app, '开始写第一章正文。');
    const body = JSON.parse(response.body);

    expect(body).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: [
          expect.objectContaining({
            path: '4-正文/第001章_草稿.md',
            content: expect.stringContaining('深吸一口气'),
          }),
        ],
      },
    });
    expect(body.reply).toContain('已生成待确认提案');
    expect(body.reply).toContain('AI味');

    await app.close();
  });

  it('rejects chapter draft proposals that target a different chapter file', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath, userConfigDir: workspaceRoot });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);

    await app.inject({
      method: 'POST',
      url: '/api/settings/model',
      payload: {
        activeModelId: 'primary',
        models: {
          primary: {
            provider: 'openai-compatible',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'test-key',
            model: 'gpt-4.1-mini',
            temperature: 0.4,
            stream: true,
          },
          secondary: {
            provider: 'openai-compatible',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'backup-key',
            model: 'gpt-4.1-mini',
            temperature: 0.4,
            stream: true,
          },
        },
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成第005章草稿。',
                  proposedWrites: [
                    {
                      path: '4-正文/第005章_草稿.md',
                      content: '# 第005章 错章\n\n' + '山风吹过旧渡口。'.repeat(380),
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(app, '开始写第一章正文。');
    const body = JSON.parse(response.body);

    expect(body).toMatchObject({
      error: {
        code: 'proposal-invalid-response',
      },
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 1,
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(access(path.join(workspaceRoot, '4-正文', '第005章_草稿.md'))).rejects.toThrow();

    await app.close();
  });

  it('returns structured validation diagnostics when model-driven writing lacks a chapter plan', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await propose(app, '开始规划全书总纲。');
    await approve(app);

    const response = await propose(app, '大纲暂时通过，进入正文创作测试。请从第1章开始写正文，只写第1章。');

    expect(JSON.parse(response.body)).toMatchObject({
      reply: expect.stringContaining('缺少章节计划'),
      validation: {
        code: 'chapter-plan-missing',
      },
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('jumps from outline planning into chapter drafting when the user explicitly asks to write a chapter', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await propose(app, '开始规划全书总纲。');
    await approve(app);
    await writeFile(
      path.join(workspaceRoot, '3-大纲', '第01卷_章纲.md'),
      [
        '第1章：待填写开局章标题',
        '',
        '**章节梗概**：主角在危险环境里第一次显露“保留阶段策略”的核心策略。',
        '',
        '**场景拆解**：',
        '- 场景1：危机降临',
        '- 场景2：低调试探',
        '- 场景3：第一轮小反制',
        '',
        '**结尾钩子**：主角意识到更大的规则压制已经开始。',
      ].join('\n'),
      'utf8',
    );

    const response = await propose(app, '大纲暂时通过，进入正文创作测试。请从第1章开始写正文，只写第1章。');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentModule: 'write',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 1,
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({ path: '4-正文/第001章_草稿.md' }),
        ]),
      },
    });

    await app.close();
  });

  it('lets explicit chapter write requests repair the current write chapter number', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await writeFile(
      path.join(workspaceRoot, '3-大纲', '第01卷_章纲.md'),
      [
        '第7章：补上的缺口',
        '',
        '**章节梗概**：主角回到遗漏事件，补齐连续性缺口。',
        '',
        '**场景拆解**：',
        '- 场景1：发现第7章缺口',
        '- 场景2：回到当前线索',
        '- 场景3：以新钩子收束',
        '',
        '**结尾钩子**：第8章的压力重新逼近。',
        '',
        '第8章：后续追压',
        '',
        '**章节梗概**：主角继续承接第7章后的追压。',
        '',
        '**场景拆解**：',
        '- 场景1：外部压力升级',
        '- 场景2：主角寻找退路',
        '- 场景3：线索指向下一步',
        '',
        '**结尾钩子**：更大的风险已经逼近。',
      ].join('\n'),
      'utf8',
    );
    await propose(app, '开始写第8章正文。');
    await approve(app);

    const response = await proposeWithAutoModel(app, '当前漏了第7章，请回到第7章正文写作，只生成第7章。');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentModule: 'write',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 7,
        waitingForApproval: true,
      },
      pendingProposal: {
        proposedWrites: expect.arrayContaining([
          expect.objectContaining({ path: '4-正文/第007章_草稿.md' }),
        ]),
      },
    });

    await app.close();
  });

  it('blocks explicit previous-chapter writes when the draft already exists', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await writeFile(
      path.join(workspaceRoot, '4-正文', '第007章_草稿.md'),
      '# 第007章 已有草稿\n\n' + '这是一份已经存在的第七章草稿。'.repeat(320),
      'utf8',
    );
    await propose(app, '开始写第8章正文。');
    await approve(app);

    const response = await propose(app, '当前漏了第7章，请回到第7章正文写作，只生成第7章。');

    expect(JSON.parse(response.body)).toMatchObject({
      reply: expect.stringContaining('第007章草稿已存在'),
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 8,
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('persists server-owned workflow snapshots after chat workflow mutations', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const savedSession = await readProjectSession(workspaceRoot);
    expect(savedSession?.workflow).toMatchObject({
      currentStepId: 'review-chapter',
      currentSubstepId: 'chapter-review',
      currentChapterNumber: 1,
    });

    await app.close();
  });

  it('remembers regenerate corrections for the next proposal prompt', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: '已生成待确认提案。',
                proposedWrites: [
                  {
                    path: '2-设定/2.1_创意脑暴.md',
                    content: '# 创意脑暴\n\n旧稿。',
                  },
                ],
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await propose(app, '生成一版创意脑暴草案');
    await propose(app, '重写，主角必须叫角色甲，不能出现外部模板角色、外部模板能力、外部模板主线。');
    await approve(app);
    await propose(app, '继续生成下一步提案');

    const secondProposalRequest = JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string) as {
      messages: Array<{ content: string }>;
    };
    expect(secondProposalRequest.messages[1].content).toContain('### 最近讨论记录');
    expect(secondProposalRequest.messages[1].content).toContain('主角必须叫角色甲');
    expect(secondProposalRequest.messages[1].content).toContain('不能出现外部模板角色');

    await app.close();
  });

  it('treats review-driven localized rewrite requests as write-stage revision instead of re-entering review', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);
    await propose(app, '继续修改当前章');

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已按局部改写任务生成第001章修订稿。',
                  proposedWrites: [
                    {
                      path: '4-正文/第001章_草稿.md',
                      content: '# 第001章\n\n修订稿。',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(
      app,
      '请直接写入 4-正文/第001章_草稿.md，按审查报告执行局部改写任务，只修改有问题的句子、段落或场景，不要整章重写。',
    );

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentModule: 'write',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingProposal: null,
    });
    expect(JSON.parse(response.body).reply).toContain('至少2800字');

    await app.close();
  });

  it('rejects severe AI-flavor chapter draft proposals when they are below the chapter length target', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成第001章草稿。',
                  proposedWrites: [
                    {
                      path: '4-正文/第001章_草稿.md',
                      content: [
                        '# 第001章 待填写开局章标题',
                        '',
                        '夜色像刀一样压下来，仿佛整条街都在发抖。',
                        '这不是求生，而是命运对他的审判。',
                        '他知道这意味着自己再也不能回头，这说明真正的黑暗刚刚开始。',
                      ].join('\n'),
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const response = await propose(app, '开始写第一章正文。');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentModule: 'write',
        waitingForApproval: false,
        interactionMode: 'discussion',
      },
      pendingProposal: null,
    });
    expect(JSON.parse(response.body).reply).toContain('至少2800字');

    await app.close();
  });

  it('routes blocked chapter review approvals back to the current chapter draft for revision', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成审查报告。',
                  proposedWrites: [
                    {
                      path: '5-审查/第001章_审查报告.md',
                      content: [
                        '# 第001章 审查报告',
                        '',
                        '- 审查评级：BLOCK',
                        '',
                        '## 结论',
                        '- 当前不能进入下一章。',
                        '- 建议整章重写。',
                      ].join('\n'),
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const proposalResponse = await propose(app, '请审查第一章草稿。');
    expect(JSON.parse(proposalResponse.body)).toMatchObject({
      pendingProposal: {
        proposedWrites: [{ path: '5-审查/第001章_审查报告.md' }],
      },
    });

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentModule: 'write',
        currentChapterNumber: 1,
        waitingForApproval: false,
      },
      pendingProposal: null,
    });
    expect(JSON.parse(approvedResponse.body).reply).toContain('返回第001章草稿继续修改');

    await app.close();
  });

  it('injects service-side AI flavor findings into chapter review proposals and downgrades false PASS ratings', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);

    await writeFile(
      path.join(workspaceRoot, '4-正文', '第001章_草稿.md'),
      [
        '# 第001章 待填写开局章标题',
        '',
        '夜色像刀一样压下来，仿佛整条街都在发抖。',
        '这不是求生，而是命运对他的审判。',
        '他知道这意味着自己再也不能回头，这说明真正的黑暗刚刚开始。',
      ].join('\n'),
      'utf8',
    );

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: '已生成审查报告。',
                  proposedWrites: [
                    {
                      path: '5-审查/第001章_审查报告.md',
                      content: '# 第001章 审查报告\n\n- 审查评级：PASS\n\n## 结论\n- 可以继续下一章。',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    const proposalResponse = await propose(app, '请审查第一章草稿。');
    expect(JSON.parse(proposalResponse.body).pendingProposal.proposedWrites[0].content).toContain('审查评级：REVISE');
    expect(JSON.parse(proposalResponse.body).pendingProposal.proposedWrites[0].content).toContain(
      '## AI味命中明细（服务端补充）',
    );

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-draft',
        currentChapterNumber: 1,
      },
    });

    await app.close();
  });

  it('answers progress questions from PROJECT instead of raw step ids', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);

    const progressResponse = await propose(app, '检查进度');
    expect(JSON.parse(progressResponse.body)).toMatchObject({
      reply: expect.stringContaining('当前阶段：章节收束'),
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-pause',
      },
    });
    expect(JSON.parse(progressResponse.body).reply).toContain('当前任务：决定是继续修订第001章，还是进入下一章');
    expect(JSON.parse(progressResponse.body).reply).toContain('下一步建议：第002章草稿');

    await app.close();
  });

  it('does not continue into a non-existent next chapter after the final outlined chapter', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');
    await approve(app);
    await propose(app, '继续下一章');
    await proposeWithAutoModel(app, '开始写第二章正文。');
    await approve(app);
    await propose(app, '请审查第二章草稿。');
    await approve(app);

    const continueResponse = await propose(app, '继续下一章');
    expect(JSON.parse(continueResponse.body)).toMatchObject({
      session: {
        currentStepId: 'write-chapter',
        currentSubstepId: 'chapter-pause',
        currentChapterNumber: 2,
      },
      pendingProposal: null,
    });
    expect(JSON.parse(continueResponse.body).reply).toContain('当前章纲已经到最后一章');

    const progressResponse = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(JSON.parse(progressResponse.body).progressSummary.nextSuggestion).toBe('终章修订');

    await app.close();
  });

  it('processes approval before handling a mixed progress question', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await propose(app, '生成一版创意脑暴草案');

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: '确认，检查进度',
        approved: true,
      },
    });

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'ideation-build',
      },
      pendingProposal: null,
    });

    await app.close();
  });

  it('invalidates a review proposal when the reviewed draft changes before approval', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);
    await propose(app, '请审查第一章草稿。');

    await writeFile(
      path.join(workspaceRoot, '4-正文', '第001章_草稿.md'),
      '# 第001章 待填写开局章标题\n\n草稿已被用户修改。',
      'utf8',
    );

    const approvedResponse = await approve(app);
    expect(JSON.parse(approvedResponse.body)).toMatchObject({
      reply: '文件 4-正文/第001章_草稿.md 在提案生成后已发生变化，当前提案已失效，请重新生成。',
      session: {
        currentStepId: 'review-chapter',
        waitingForApproval: false,
      },
      pendingProposal: null,
    });

    await expect(
      access(path.join(workspaceRoot, '5-审查', '第001章_审查报告.md')),
    ).rejects.toThrow();

    await app.close();
  });

  it('keeps mixed chapter-draft review requests in chapter review even when they mention outline-like wording', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);
    await propose(app, '开始写第一章正文。');
    await approve(app);

    const response = await propose(app, '请审查第1章草稿，重点检查正文是否太像压缩章纲、连续性是否自然。');

    expect(JSON.parse(response.body)).toMatchObject({
      session: {
        currentStepId: 'review-chapter',
        currentModule: 'review',
        currentSubstepId: 'chapter-review',
        currentStepTitle: '章节审查',
        waitingForApproval: true,
      },
      pendingProposal: expect.objectContaining({
        proposedWrites: expect.arrayContaining([expect.objectContaining({ path: '5-审查/第001章_审查报告.md' })]),
      }),
    });

    await app.close();
  });

  it('syncs write-stage PROJECT pointers even when only memory files are manually saved', async () => {
    const workspaceRoot = await makeWorkspace();
    const app = createApp({ projectRoot: workspaceRoot, skillPackPath });

    await app.inject({ method: 'POST', url: '/api/workspace/init' });
    await completeDefine(app);
    await completeIdeation(app);
    await completeOutline(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/file',
      payload: {
        path: '.novelkit/memory/character_state.md',
        content: '# custom memory',
      },
    });

    expect(response.statusCode).toBe(200);
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '-> .novelkit/memory/character_state.md',
    );
    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '-> .novelkit/memory/foreshadowing.md',
    );

    await app.close();
  });
});
