import type { ModelConfig } from '../settings/modelConfig';

export type PlannedChatTurnIntent = 'discussion' | 'proposal' | 'approval' | 'workflow-action';

export type PlannedChatTurn = {
  intent: PlannedChatTurnIntent;
  reason: string;
  source: 'fallback' | 'model';
};

type PlanChatTurnOptions = {
  activeDocumentPath: string | null;
  chatAllowedWrites: string[];
  currentModule: string;
  currentStepTitle: string;
  currentSubstepTitle?: string;
  discussionNotes: string[];
  hasPendingDecision: boolean;
  hasPendingProposal: boolean;
  modelConfig?: ModelConfig;
  userMessage: string;
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

const MODEL_PLANNER_TIMEOUT_MS = 30_000;

export async function planChatTurn(options: PlanChatTurnOptions): Promise<PlannedChatTurn> {
  const fallbackDecision = planChatTurnDeterministically(options.userMessage);
  if (fallbackDecision !== null) {
    return fallbackDecision;
  }

  const modelDecision = await planChatTurnWithModel(options);
  if (modelDecision !== null) {
    return modelDecision;
  }

  return {
    intent: 'discussion',
    reason: 'Fallback to discussion because planner model was unavailable or returned invalid output.',
    source: 'fallback',
  };
}

function planChatTurnDeterministically(userMessage: string): PlannedChatTurn | null {
  const normalized = userMessage.trim();
  const compact = normalized.replace(/\s+/g, '');

  if (hasNegatedDiscussionIntent(compact) && isFallbackProposalIntent(normalized, compact)) {
    return {
      intent: 'proposal',
      reason: 'User explicitly rejected more discussion and asked for generated output.',
      source: 'fallback',
    };
  }

  if (isFallbackDiscussionIntent(normalized, compact)) {
    return {
      intent: 'discussion',
      reason: 'User wording is explicitly conversational or exploratory.',
      source: 'fallback',
    };
  }

  if (isFallbackProposalIntent(normalized, compact)) {
    return {
      intent: 'proposal',
      reason: 'User wording explicitly asks for generated or writable output.',
      source: 'fallback',
    };
  }

  return null;
}

function hasNegatedDiscussionIntent(compactMessage: string) {
  return /(?:不用|不要|无需|不必|别|先不|暂不|不再)(?:再|继续)?(?:讨论|聊聊|聊)/u.test(compactMessage);
}

function isFallbackDiscussionIntent(normalized: string, compact: string) {
  if (/(先聊|聊聊|继续讨论|讨论|分析|比较|对比|解释|为什么|怎么|区别|差别|差异|是不是)/u.test(normalized)) {
    return true;
  }

  if (/[？?]\s*$/u.test(normalized) || /吗\s*$/u.test(normalized)) {
    return true;
  }

  if (/^(我想写|想写一本|我还在想|我有个想法|我想做|感觉|觉得)/u.test(normalized)) {
    return true;
  }

  return /(?:先别|先不要|暂不|先不|别|不要)(?:直接)?(?:落盘|写入|生成|起草|输出|创建|产出)/u.test(compact);
}

function isFallbackProposalIntent(normalized: string, compact: string) {
  if (/(生成|草案|起草|写入|落盘|创建|产出|给我一版|给我一份|输出|写第\s*\d+\s*章|写下一章)/u.test(normalized)) {
    return true;
  }

  if (/(?:帮我|替我|给我|请你|你来|直接)?(?:构思|设计)(?:一个|一版|一下)?/u.test(normalized)) {
    return true;
  }

  if (/(?:帮我|替我|给我|请你|你来).{0,6}想(?:一个|一版)/u.test(normalized)) {
    return true;
  }

  return /^(请|帮我|先|开始|继续|直接)?(补全|完善|规划|细化|开始写|继续写|开始补全|继续补全|开始规划|继续规划)/u.test(compact);
}

async function planChatTurnWithModel(options: PlanChatTurnOptions): Promise<PlannedChatTurn | null> {
  const apiKey = options.modelConfig?.apiKey || process.env.NOVEL_FLOW_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const provider = options.modelConfig?.provider === 'gemini-native' ? 'gemini-native' : 'openai-compatible';
  const baseUrl = options.modelConfig?.baseUrl || process.env.NOVEL_FLOW_API_BASE || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = options.modelConfig?.model || process.env.NOVEL_FLOW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature = options.modelConfig?.temperature ?? 0;
  const prompt = buildPlannerPrompt(options);

  try {
    if (provider === 'gemini-native') {
      const response = await fetchWithTimeout(
        `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: buildPlannerSystemInstruction() }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: { temperature },
          }),
        },
        MODEL_PLANNER_TIMEOUT_MS,
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as GeminiResponse;
      const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
      return content ? tryParsePlannerDecision(content) : null;
    }

    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildPlannerSystemInstruction() },
            { role: 'user', content: prompt },
          ],
          temperature,
        }),
      },
      MODEL_PLANNER_TIMEOUT_MS,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? tryParsePlannerDecision(content) : null;
  } catch {
    return null;
  }
}

function buildPlannerSystemInstruction() {
  return [
    '你是小说创作 WebUI 的聊天回合规划器。',
    '只判断本轮用户意图，不生成小说内容，不写文件。',
    '输出严格 JSON：{"intent":"discussion|proposal|approval|workflow-action","reason":"简短原因"}。',
    'discussion 表示自然讨论或追问；proposal 表示用户希望助手产出一版可确认的写入提案。',
    'approval 只用于用户明确批准已有提案；workflow-action 只用于明确切换流程或执行审查/续章等动作。',
  ].join('\n');
}

function buildPlannerPrompt(options: PlanChatTurnOptions) {
  return [
    `用户消息：${options.userMessage}`,
    `当前模块：${options.currentModule}`,
    `当前步骤：${options.currentStepTitle}`,
    options.currentSubstepTitle ? `当前子步骤：${options.currentSubstepTitle}` : null,
    `有待确认提案：${options.hasPendingProposal ? '是' : '否'}`,
    `有待确认决策：${options.hasPendingDecision ? '是' : '否'}`,
    options.activeDocumentPath ? `当前激活文档：${options.activeDocumentPath}` : null,
    options.chatAllowedWrites.length > 0 ? `聊天可写入范围：${options.chatAllowedWrites.join('\n')}` : null,
    options.discussionNotes.length > 0 ? `最近讨论：${options.discussionNotes.join('\n')}` : null,
  ].filter(Boolean).join('\n\n');
}

function tryParsePlannerDecision(content: string): PlannedChatTurn | null {
  for (const candidate of extractJsonCandidates(content)) {
    try {
      const parsed = JSON.parse(candidate) as Partial<PlannedChatTurn>;
      if (
        parsed.intent !== 'discussion'
        && parsed.intent !== 'proposal'
        && parsed.intent !== 'approval'
        && parsed.intent !== 'workflow-action'
      ) {
        continue;
      }

      return {
        intent: parsed.intent,
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'Model planner decision.',
        source: 'model',
      };
    } catch {
      continue;
    }
  }

  return null;
}

function extractJsonCandidates(content: string) {
  const trimmed = content.trim();
  const candidates = new Set<string>();

  if (trimmed.length > 0) {
    candidates.add(trimmed);
    candidates.add(trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim());
  }

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const fenced = match[1]?.trim();
    if (fenced) {
      candidates.add(fenced);
    }
  }

  const firstBraceIndex = trimmed.indexOf('{');
  const lastBraceIndex = trimmed.lastIndexOf('}');
  if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    candidates.add(trimmed.slice(firstBraceIndex, lastBraceIndex + 1).trim());
  }

  return [...candidates].filter((candidate) => candidate.length > 0);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
