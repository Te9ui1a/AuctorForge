import type { ModelConfig } from '../settings/modelConfig';
import {
  createDiscussionApiKeyMissingError,
  createDiscussionEmptyResponseError,
  createDiscussionNetworkError,
  createDiscussionUpstreamResponseError,
  isDiscussionGenerationError,
  type DiscussionProvider,
} from './discussionErrors';

type GenerateDiscussionReplyOptions = {
  systemPrompt: string;
  userPrompt: string;
  stepTitle: string;
  module: string;
  userMessage: string;
  modelConfig?: ModelConfig;
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

const FALSE_WRITE_CLAIM_PATTERN =
  /(已经?.{0,24}(写入|保存|落盘|同步)|已为你.{0,16}(写好|保存)|后台保存|后台已保存|已经提交写入)/u;
const FALSE_CONFIRMATION_REQUEST_PATTERN =
  /(请.{0,12}(回复|发送|输入).{0,8}(确认|同意|批准)|如果.{0,16}(满意|无误|没问题).{0,12}(确认|同意|批准)|确认后.{0,24}(继续|进入|写入|落盘|保存|下一步)|请.{0,16}(确认|审批).{0,16}(继续|进入|写入|落盘|保存|下一步))/u;

export async function generateDiscussionReply({
  systemPrompt,
  userPrompt,
  modelConfig,
}: GenerateDiscussionReplyOptions) {
  const apiKey = modelConfig?.apiKey || process.env.NOVEL_FLOW_API_KEY || process.env.OPENAI_API_KEY;
  const provider: DiscussionProvider = modelConfig?.provider === 'gemini-native' ? 'gemini-native' : 'openai-compatible';

  if (!apiKey) {
    throw createDiscussionApiKeyMissingError();
  }

  const baseUrl = modelConfig?.baseUrl || process.env.NOVEL_FLOW_API_BASE || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = modelConfig?.model || process.env.NOVEL_FLOW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature = modelConfig?.temperature ?? 0.7;

  try {
    if (modelConfig?.provider === 'gemini-native') {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [
                {
                  text: [
                    systemPrompt,
                    '当前是讨论阶段。你只能讨论、分析、整理方向，不能声称已经写入文件、已经保存、已经后台落盘，也不能要求用户回复“确认”来推进。',
                  ].join('\n\n'),
                },
              ],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature,
            },
          }),
        },
      );

      if (!response.ok) {
        throw createDiscussionUpstreamResponseError({ provider, status: response.status });
      }

      const data = (await response.json()) as GeminiResponse;
      const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();

      if (!content) {
        throw createDiscussionEmptyResponseError({ provider });
      }

      return sanitizeDiscussionReply(content);
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
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
              '你是创作助手。当前是讨论阶段，只需自然对话回复，不要输出 JSON，不要提出确认写入或审批指令。',
              '讨论阶段禁止声称已经写入文件、已经保存、后台已落盘；如果用户要落盘，只能说可以整理成提案草案，不能要求用户回复“确认”或暗示已有待确认项。',
            ].join('\n\n'),
          },
          { role: 'user', content: userPrompt },
        ],
        temperature,
      }),
    });

    if (!response.ok) {
      throw createDiscussionUpstreamResponseError({ provider, status: response.status });
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw createDiscussionEmptyResponseError({ provider });
    }

    return sanitizeDiscussionReply(content);
  } catch (error) {
    if (isDiscussionGenerationError(error)) {
      throw error;
    }

    throw createDiscussionNetworkError({ provider, cause: error });
  }
}

function sanitizeDiscussionReply(content: string) {
  if (!FALSE_WRITE_CLAIM_PATTERN.test(content) && !FALSE_CONFIRMATION_REQUEST_PATTERN.test(content)) {
    return content;
  }

  const cleanedSegments = content
    .split(/(?<=[。！？!?]|\n)/u)
    .map((segment) => segment.trim())
    .filter((segment) => (
      segment.length > 0
      && !FALSE_WRITE_CLAIM_PATTERN.test(segment)
      && !FALSE_CONFIRMATION_REQUEST_PATTERN.test(segment)
    ));

  const safetyNotice = '当前仍在讨论阶段，尚未创建待审批项，也尚未写入任何文件。';

  if (cleanedSegments.length === 0) {
    return safetyNotice;
  }

  return [safetyNotice, cleanedSegments.join('\n')].join('\n\n');
}
