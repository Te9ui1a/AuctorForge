export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export class ApiRequestError extends Error {
  readonly payload?: ApiErrorPayload;

  constructor(message: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiRequestError';
    this.payload = payload;
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readRouteProjectId(pathname = globalThis.window?.location?.pathname ?? '') {
  const match = pathname.match(/^\/projects\/([^/?#]+)/);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function resolveProjectHeaderId(activeProjectId?: string | null) {
  return normalizeOptionalString(activeProjectId) ?? readRouteProjectId();
}

export function buildProjectScopedHeaders(
  headers: Record<string, string> = {},
  activeProjectId?: string | null,
) {
  const nextHeaders = { ...headers };
  const projectId = resolveProjectHeaderId(activeProjectId);

  if (projectId) {
    nextHeaders['x-project-id'] = projectId;
  }

  return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readApiError(response: Response, fallbackMessage: string) {
  try {
    const data = (await response.json()) as unknown;
    const error = isRecord(data) && isRecord(data.error) ? data.error : null;
    const message = typeof error?.message === 'string' && error.message.trim().length > 0
      ? error.message
      : fallbackMessage;
    const payload: ApiErrorPayload | undefined = error
      ? {
          code: typeof error.code === 'string' ? error.code : undefined,
          message,
          details: isRecord(error.details) ? error.details : undefined,
        }
      : undefined;

    return new ApiRequestError(message, payload);
  } catch {
    return new ApiRequestError(fallbackMessage);
  }
}

export async function ensureOk(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw await readApiError(response, fallbackMessage);
  }
}
