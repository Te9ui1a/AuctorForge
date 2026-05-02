export type ModelGenerationErrorOptions<TCode extends string> = {
  name: string;
  code: TCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class ModelGenerationError<TCode extends string> extends Error {
  readonly code: TCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor({ name, code, message, statusCode, details, cause }: ModelGenerationErrorOptions<TCode>) {
    super(message);
    this.name = name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.cause = cause;
  }
}

export function serializeModelGenerationErrorCause(cause: unknown) {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message;
  }

  if (typeof cause === 'string' && cause.trim().length > 0) {
    return cause;
  }

  return 'unknown';
}
