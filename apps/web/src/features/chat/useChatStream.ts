import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatAttachment, ChatErrorPayload, ChatMode, ChatRequest, ChatResponse, ProposalAction } from '../workflow/types';
import { buildProjectScopedHeaders, readApiError } from '../api/apiClient';

type StreamResult = ChatResponse;

const STREAM_PARTIAL_ERROR = 'STREAM_PARTIAL_ERROR';
export const DEFAULT_CHAT_REQUEST_TIMEOUT_MS = 310_000;
const CHAT_PROGRESS_TICK_MS = 1_000;

export type ChatGenerationProgressPhase =
  | 'preparing'
  | 'building_prompt'
  | 'calling_model'
  | 'validating'
  | 'snapshotting';

export type ChatGenerationProgressStatus = 'idle' | 'active' | 'error';

export type ChatGenerationProgress = {
  status: ChatGenerationProgressStatus;
  phase: ChatGenerationProgressPhase | null;
  requestId: string | null;
  elapsedMs: number;
  lastEventAgeMs: number | null;
  errorMessage?: string;
};

const CHAT_GENERATION_PROGRESS_PHASES: ReadonlySet<string> = new Set([
  'preparing',
  'building_prompt',
  'calling_model',
  'validating',
  'snapshotting',
]);

type UseChatStreamOptions = {
  activeProjectId?: string | null;
  onAssistantStart: () => void;
  onAssistantChunk: (chunk: string) => void;
  requestTimeoutMs?: number;
  streamEnabled: boolean;
};

export class ChatRequestError extends Error {
  readonly payload?: ChatErrorPayload;

  constructor(message: string, payload?: ChatErrorPayload) {
    super(message);
    this.name = 'ChatRequestError';
    this.payload = payload;
  }
}

async function readChatRequestError(response: Response, fallbackMessage: string) {
  const error = await readApiError(response, fallbackMessage);
  const payload = error.payload?.message
    ? {
        code: error.payload.code ?? 'chat-request-failed',
        message: error.payload.message,
        details: error.payload.details,
      } satisfies ChatErrorPayload
    : undefined;

  return new ChatRequestError(error.message, payload);
}

function createChatRequestId() {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  return `chat-turn-${randomId}`;
}

function buildRequestBody(message: string, approved: boolean, attachments: ChatAttachment[], activeDocumentPath: string | undefined, chatMode: ChatMode | undefined, requestId: string, proposalAction?: ProposalAction): ChatRequest {
  return { message, approved, requestId, attachments, activeDocumentPath, chatMode, proposalAction };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createInitialChatGenerationProgress(): ChatGenerationProgress {
  return {
    status: 'idle',
    phase: null,
    requestId: null,
    elapsedMs: 0,
    lastEventAgeMs: null,
  };
}

function isChatGenerationProgressPhase(value: unknown): value is ChatGenerationProgressPhase {
  return typeof value === 'string' && CHAT_GENERATION_PROGRESS_PHASES.has(value);
}

function readProgressEvent(data: string) {
  try {
    const payload = JSON.parse(data) as unknown;
    if (!isRecord(payload)) {
      return null;
    }

    return {
      phase: isChatGenerationProgressPhase(payload.phase) ? payload.phase : undefined,
      requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
    };
  } catch {
    return null;
  }
}

function readElapsedMs(startedAt: number | null, now = Date.now()) {
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

function readLastEventAgeMs(lastEventAt: number | null, now = Date.now()) {
  return lastEventAt === null ? null : Math.max(0, now - lastEventAt);
}

function readStreamError(data: string) {
  try {
    const payload = JSON.parse(data) as unknown;
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const message = typeof error?.message === 'string' && error.message.trim().length > 0
      ? error.message
      : '聊天失败，请稍后重试。';
    const chatPayload: ChatErrorPayload | undefined = error
      ? {
          code: typeof error.code === 'string' ? error.code : 'chat-request-failed',
          message,
          details: isRecord(error.details) ? error.details : undefined,
        }
      : undefined;

    return new ChatRequestError(message, chatPayload);
  } catch {
    return new ChatRequestError('聊天失败，请稍后重试。');
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const timeout = createRequestTimeout(timeoutMs);

  try {
    return await withRequestTimeout(fetch(input, { ...init, signal: timeout.signal }), timeout);
  } finally {
    timeout.clear();
  }
}

function createRequestTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const abortTimeout = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let rejectTimeout: number;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectTimeout = window.setTimeout(() => {
      reject(new Error('chat request timed out'));
    }, timeoutMs);
  });

  return {
    signal: controller.signal,
    timeoutPromise,
    clear() {
      window.clearTimeout(abortTimeout);
      window.clearTimeout(rejectTimeout);
    },
  };
}

async function withRequestTimeout<T>(
  promise: Promise<T>,
  timeout: ReturnType<typeof createRequestTimeout>,
) {
  return await Promise.race([promise, timeout.timeoutPromise]);
}

export function useChatStream({ activeProjectId, onAssistantStart, onAssistantChunk, requestTimeoutMs = DEFAULT_CHAT_REQUEST_TIMEOUT_MS, streamEnabled }: UseChatStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState<ChatGenerationProgress>(() => createInitialChatGenerationProgress());
  const progressStartedAtRef = useRef<number | null>(null);
  const progressLastEventAtRef = useRef<number | null>(null);

  const refreshProgressTiming = useCallback(() => {
    const now = Date.now();
    setProgress((current) => ({
      ...current,
      elapsedMs: readElapsedMs(progressStartedAtRef.current, now),
      lastEventAgeMs: readLastEventAgeMs(progressLastEventAtRef.current, now),
    }));
  }, []);

  const startProgress = useCallback((requestId: string) => {
    const now = Date.now();
    progressStartedAtRef.current = now;
    progressLastEventAtRef.current = null;
    setProgress({
      status: 'active',
      phase: 'preparing',
      requestId,
      elapsedMs: 0,
      lastEventAgeMs: null,
    });
  }, []);

  const markProgressEvent = useCallback((eventProgress: ReturnType<typeof readProgressEvent>) => {
    if (eventProgress === null) {
      return;
    }

    const now = Date.now();
    progressLastEventAtRef.current = now;
    setProgress((current) => ({
      ...current,
      status: current.status === 'error' ? current.status : 'active',
      phase: eventProgress.phase ?? current.phase,
      requestId: eventProgress.requestId ?? current.requestId,
      elapsedMs: readElapsedMs(progressStartedAtRef.current, now),
      lastEventAgeMs: 0,
    }));
  }, []);

  const finishProgress = useCallback((status: ChatGenerationProgressStatus, errorMessage?: string) => {
    const now = Date.now();
    setProgress((current) => ({
      ...current,
      status,
      elapsedMs: readElapsedMs(progressStartedAtRef.current, now),
      lastEventAgeMs: readLastEventAgeMs(progressLastEventAtRef.current, now),
      ...(errorMessage ? { errorMessage } : { errorMessage: undefined }),
    }));
  }, []);

  useEffect(() => {
    if (progress.status !== 'active') {
      return undefined;
    }

    const interval = window.setInterval(refreshProgressTiming, CHAT_PROGRESS_TICK_MS);
    return () => window.clearInterval(interval);
  }, [progress.status, refreshProgressTiming]);

  const send = useCallback(async (message: string, approved: boolean, attachments: ChatAttachment[], activeDocumentPath?: string, chatMode?: ChatMode, proposalAction?: ProposalAction): Promise<StreamResult> => {
    const requestId = createChatRequestId();
    startProgress(requestId);

    if (!streamEnabled) {
      try {
        const requestBody = buildRequestBody(message, approved, attachments, activeDocumentPath, chatMode, requestId, proposalAction);
        const response = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: buildProjectScopedHeaders({ 'Content-Type': 'application/json' }, activeProjectId),
          body: JSON.stringify(requestBody),
        }, requestTimeoutMs);
        if (!response.ok) {
          throw await readChatRequestError(response, '聊天失败，请稍后重试。');
        }
        const data = (await response.json()) as StreamResult;
        finishProgress('idle');
        return data;
      } catch (error) {
        finishProgress('error', error instanceof Error ? error.message : '聊天失败，请稍后重试。');
        throw error;
      }
    }

    let sawStreamData = false;

    try {
      const requestBody = buildRequestBody(message, approved, attachments, activeDocumentPath, chatMode, requestId, proposalAction);
      const streamTimeout = createRequestTimeout(requestTimeoutMs);

      try {
        const response = await withRequestTimeout(
          fetch('/api/chat/stream', {
            method: 'POST',
            headers: buildProjectScopedHeaders({ 'Content-Type': 'application/json' }, activeProjectId),
            body: JSON.stringify(requestBody),
            signal: streamTimeout.signal,
          }),
          streamTimeout,
        );

        if (!response.ok || !response.body) {
          throw await readChatRequestError(response, '聊天失败，请稍后重试。');
        }

        setIsStreaming(true);
        onAssistantStart();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: StreamResult | null = null;

        while (true) {
          const { done, value } = await withRequestTimeout(reader.read(), streamTimeout);
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() ?? '';

          for (const block of messages) {
            const eventMatch = block.match(/^event:\s*(.+)$/m);
            const dataMatch = block.match(/^data:\s*([\s\S]+)$/m);
            const event = eventMatch?.[1]?.trim();
            const data = dataMatch?.[1] ?? '';

            if (event === 'token') {
              sawStreamData = true;
              onAssistantChunk(JSON.parse(data) as string);
            }

            if (event === 'ready') {
              progressLastEventAtRef.current = Date.now();
              refreshProgressTiming();
              continue;
            }

            if (event === 'phase' || event === 'heartbeat') {
              markProgressEvent(readProgressEvent(data));
              continue;
            }

            if (event === 'proposal_item') {
              sawStreamData = true;
              progressLastEventAtRef.current = Date.now();
              refreshProgressTiming();
            }

            if (event === 'error') {
              const streamError = readStreamError(data);
              finishProgress('error', streamError.message);
              throw streamError;
            }

            if (event === 'done') {
              sawStreamData = true;
              progressLastEventAtRef.current = Date.now();
              finalResult = JSON.parse(data) as StreamResult;
            }
          }
        }

        setIsStreaming(false);
        if (finalResult) {
          finishProgress('idle');
          return finalResult;
        }

        if (sawStreamData) {
          finishProgress('error', '聊天流已中断，请重试。');
          throw new Error(STREAM_PARTIAL_ERROR);
        }

        throw new Error('stream incomplete');
      } finally {
        streamTimeout.clear();
      }
    } catch (error) {
      if (error instanceof Error && error.message === STREAM_PARTIAL_ERROR) {
        finishProgress('error', '聊天流已中断，请重试。');
        throw error;
      }

      if (sawStreamData) {
        finishProgress('error', '聊天流已中断，请重试。');
        throw new Error(STREAM_PARTIAL_ERROR);
      }

      if (error instanceof ChatRequestError) {
        finishProgress('error', error.message);
        throw error;
      }

      try {
        const requestBody = buildRequestBody(message, approved, attachments, activeDocumentPath, chatMode, requestId, proposalAction);
        const response = await fetchWithTimeout('/api/chat', {
          method: 'POST',
          headers: buildProjectScopedHeaders({ 'Content-Type': 'application/json' }, activeProjectId),
          body: JSON.stringify(requestBody),
        }, requestTimeoutMs);
        if (!response.ok) {
          const requestError = await readChatRequestError(response, '聊天失败，请稍后重试。');
          finishProgress('error', requestError.message);
          throw requestError;
        }
        const data = (await response.json()) as StreamResult;
        finishProgress('idle');
        return data;
      } catch (fallbackError) {
        finishProgress('error', fallbackError instanceof Error ? fallbackError.message : '聊天失败，请稍后重试。');
        throw fallbackError;
      }
    } finally {
      setIsStreaming(false);
    }
  }, [activeProjectId, finishProgress, markProgressEvent, onAssistantChunk, onAssistantStart, refreshProgressTiming, requestTimeoutMs, startProgress, streamEnabled]);

  return {
    isStreaming,
    progress,
    send,
  };
}
