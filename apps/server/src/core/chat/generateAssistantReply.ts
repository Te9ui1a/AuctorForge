import type { BuiltPrompt } from './buildPrompt';
import {
  createAssistantApiKeyMissingError,
  createAssistantEmptyResponseError,
  createAssistantInvalidResponseError,
  createAssistantNetworkError,
  createAssistantUpstreamResponseError,
  isAssistantGenerationError,
  type AssistantProvider,
} from './assistantErrors';
import { buildLocalProposal } from './assistantLocalProposal';
import { tryParseAssistantProposal } from './assistantProposalParsers';
export type { AssistantProposal, ProposedWrite } from './assistantProposalTypes';
import { resolvePreferredWritePaths } from './resolvePreferredWritePaths';
import { normalizeProjectPath } from '../compat/rules';
import { CONTROL_PANEL_PATH } from '../paths/projectPaths';
import type { ModelConfig } from '../settings/modelConfig';

type GenerateAssistantReplyOptions = Pick<BuiltPrompt, 'systemPrompt' | 'userPrompt'> & {
  stepTitle: string;
  module: string;
  allowedWrites: string[];
  strictWorkflowWrites?: string[];
  chatAllowedWrites?: string[];
  activeDocumentPath?: string | null;
  projectFiles: BuiltPrompt['projectFiles'];
  workflowDocs: BuiltPrompt['workflowDocs'];
  modelConfig?: ModelConfig;
  allowLocalFallback?: boolean;
  requestTimeoutMs?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const ASSISTANT_JSON_INSTRUCTIONS = [
  '请输出 JSON 对象，格式为 {"reply": string, "proposedWrites": [{"path": string, "content": string}] }。',
  '只允许使用当前允许写入列表中的路径，不要输出额外字段。',
].join('\n\n');

const DEFAULT_ASSISTANT_REQUEST_TIMEOUT_MS = 300_000;

const GEMINI_PROPOSAL_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['reply', 'proposedWrites'],
  propertyOrdering: ['reply', 'proposedWrites'],
  properties: {
    reply: {
      type: 'STRING',
    },
    proposedWrites: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['path', 'content'],
        propertyOrdering: ['path', 'content'],
        properties: {
          path: {
            type: 'STRING',
          },
          content: {
            type: 'STRING',
          },
        },
      },
    },
  },
} as const;

function buildAssistantRuntimeInstructions({
  module,
  effectiveChatAllowedWrites,
  projectFiles,
}: {
  module: string;
  effectiveChatAllowedWrites: string[];
  projectFiles: BuiltPrompt['projectFiles'];
}) {
  const instructions = [
    ASSISTANT_JSON_INSTRUCTIONS,
    '所有说明性文本只能放在 reply 字段中，不要输出额外的 Markdown 包装说明。',
    '当前是待确认提案阶段。reply 只能描述“已生成待确认提案”，不能声称已经写入文件、已经保存或已经后台落盘。',
  ];

  if (module === 'outline') {
    const concreteWritableTargets = effectiveChatAllowedWrites.filter((path) => path !== CONTROL_PANEL_PATH);
    instructions.push(
      '当前产品运行模式要求你在本轮直接给出可写入的文件提案，不要继续多轮讨论，也不要只给选项。',
      '如果当前处于总纲/卷纲/章纲阶段，proposedWrites 中必须至少包含一个真实大纲文件。',
      ['仅可使用以下精确文件路径：', ...concreteWritableTargets].join('\n'),
      '不要使用占位路径如 3-大纲/XX卷_完整卷纲.md 或 3-大纲/XX卷_章纲.md；如果你要生成对应内容，请改用上面列出的精确路径。',
      '不要在 proposedWrites 中输出 PROJECT.md；系统会在写入后自动同步索引。',
    );
  }

  if (module === 'write') {
    instructions.push(
      '严格执行去 AI 味约束。写正文时必须主动规避黑名单词汇、套路化句式、翻译腔和解释性总结。',
      '严禁使用黑名单词汇和套路化句式；如需表达情绪，优先用动作、环境和对话承载，不要直接下判断。',
      '每章正文必须至少写到3000字；低于3000字视为未完成章节，不要用摘要、章纲或场景梗概冒充正文。',
      '比喻句必须克制，每章只保留极少数真正必要的比喻，禁止连续堆砌“仿佛、宛如、像……”式修辞。',
      '禁止“不仅……而且……”式否定排比，避免三段式排比、空泛拔高、模糊归因和过度连接词。',
      '不要写金句式总结，也不要在段尾用漂亮废话替读者概括主题。',
      '不要在正文后追加解释性总结、主题拔高或替读者下结论。',
    );

    if (projectFiles.some((file) => /^5-审查\/第\d+章_审查报告\.md$/u.test(file.path) && Boolean(file.content))) {
      instructions.push(
        '如果当前章已有审查报告，必须优先按审查报告执行局部改写任务。',
        '只改有问题的句子、段落或场景，非目标段落必须保持原样，不要把整章无差别重写。',
        '局部改写必须按审查报告中的原句、问题类型、改写策略和验收标准执行；不要用同义套话替换禁用词。',
      );
    }
  }

  if (module === 'review') {
    instructions.push(
      '审查报告必须包含一行明确评级：`- 审查评级：PASS`、`- 审查评级：REVISE` 或 `- 审查评级：BLOCK`。',
      '必须单列 AI 味专项检查，明确指出哪些词汇、句式、比喻或解释性旁白让文本显得像 AI 生成。',
      'AI 味专项检查必须包含：命中的 AI 味类型、原句或段落、局部改写建议。',
      '请在审查报告中额外输出一个标题为“局部改写任务”的独立章节。',
      '每个局部改写任务必须包含：原文片段、问题类型、改写策略、验收标准。',
      '优先提出句子、段落或场景级别的局部改写建议，尽量不要直接建议整章重写。',
      '只有在局部改写无法解决时，才建议整章重写。',
    );
  }

  return instructions.join('\n\n');
}

export async function generateAssistantReply({
  systemPrompt,
  userPrompt,
  stepTitle,
  module,
  allowedWrites,
  strictWorkflowWrites,
  chatAllowedWrites,
  activeDocumentPath,
  projectFiles,
  workflowDocs,
  modelConfig,
  allowLocalFallback = true,
  requestTimeoutMs = DEFAULT_ASSISTANT_REQUEST_TIMEOUT_MS,
}: GenerateAssistantReplyOptions) {
  const strictWrites = strictWorkflowWrites ?? allowedWrites;
  const chatWrites = chatAllowedWrites ?? allowedWrites;
  const preferredWritePaths = resolvePreferredWritePaths({
    userPrompt,
    strictWorkflowWrites: strictWrites,
    chatAllowedWrites: chatWrites,
    activeDocumentPath,
  });
  const prefersOnlyStrictFallback = arraysEqual(preferredWritePaths, strictWrites);
  const explicitPreferredWritePaths = prefersOnlyStrictFallback ? [] : preferredWritePaths;
  const effectiveChatAllowedWrites = uniquePaths([...chatWrites, ...explicitPreferredWritePaths]);
  const assistantRuntimeInstructions = buildAssistantRuntimeInstructions({
    module,
    effectiveChatAllowedWrites,
    projectFiles,
  });
  const buildFallbackProposal = () => buildLocalProposal({
    stepTitle,
    module,
    strictWorkflowWrites: strictWrites,
    chatAllowedWrites: effectiveChatAllowedWrites,
    preferredWritePaths: explicitPreferredWritePaths,
    userPrompt,
    projectFiles,
    workflowDocs,
  });
  const hasExplicitModelConfig = modelConfig !== undefined;
  const canUseLocalFallbackForModelFailure = allowLocalFallback && !hasExplicitModelConfig;
  const apiKey = modelConfig?.apiKey || process.env.NOVEL_FLOW_API_KEY || process.env.OPENAI_API_KEY;
  const provider: AssistantProvider = modelConfig?.provider === 'gemini-native' ? 'gemini-native' : 'openai-compatible';

  if (!apiKey) {
    if (!allowLocalFallback || hasExplicitModelConfig) {
      throw createAssistantApiKeyMissingError();
    }

    return buildFallbackProposal();
  }

  const baseUrl = modelConfig?.baseUrl || process.env.NOVEL_FLOW_API_BASE || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = modelConfig?.model || process.env.NOVEL_FLOW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature = modelConfig?.temperature ?? 0.7;

  try {
    if (modelConfig?.provider === 'gemini-native') {
      const response = await fetchWithTimeout(
        `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: [systemPrompt, assistantRuntimeInstructions].join('\n\n') }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature,
              responseMimeType: 'application/json',
              responseSchema: GEMINI_PROPOSAL_RESPONSE_SCHEMA,
            },
          }),
        },
        requestTimeoutMs,
      );

      if (!response.ok) {
        throw createAssistantUpstreamResponseError({ provider, status: response.status });
      }

      const data = (await response.json()) as GeminiResponse;
      const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();

      if (!content) {
        if (canUseLocalFallbackForModelFailure) {
          return buildFallbackProposal();
        }

        throw createAssistantEmptyResponseError({ provider });
      }

      const parsed = tryParseAssistantProposal(content);
      if (!parsed) {
        if (canUseLocalFallbackForModelFailure) {
          return buildFallbackProposal();
        }

        throw createAssistantInvalidResponseError({ provider });
      }

      const proposedWrites = filterAssistantProposedWrites(parsed.proposedWrites, effectiveChatAllowedWrites);
      if (shouldFallBackForMissingStageWrite({ module, strictWrites, explicitPreferredWritePaths, proposedWrites })) {
        if (canUseLocalFallbackForModelFailure) {
          return buildFallbackProposal();
        }

        throw createAssistantInvalidResponseError({ provider });
      }

      return {
        reply: parsed.reply,
        proposedWrites,
      };
    }

    const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: [
              systemPrompt,
              assistantRuntimeInstructions,
            ].join('\n\n'),
          },
          { role: 'user', content: userPrompt },
        ],
        temperature,
      }),
    }, requestTimeoutMs);

    if (!response.ok) {
      throw createAssistantUpstreamResponseError({ provider, status: response.status });
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      if (canUseLocalFallbackForModelFailure) {
        return buildFallbackProposal();
      }

      throw createAssistantEmptyResponseError({ provider });
    }

    const parsed = tryParseAssistantProposal(content);
    if (!parsed) {
      if (canUseLocalFallbackForModelFailure) {
        return buildFallbackProposal();
      }

      throw createAssistantInvalidResponseError({ provider });
    }

    const proposedWrites = filterAssistantProposedWrites(parsed.proposedWrites, effectiveChatAllowedWrites);
    if (shouldFallBackForMissingStageWrite({ module, strictWrites, explicitPreferredWritePaths, proposedWrites })) {
      if (canUseLocalFallbackForModelFailure) {
        return buildFallbackProposal();
      }

      throw createAssistantInvalidResponseError({ provider });
    }

    return {
      reply: parsed.reply,
      proposedWrites,
    };
  } catch (error) {
    if (isAssistantGenerationError(error)) {
      throw error;
    }

    if (canUseLocalFallbackForModelFailure) {
      return buildFallbackProposal();
    }

    throw createAssistantNetworkError({ provider, cause: error });
  }
}

function shouldFallBackForMissingStageWrite({
  module,
  strictWrites,
  explicitPreferredWritePaths,
  proposedWrites,
}: {
  module: string;
  strictWrites: string[];
  explicitPreferredWritePaths: string[];
  proposedWrites: Array<{ path: string }>;
}) {
  if (explicitPreferredWritePaths.length > 0) {
    return false;
  }

  const requiredPrefixes =
    module === 'write'
      ? ['4-正文/']
      : module === 'review'
        ? ['5-审查/']
        : [];

  if (requiredPrefixes.length === 0) {
    return false;
  }

  const requiredWriteSet = new Set(
    strictWrites
      .filter((path) => requiredPrefixes.some((prefix) => normalizeProjectPath(path).startsWith(prefix)))
      .map(normalizeProjectPath),
  );

  if (requiredWriteSet.size === 0) {
    return false;
  }

  return !proposedWrites.some((write) => requiredWriteSet.has(normalizeProjectPath(write.path)));
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function uniquePaths(paths: string[]) {
  return [...new Set(paths)];
}

function filterAssistantProposedWrites(
  proposedWrites: Array<{ path: string; content: string }>,
  effectiveChatAllowedWrites: string[],
) {
  return proposedWrites.flatMap((item) => {
    const resolvedPath = resolveAssistantWritePath(item.path, effectiveChatAllowedWrites);

    if (resolvedPath === null || resolvedPath === CONTROL_PANEL_PATH) {
      return [];
    }

    return [{ ...item, path: resolvedPath }];
  });
}

function resolveAssistantWritePath(rawPath: string, effectiveChatAllowedWrites: string[]) {
  const allowedPathByNormalizedValue = new Map(
    effectiveChatAllowedWrites.map((path) => [normalizeProjectPath(path), path]),
  );
  const normalizedRawPath = normalizeProjectPath(rawPath.trim().replace(/^`+|`+$/g, ''));

  const exactAllowedPath = allowedPathByNormalizedValue.get(normalizedRawPath);
  if (exactAllowedPath) {
    return exactAllowedPath;
  }

  const placeholderResolvedPath = resolveOutlinePlaceholderPath(normalizedRawPath, effectiveChatAllowedWrites);
  if (placeholderResolvedPath) {
    return placeholderResolvedPath;
  }

  return null;
}

function resolveOutlinePlaceholderPath(rawPath: string, effectiveChatAllowedWrites: string[]) {
  const normalizedAllowedWrites = effectiveChatAllowedWrites.map((path) => normalizeProjectPath(path));
  const basename = rawPath.split('/').at(-1) ?? '';

  if (basename === 'XX卷_完整卷纲.md') {
    return normalizedAllowedWrites.find((path) => /\/第\d+卷_完整卷纲\.md$/u.test(path)) ?? null;
  }

  if (basename === 'XX卷_章纲.md') {
    return normalizedAllowedWrites.find((path) => /\/第\d+卷_章纲\.md$/u.test(path)) ?? null;
  }

  return null;
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
