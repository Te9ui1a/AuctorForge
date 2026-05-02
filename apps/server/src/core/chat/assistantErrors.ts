import type { ModelProvider } from '../settings/modelConfig';

import {
  ModelGenerationError,
  type ModelGenerationErrorOptions,
  serializeModelGenerationErrorCause,
} from './modelGenerationError';

export type AssistantGenerationErrorCode =
  | 'proposal-api-key-missing'
  | 'proposal-upstream-response'
  | 'proposal-empty-response'
  | 'proposal-invalid-response'
  | 'proposal-network-error';

export type AssistantProvider = ModelProvider;

type AssistantGenerationErrorOptions = Omit<ModelGenerationErrorOptions<AssistantGenerationErrorCode>, 'name'>;

export class AssistantGenerationError extends ModelGenerationError<AssistantGenerationErrorCode> {
  constructor(options: AssistantGenerationErrorOptions) {
    super({
      name: 'AssistantGenerationError',
      ...options,
    });
  }
}

export function isAssistantGenerationError(error: unknown): error is AssistantGenerationError {
  return error instanceof AssistantGenerationError;
}

export function createAssistantApiKeyMissingError() {
  return new AssistantGenerationError({
    code: 'proposal-api-key-missing',
    message: '提案生成失败：未配置模型 API Key。',
    statusCode: 503,
  });
}

export function createAssistantUpstreamResponseError({
  provider,
  status,
}: {
  provider: AssistantProvider;
  status: number;
}) {
  return new AssistantGenerationError({
    code: 'proposal-upstream-response',
    message: `提案生成失败：${provider} 模型服务返回了非成功响应。`,
    statusCode: 502,
    details: {
      provider,
      status,
    },
  });
}

export function createAssistantEmptyResponseError({
  provider,
}: {
  provider: AssistantProvider;
}) {
  return new AssistantGenerationError({
    code: 'proposal-empty-response',
    message: `提案生成失败：${provider} 模型未返回有效内容。`,
    statusCode: 502,
    details: {
      provider,
    },
  });
}

export function createAssistantInvalidResponseError({
  provider,
}: {
  provider: AssistantProvider;
}) {
  return new AssistantGenerationError({
    code: 'proposal-invalid-response',
    message: `提案生成失败：${provider} 模型返回的内容不是有效提案格式。`,
    statusCode: 502,
    details: {
      provider,
    },
  });
}

export function createAssistantNetworkError({
  provider,
  cause,
}: {
  provider: AssistantProvider;
  cause: unknown;
}) {
  return new AssistantGenerationError({
    code: 'proposal-network-error',
    message: `提案生成失败：请求 ${provider} 模型服务时发生网络异常。`,
    statusCode: 502,
    details: {
      provider,
      cause: serializeModelGenerationErrorCause(cause),
    },
    cause,
  });
}
