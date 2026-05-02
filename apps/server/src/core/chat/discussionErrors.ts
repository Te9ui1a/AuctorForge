import type { ModelProvider } from '../settings/modelConfig';

import {
  ModelGenerationError,
  type ModelGenerationErrorOptions,
  serializeModelGenerationErrorCause,
} from './modelGenerationError';

export type DiscussionGenerationErrorCode =
  | 'discussion-api-key-missing'
  | 'discussion-upstream-response'
  | 'discussion-empty-response'
  | 'discussion-network-error';

export type DiscussionProvider = ModelProvider;

type DiscussionGenerationErrorOptions = Omit<ModelGenerationErrorOptions<DiscussionGenerationErrorCode>, 'name'>;

export class DiscussionGenerationError extends ModelGenerationError<DiscussionGenerationErrorCode> {
  constructor(options: DiscussionGenerationErrorOptions) {
    super({
      name: 'DiscussionGenerationError',
      ...options,
    });
  }
}

export function isDiscussionGenerationError(error: unknown): error is DiscussionGenerationError {
  return error instanceof DiscussionGenerationError;
}

export function createDiscussionApiKeyMissingError() {
  return new DiscussionGenerationError({
    code: 'discussion-api-key-missing',
    message: '讨论回复生成失败：未配置模型 API Key。',
    statusCode: 503,
  });
}

export function createDiscussionUpstreamResponseError({
  provider,
  status,
}: {
  provider: DiscussionProvider;
  status: number;
}) {
  return new DiscussionGenerationError({
    code: 'discussion-upstream-response',
    message: `讨论回复生成失败：${provider} 模型服务返回了非成功响应。`,
    statusCode: 502,
    details: {
      provider,
      status,
    },
  });
}

export function createDiscussionEmptyResponseError({
  provider,
}: {
  provider: DiscussionProvider;
}) {
  return new DiscussionGenerationError({
    code: 'discussion-empty-response',
    message: `讨论回复生成失败：${provider} 模型未返回有效内容。`,
    statusCode: 502,
    details: {
      provider,
    },
  });
}

export function createDiscussionNetworkError({
  provider,
  cause,
}: {
  provider: DiscussionProvider;
  cause: unknown;
}) {
  return new DiscussionGenerationError({
    code: 'discussion-network-error',
    message: `讨论回复生成失败：请求 ${provider} 模型服务时发生网络异常。`,
    statusCode: 502,
    details: {
      provider,
      cause: serializeModelGenerationErrorCause(cause),
    },
    cause,
  });
}
