import type {
  ChatAttachment,
  ChatMode,
  SessionResponse,
} from 'shared';

export type { ChatAttachment, ChatMode };

export type ChatTurnBody = {
  message: string;
  approved?: boolean;
  requestId?: string;
  chatMode?: ChatMode;
  activeDocumentPath?: string;
  attachments?: ChatAttachment[];
};

export function normalizeChatMode(value: unknown): ChatMode {
  if (value === 'plan' || value === 'write') {
    return value;
  }

  return 'auto';
}

export function normalizeRequestId(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildChatGenerationErrorResponse({
  code,
  message,
  details,
  session,
}: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  session: SessionResponse;
}) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    session,
    pendingProposal: null,
  };
}
