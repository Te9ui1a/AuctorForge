import type { ChatMessage, ChatSessionRequest, ChatSessionResponse, WriteTargetHint } from '../workflow/types';
import { buildProjectScopedHeaders, ensureOk } from '../api/apiClient';

const EMPTY_WRITE_TARGET_HINT: WriteTargetHint = {
  strictWorkflowWrites: [],
  chatAllowedWrites: [],
  activeDocumentPath: null,
  hasPendingProposal: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeWriteTargetHint(value: unknown): WriteTargetHint {
  if (!isRecord(value)) {
    return EMPTY_WRITE_TARGET_HINT;
  }

  return {
    strictWorkflowWrites: readStringArray(value.strictWorkflowWrites),
    chatAllowedWrites: readStringArray(value.chatAllowedWrites),
    activeDocumentPath: typeof value.activeDocumentPath === 'string' ? value.activeDocumentPath : null,
    hasPendingProposal: value.hasPendingProposal === true,
  };
}

function normalizeChatMessages(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is ChatMessage => isRecord(item) && typeof item.role === 'string' && typeof item.content === 'string') : [];
}

function normalizeChatSessionResponse(value: unknown): ChatSessionResponse {
  if (Array.isArray(value)) {
    return {
      messages: normalizeChatMessages(value),
      writeTargetHint: EMPTY_WRITE_TARGET_HINT,
    };
  }

  if (!isRecord(value)) {
    return {
      messages: [],
      writeTargetHint: EMPTY_WRITE_TARGET_HINT,
    };
  }

  return {
    messages: normalizeChatMessages(value.messages),
    writeTargetHint: normalizeWriteTargetHint(value.writeTargetHint),
  };
}

function normalizeChatSessionRequest(request: ChatSessionRequest): ChatSessionRequest {
  if (!Array.isArray(request.messages)) {
    return {};
  }

  return {
    messages: normalizeChatMessages(request.messages),
  };
}

function buildChatSessionHeaders(activeDocumentPath?: string, includeJson = false, activeProjectId?: string | null) {
  const headers: Record<string, string> = includeJson ? { 'Content-Type': 'application/json' } : {};

  if (activeDocumentPath) {
    headers['x-active-document-path'] = encodeURIComponent(activeDocumentPath);
  }

  return buildProjectScopedHeaders(headers, activeProjectId);
}

export async function loadChatSession(activeDocumentPath?: string, activeProjectId?: string | null): Promise<ChatSessionResponse> {
  const response = await fetch('/api/chat/session', {
    headers: buildChatSessionHeaders(activeDocumentPath, false, activeProjectId),
  });
  await ensureOk(response, 'Failed to load chat session');

  return normalizeChatSessionResponse(await response.json());
}

export async function saveChatSession(request: ChatSessionRequest, activeDocumentPath?: string, activeProjectId?: string | null): Promise<ChatSessionResponse> {
  const response = await fetch('/api/chat/session', {
    method: 'PUT',
    headers: buildChatSessionHeaders(activeDocumentPath, true, activeProjectId),
    body: JSON.stringify(normalizeChatSessionRequest(request)),
  });
  await ensureOk(response, 'Failed to save chat session');

  return normalizeChatSessionResponse(await response.json());
}
