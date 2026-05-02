import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSkillPack } from '../vsix/loadSkillPack';
import { generateAssistantReply } from './generateAssistantReply';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);
const skillPack = loadSkillPack(skillPackPath);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('generateAssistantReply', () => {
  it('falls back to a local deterministic proposal when no model credentials are configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：新书方向定义',
      userPrompt: '用户消息：我想写一个苟道修仙故事。',
      stepTitle: '新书方向定义',
      module: 'define',
      allowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.define],
    });

    expect(proposal.reply).toContain('新书方向定义');
    expect(proposal.reply).toContain('确认');
    expect(proposal.proposedWrites).toEqual([
      expect.objectContaining({ path: '2-设定/2.1_创意脑暴.md' }),
      expect.objectContaining({ path: '1-边界/1.2_文风.md' }),
    ]);
  });

  it('prefers explicitly targeted off-stage files when they are writable in chat mode', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：新书方向定义',
      userPrompt: '用户消息：请直接写入 3-大纲/3.1_全书结构总纲.md，先给我一版总纲。',
      stepTitle: '新书方向定义',
      module: 'define',
      allowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', '3-大纲/3.1_全书结构总纲.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.define],
    });

    expect(proposal.proposedWrites).toEqual([
      expect.objectContaining({ path: '3-大纲/3.1_全书结构总纲.md' }),
    ]);
  });

  it('reports an upstream timeout instead of silently falling back when model credentials are configured', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const proposalPromise = generateAssistantReply({
      systemPrompt: '当前步骤：单章正文写作',
      userPrompt: '用户消息：不用讨论，直接写第3章正文。',
      stepTitle: '单章正文写作',
      module: 'write',
      allowedWrites: ['4-正文/第003章_草稿.md'],
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content:
            '第3章：暗潮涌动\n\n**剧情概述**：主角发现局面比预期更危险。\n\n**场景设计**：\n- 场景1：夜探旧地\n- 场景2：发现被监视\n\n**章节钩子**：主角意识到真正的陷阱刚刚开始。',
        },
      ],
      workflowDocs: [skillPack.modules.write],
      requestTimeoutMs: 10,
      modelConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        stream: true,
      },
    });

    const rejection = expect(proposalPromise).rejects.toMatchObject({
      code: 'proposal-network-error',
    });
    await vi.advanceTimersByTimeAsync(10);
    await rejection;

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('requests structured JSON from gemini-native and parses wrapped proposal text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: [
                    '下面是本轮提案，请直接解析 JSON：',
                    '```json',
                    JSON.stringify({
                      reply: '好的，先给你一版。',
                      proposedWrites: [{ path: '1-边界/1.2_文风.md', content: '# 文风说明' }],
                    }),
                    '```',
                  ].join('\n'),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：新书方向定义',
      userPrompt: '用户消息：请直接写入 1-边界/1.2_文风.md，给我一版文风说明。',
      stepTitle: '新书方向定义',
      module: 'define',
      allowedWrites: ['1-边界/1.2_文风.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.define],
      modelConfig: {
        provider: 'gemini-native',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gem-key',
        model: 'gemini-2.5-pro',
        temperature: 0.4,
        stream: true,
      },
      allowLocalFallback: false,
    });

    expect(proposal).toEqual({
      reply: '好的，先给你一版。',
      proposedWrites: [{ path: '1-边界/1.2_文风.md', content: '# 文风说明' }],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const requestBody = JSON.parse(init.body);
    expect(requestBody.system_instruction.parts[0].text).toContain('请输出 JSON 对象');
    expect(requestBody.generationConfig).toMatchObject({
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['reply', 'proposedWrites'],
      },
    });
  });

  it('drops direct PROJECT writes from assistant proposals and keeps only document targets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: '好的，先给你一版。',
                proposedWrites: [
                  { path: '2-设定/2.1_创意脑暴.md', content: '# 创意脑暴' },
                  { path: '1-边界/1.2_文风.md', content: '# 文风说明' },
                  { path: 'PROJECT.md', content: '# PROJECT\n\n## 5. Stylistic Guidelines\n-> 1-边界/1.2_文风.md' },
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：新书方向定义',
      userPrompt: '用户消息：生成一版创意脑暴草案。',
      stepTitle: '新书方向定义',
      module: 'define',
      allowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', 'PROJECT.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.define],
      modelConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        stream: true,
      },
      allowLocalFallback: false,
    });

    expect(proposal.proposedWrites).toEqual([
      { path: '2-设定/2.1_创意脑暴.md', content: '# 创意脑暴' },
      { path: '1-边界/1.2_文风.md', content: '# 文风说明' },
    ]);
  });

  it('normalizes outline placeholder paths to concrete allowed files', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: '好的，先给你一版卷纲。',
                proposedWrites: [
                  { path: '3-大纲/XX卷_完整卷纲.md', content: '# 第01卷 完整卷纲' },
                  { path: 'PROJECT.md', content: '# PROJECT' },
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：全书大纲规划',
      userPrompt: '用户消息：继续规划第01卷卷纲。',
      stepTitle: '全书大纲规划',
      module: 'outline',
      allowedWrites: ['3-大纲/第01卷_完整卷纲.md', 'PROJECT.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.outline],
      modelConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        stream: true,
      },
      allowLocalFallback: false,
    });

    expect(proposal.proposedWrites).toEqual([
      { path: '3-大纲/第01卷_完整卷纲.md', content: '# 第01卷 完整卷纲' },
    ]);
  });

  it('adds outline-specific runtime instructions for concrete file proposals', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    reply: '好的，先给你一版总纲。',
                    proposedWrites: [{ path: '3-大纲/3.1_全书结构总纲.md', content: '# 总纲' }],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateAssistantReply({
      systemPrompt: '当前步骤：全书大纲规划',
      userPrompt: '用户消息：开始规划全书总纲。',
      stepTitle: '全书大纲规划',
      module: 'outline',
      allowedWrites: ['3-大纲/3.1_全书结构总纲.md', 'PROJECT.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.outline],
      modelConfig: {
        provider: 'gemini-native',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gem-key',
        model: 'gemini-2.5-pro',
        temperature: 0.4,
        stream: true,
      },
      allowLocalFallback: false,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const requestBody = JSON.parse(init.body);
    expect(requestBody.system_instruction.parts[0].text).toContain('在本轮直接给出可写入的文件提案');
    expect(requestBody.system_instruction.parts[0].text).toContain('不要继续多轮讨论');
    expect(requestBody.system_instruction.parts[0].text).toContain('不要使用占位路径如 3-大纲/XX卷_完整卷纲.md');
    expect(requestBody.system_instruction.parts[0].text).toContain('不要在 proposedWrites 中输出 PROJECT.md');
  });

  it('adds anti-ai-writing instructions to write-stage runtime prompts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    reply: '好的，先给你一版正文。',
                    proposedWrites: [{ path: '4-正文/第001章_草稿.md', content: '# 第001章\n\n正文。' }],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateAssistantReply({
      systemPrompt: '当前步骤：单章正文写作',
      userPrompt: '用户消息：开始写第一章正文。',
      stepTitle: '单章正文写作',
      module: 'write',
      allowedWrites: ['4-正文/第001章_草稿.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.write],
      modelConfig: {
        provider: 'gemini-native',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gem-key',
        model: 'gemini-2.5-pro',
        temperature: 0.4,
        stream: true,
      },
      allowLocalFallback: false,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const requestBody = JSON.parse(init.body);
    expect(requestBody.system_instruction.parts[0].text).toContain('严格执行去 AI 味约束');
    expect(requestBody.system_instruction.parts[0].text).toContain('严禁使用黑名单词汇和套路化句式');
    expect(requestBody.system_instruction.parts[0].text).toContain('比喻句必须克制');
    expect(requestBody.system_instruction.parts[0].text).toContain('不要在正文后追加解释性总结');
    expect(requestBody.system_instruction.parts[0].text).toContain('禁止“不仅……而且……”式否定排比');
    expect(requestBody.system_instruction.parts[0].text).toContain('避免三段式排比');
    expect(requestBody.system_instruction.parts[0].text).toContain('不要写金句式总结');
  });

  it('adds revision-focused guidance when a current chapter review report is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    reply: '好的，继续局部改写。',
                    proposedWrites: [{ path: '4-正文/第001章_草稿.md', content: '# 第001章\n\n修订稿。' }],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateAssistantReply({
      systemPrompt: '当前步骤：单章正文写作',
      userPrompt: '用户消息：继续修改当前章。',
      stepTitle: '单章正文写作',
      module: 'write',
      allowedWrites: ['4-正文/第001章_草稿.md'],
      projectFiles: [
        {
          path: '5-审查/第001章_审查报告.md',
          content: '# 第001章 审查报告\n\n## AI味专项检查\n- 局部改写任务 1：删除解释性总结句。',
        },
      ],
      workflowDocs: [skillPack.modules.write],
      modelConfig: {
        provider: 'gemini-native',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gem-key',
        model: 'gemini-2.5-pro',
        temperature: 0.4,
        stream: true,
      },
      allowLocalFallback: false,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const requestBody = JSON.parse(init.body);
    expect(requestBody.system_instruction.parts[0].text).toContain('如果当前章已有审查报告，必须优先按审查报告执行局部改写任务');
    expect(requestBody.system_instruction.parts[0].text).toContain('只改有问题的句子、段落或场景');
    expect(requestBody.system_instruction.parts[0].text).toContain('非目标段落必须保持原样');
    expect(requestBody.system_instruction.parts[0].text).toContain('不要把整章无差别重写');
  });

  it('adds anti-ai-smell review instructions for localized rewrites', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: '已生成审查报告。',
                proposedWrites: [{ path: '5-审查/第001章_审查报告.md', content: '# 审查报告' }],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateAssistantReply({
      systemPrompt: '当前步骤：正文质检',
      userPrompt: '用户消息：请审查第一章草稿。',
      stepTitle: '正文质检',
      module: 'review',
      allowedWrites: ['5-审查/第001章_审查报告.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.review],
      modelConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        stream: true,
      },
      allowLocalFallback: false,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const requestBody = JSON.parse(init.body);
    expect(requestBody.messages[0].content).toContain('必须单列 AI 味专项检查');
    expect(requestBody.messages[0].content).toContain('命中的 AI 味类型');
    expect(requestBody.messages[0].content).toContain('原句或段落');
    expect(requestBody.messages[0].content).toContain('局部改写建议');
    expect(requestBody.messages[0].content).toContain('改写策略');
    expect(requestBody.messages[0].content).toContain('验收标准');
    expect(requestBody.messages[0].content).toContain('优先提出句子、段落或场景级别的局部改写建议');
    expect(requestBody.messages[0].content).toContain('只有在局部改写无法解决时，才建议整章重写');
  });

  it('builds structured ideation drafts from the current project context', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：创意孵化与设定构建',
      userPrompt: '用户消息：补全设定案、金手指和角色表。',
      stepTitle: '创意孵化与设定构建',
      module: 'ideation',
      allowedWrites: [
        '2-设定/2.2_新书设定案.md',
        '2-设定/2.3_金手指设定.md',
        '2-设定/2.4_主要角色设定表.md',
        '.novelkit/constitution/MASTER.md',
      ],
      projectFiles: [
        {
          path: '2-设定/2.1_创意脑暴.md',
          content: '# 套路方向与核心设定\n\n## 1. 核心梗 (Core Premise)\n龟丞相在西游世界苟道长生。',
        },
        {
          path: '.novelkit/constitution/MASTER.md',
          content: '# MASTER\n\n## 项目特有红线\n- 已有规则\n',
        },
      ],
      workflowDocs: [skillPack.modules.ideation],
    });

    expect(
      proposal.proposedWrites.find((item) => item.path === '2-设定/2.2_新书设定案.md')?.content,
    ).toContain('## 世界观');
    expect(
      proposal.proposedWrites.find((item) => item.path === '2-设定/2.2_新书设定案.md')?.content,
    ).toContain('龟丞相在西游世界苟道长生');
    expect(
      proposal.proposedWrites.find((item) => item.path === '2-设定/2.3_金手指设定.md')?.content,
    ).toContain('## 核心概念');
    expect(
      proposal.proposedWrites.find((item) => item.path === '2-设定/2.4_主要角色设定表.md')?.content,
    ).toContain('## 主角');
    expect(
      proposal.proposedWrites.find((item) => item.path === '.novelkit/constitution/MASTER.md')?.content,
    ).toContain('项目特有红线');
    expect(
      proposal.proposedWrites.find((item) => item.path === '.novelkit/constitution/MASTER.md')?.content,
    ).toContain('龟丞相在西游世界苟道长生');
  });

  it('builds structured outline drafts with the required master outline sections', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：全书大纲规划',
      userPrompt: '用户消息：开始规划总纲、卷纲和章纲。',
      stepTitle: '全书大纲规划',
      module: 'outline',
      allowedWrites: [
        '3-大纲/3.1_全书结构总纲.md',
        '3-大纲/第01卷_完整卷纲.md',
        '3-大纲/第01卷_章纲.md',
      ],
      projectFiles: [
        {
          path: '2-设定/2.2_新书设定案.md',
          content: '# 新书设定案\n\n核心方向：龟丞相在西游世界苟道长生。',
        },
      ],
      workflowDocs: [skillPack.modules.outline],
    });

    expect(
      proposal.proposedWrites.find((item) => item.path === '3-大纲/3.1_全书结构总纲.md')?.content,
    ).toContain('## 全书剧情单元总览');
    expect(
      proposal.proposedWrites.find((item) => item.path === '3-大纲/3.1_全书结构总纲.md')?.content,
    ).toContain('## 核心节奏公式');
    expect(
      proposal.proposedWrites.find((item) => item.path === '3-大纲/3.1_全书结构总纲.md')?.content,
    ).toContain('## 节奏密度统计表');
    expect(
      proposal.proposedWrites.find((item) => item.path === '3-大纲/第01卷_章纲.md')?.content,
    ).toContain('第1章：');
    expect(
      proposal.proposedWrites.find((item) => item.path === '3-大纲/第01卷_章纲.md')?.content,
    ).toContain('**场景拆解**');
  });

  it('builds a write proposal from chapter scenes and write workflow checks', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：单章正文写作',
      userPrompt: '用户消息：开始写第一章正文。',
      stepTitle: '单章正文写作',
      module: 'write',
      allowedWrites: ['4-正文/第002章_草稿.md'],
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content:
            '第1章：夹缝求生\n\n**章节梗概**：主角在危险环境里第一次显露“苟住才有机会翻盘”的核心策略。\n\n**场景拆解**：\n- 场景1：危机降临，先展示外部压迫\n- 场景2：主角做出低调试探\n- 场景3：第一轮小反制\n\n**伏笔与线索**：\n- 埋入：主角身上的异常来源\n\n**结尾钩子**：主角意识到更大的规则压制已经开始。\n\n第2章：借势藏锋\n\n**章节梗概**：主角借一次意外事件隐藏真实能力，并为下一次破局做准备。\n\n**场景拆解**：\n- 场景1：外部事件升级\n- 场景2：主角内部权衡\n- 场景3：埋下下一次反击条件\n\n**伏笔与线索**：\n- 埋入：一条后续能反咬对手的证据\n\n**结尾钩子**：真正的目标人物出现。',
        },
        { path: '1-边界/1.2_文风.md', content: '# 文风\n克制、紧绷。' },
        { path: '1-边界/1.5_微观节奏拆解.md', content: '# 微观节奏\n前三章必须强钩子。' },
        { path: '2-设定/2.2_新书设定案.md', content: '# 新书设定案\n世界观：西游。' },
        { path: '2-设定/2.3_金手指设定.md', content: '# 金手指设定\n铜钱预演未来。' },
        { path: '.novelkit/constitution/MASTER.md', content: '# MASTER\n## 项目特有红线\n- 不要降智。' },
        { path: '3-大纲/3.1_全书结构总纲.md', content: '# 总纲\n整体节奏明确。' },
        { path: '3-大纲/第01卷_完整卷纲.md', content: '# 卷纲\n卷内冲突明确。' },
        { path: '4-正文/第001章_草稿.md', content: '# 第001章 夹缝求生\n\n主角从破庙雨夜脱身。' },
      ],
      workflowDocs: [skillPack.modules.write],
    });

    expect(proposal.reply).toContain('风格约束');
    expect(proposal.reply).toContain('字数检查');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).toContain('# 第002章 借势藏锋');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).not.toContain('外部事件升级');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).toContain('你知道我为什么来');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).not.toContain('## 场景1');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).not.toContain('并不是偶然发生');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).not.toContain('真正的目标人物出现');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).toContain('袖口的暗扣');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).toContain('主角从破庙雨夜脱身');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).not.toContain('## 完稿自检卡');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第002章_草稿.md')?.content,
    ).toContain('铜钱');
  });

  it('rejects upstream write replies that omit the required chapter draft instead of silently falling back', async () => {
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
                  reply: '我只更新了上下文文件。',
                  proposedWrites: [
                    { path: '1-边界/1.2_文风.md', content: '# 新文风' },
                    { path: '.novelkit/memory/character_state.md', content: '# 状态' },
                  ],
                }),
              },
            },
          ],
        }),
      })),
    );

    await expect(generateAssistantReply({
      systemPrompt: '当前步骤：单章正文写作',
      userPrompt: '用户消息：按审查报告重写第4章正文。',
      stepTitle: '单章正文写作',
      module: 'write',
      allowedWrites: ['4-正文/第004章_草稿.md'],
      strictWorkflowWrites: ['4-正文/第004章_草稿.md', '.novelkit/memory/character_state.md', 'PROJECT.md'],
      chatAllowedWrites: [
        '4-正文/第004章_草稿.md',
        '.novelkit/memory/character_state.md',
        'PROJECT.md',
        '1-边界/1.2_文风.md',
      ],
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content:
            '第4章：雨夜交锋，示敌以弱\n\n**章节梗概**：毒蛇帮喽啰上门催租，陈渊引蛇出洞。\n\n**场景拆解**：\n- 场景1：雨夜踹门\n- 场景2：引入死局\n\n**结尾钩子**：储物袋里藏着新的线索。',
        },
      ],
      workflowDocs: [skillPack.modules.write],
      modelConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        stream: true,
      },
    })).rejects.toMatchObject({
      code: 'proposal-invalid-response',
    });
  });

  it('parses later chapter plans even when chapter outline headings are renamed', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：单章正文写作',
      userPrompt: '用户消息：继续写第三章正文。',
      stepTitle: '单章正文写作',
      module: 'write',
      allowedWrites: ['4-正文/第003章_草稿.md'],
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content:
            '第3章：暗潮涌动\n\n**剧情概述**：主角发现局面比预期更危险。\n\n**场景设计**：\n- 场景1：夜探旧地\n- 场景2：发现被监视\n\n**线索安排**：\n- 推进：旧敌重新出现\n\n**章节钩子**：主角意识到真正的陷阱刚刚开始。',
        },
      ],
      workflowDocs: [skillPack.modules.write],
    });

    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第003章_草稿.md')?.content,
    ).toContain('# 第003章 暗潮涌动');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第003章_草稿.md')?.content,
    ).not.toContain('夜探旧地');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第003章_草稿.md')?.content,
    ).not.toContain('主角在这一场景里');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第003章_草稿.md')?.content,
    ).not.toContain('真正的陷阱刚刚开始');
    expect(
      proposal.proposedWrites.find((item) => item.path === '4-正文/第003章_草稿.md')?.content,
    ).toContain('收紧的网');
  });

  it('builds a structured review report proposal from the draft review workflow', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：正文质检',
      userPrompt: '用户消息：请审查第一章草稿。',
      stepTitle: '正文质检',
      module: 'review',
      allowedWrites: ['5-审查/第002章_审查报告.md'],
      projectFiles: [
        {
          path: '4-正文/第002章_草稿.md',
          content: '# 第002章 借势藏锋\n\n主角还是没有抬头。',
        },
        {
          path: '1-边界/1.2_文风.md',
          content: '# 文风指南\n\n强调克制叙事。',
        },
        {
          path: '.novelkit/constitution/MASTER.md',
          content: '# MASTER\n\n## 项目特有红线\n- 已有规则\n',
        },
      ],
      workflowDocs: [skillPack.modules.review],
    });

    expect(proposal.reply).toContain('黄金三章法则');
    expect(proposal.reply).toContain('文风与红线');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/第002章_审查报告.md')?.content,
    ).toContain('# 第002章 审查报告');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/第002章_审查报告.md')?.content,
    ).toContain('## 黄金三章法则 (Opening)');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/第002章_审查报告.md')?.content,
    ).toContain('## 结论');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/第002章_审查报告.md')?.content,
    ).toContain('克制叙事');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/第002章_审查报告.md')?.content,
    ).toContain('已有规则');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/第002章_审查报告.md')?.content,
    ).toContain('第003章');
  });

  it('builds a structured setting review report when reviewing ideation assets', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：设定质检',
      userPrompt: '用户消息：请审查当前设定。',
      stepTitle: '设定质检',
      module: 'review',
      allowedWrites: ['5-审查/设定审查报告.md'],
      projectFiles: [
        { path: '2-设定/2.2_新书设定案.md', content: '# 新书设定案\n\n世界观完整。' },
        { path: '2-设定/2.3_金手指设定.md', content: '# 金手指设定\n\n能力明确。' },
        { path: '2-设定/2.4_主要角色设定表.md', content: '# 主要角色设定表\n\n主角已定义。' },
        { path: '1-边界/1.2_文风.md', content: '# 文风指南\n\n强调克制叙事。' },
        { path: '.novelkit/constitution/MASTER.md', content: '# MASTER\n\n## 项目特有红线\n- 已有规则\n' },
      ],
      workflowDocs: [skillPack.modules.review],
    });

    expect(proposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '5-审查/设定审查报告.md' })]),
    );
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/设定审查报告.md')?.content,
    ).toContain('# 设定审查报告');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/设定审查报告.md')?.content,
    ).toContain('## 逻辑自洽性 (Internal Logic)');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/设定审查报告.md')?.content,
    ).toContain('证据摘录');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/设定审查报告.md')?.content,
    ).toContain('世界观完整');
  });

  it('builds a structured outline review report when reviewing outline assets', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('NOVEL_FLOW_API_KEY', '');

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：大纲质检',
      userPrompt: '用户消息：请审查当前大纲。',
      stepTitle: '大纲质检',
      module: 'review',
      allowedWrites: ['5-审查/大纲审查报告.md'],
      projectFiles: [
        { path: '3-大纲/3.1_全书结构总纲.md', content: '# 全书结构总纲\n\n框架完整。' },
        { path: '3-大纲/第01卷_完整卷纲.md', content: '# 第01卷 完整卷纲\n\n卷纲完整。' },
        { path: '3-大纲/第01卷_章纲.md', content: '第1章：开篇' },
        { path: '1-边界/1.2_文风.md', content: '# 文风指南\n\n强调克制叙事。' },
      ],
      workflowDocs: [skillPack.modules.review],
    });

    expect(proposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '5-审查/大纲审查报告.md' })]),
    );
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/大纲审查报告.md')?.content,
    ).toContain('# 大纲审查报告');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/大纲审查报告.md')?.content,
    ).toContain('## 节奏密度 (Pacing)');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/大纲审查报告.md')?.content,
    ).toContain('证据摘录');
    expect(
      proposal.proposedWrites.find((item) => item.path === '5-审查/大纲审查报告.md')?.content,
    ).toContain('框架完整');
  });

  it('supports gemini-native proposal generation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: 'Gemini 已生成提案。',
                      proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })),
    );

    const proposal = await generateAssistantReply({
      systemPrompt: '当前步骤：新书方向定义',
      userPrompt: '用户消息：我想写一个苟道修仙故事。',
      stepTitle: '新书方向定义',
      module: 'define',
      allowedWrites: ['2-设定/2.1_创意脑暴.md'],
      projectFiles: [],
      workflowDocs: [skillPack.modules.define],
      modelConfig: {
        provider: 'gemini-native',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gem-key',
        model: 'gemini-2.5-pro',
        temperature: 0.5,
        stream: true,
      },
    });

    expect(proposal.reply).toContain('Gemini');
    expect(proposal.proposedWrites).toEqual([{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }]);
  });
});
