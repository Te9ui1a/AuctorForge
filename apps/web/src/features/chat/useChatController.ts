import { type FormEvent, useMemo, useRef, useState } from 'react';

import { saveChatSession } from './chatSessionApi';
import { deriveChatTurnStrategy, type ChatTurnStrategy } from './chatTurnStrategy';
import { ChatRequestError, useChatStream } from './useChatStream';
import type {
  ChatAttachment,
  ChatMessage,
  ChatSessionRequest,
  ProgressResponse,
  SessionResponse,
  WriteTargetHint,
} from '../workflow/types';

export function useChatController({
  activeProjectId,
  defaultGreeting,
  documentPath,
  documentPathRef,
  progress,
  refreshSession,
  session,
  setUiError,
  streamEnabled,
  writeTargetHint,
}: {
  activeProjectId?: string | null;
  defaultGreeting: ChatMessage;
  documentPath: string;
  documentPathRef: { current: string };
  progress: ProgressResponse | null;
  refreshSession: (options?: { preserveDocument?: boolean; ignoreDraftState?: boolean; preferredDocumentPath?: string }) => Promise<boolean>;
  session: SessionResponse | null;
  setUiError: (message: string) => void;
  streamEnabled: boolean;
  writeTargetHint: WriteTargetHint;
}) {
  const [chatInput, setChatInput] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([defaultGreeting]);
  const [chatError, setChatError] = useState('');
  const [chatErrorPayload, setChatErrorPayload] = useState<ChatRequestError['payload'] | null>(null);
  const thinkingStartTimeRef = useRef<number>(0);

  const chatStream = useChatStream({
    activeProjectId,
    streamEnabled,
    onAssistantStart() {
      const duration = Date.now() - thinkingStartTimeRef.current;
      setMessages((current) => [...current, { role: 'assistant', content: '', thinkingDuration: duration }]);
    },
    onAssistantChunk(chunk) {
      setMessages((current) => {
        const next = [...current];
        const lastMessage = next[next.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          next[next.length - 1] = {
            ...lastMessage,
            content: `${lastMessage.content}${chunk}`,
          };
        }
        return next;
      });
    },
  });

  const composerTurnStrategy = useMemo<ChatTurnStrategy | null>(() => {
    const trimmedInput = chatInput.trim();
    if (trimmedInput.length === 0) {
      return null;
    }

    return deriveChatTurnStrategy({
      message: trimmedInput,
      session: progress?.session ?? session,
      writeTargetHint,
    });
  }, [chatInput, progress?.session, session, writeTargetHint]);

  const canContinueDiscussion = Boolean(chatErrorPayload?.code?.startsWith('proposal-') && chatInput.trim().length > 0);

  function deriveRequestStrategy(message: string, options?: { forceDiscussion?: boolean }): ChatTurnStrategy {
    return deriveChatTurnStrategy({
      forceDiscussion: options?.forceDiscussion,
      message,
      session: progress?.session ?? session,
      writeTargetHint,
    });
  }

  function persistChatSession(request: ChatSessionRequest) {
    return saveChatSession(request, documentPathRef.current || undefined, activeProjectId);
  }

  function persistChatMessages(nextMessages: ChatMessage[]) {
    return persistChatSession({
      messages: nextMessages,
    });
  }

  async function submitMessage(message: string, options?: { baseMessagesOverride?: ChatMessage[]; forceDiscussion?: boolean }) {
    if (message.length === 0 || chatStream.isStreaming || isSendingChat) {
      return;
    }

    const baseMessages = options?.baseMessagesOverride ?? messages;
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      attachments: chatAttachments.map((attachment) => ({ name: attachment.name })),
    };
    const requestStrategy = deriveRequestStrategy(message, { forceDiscussion: options?.forceDiscussion });

    setMessages((current) => [...current, userMessage]);
    setChatInput('');

    try {
      setIsSendingChat(true);
      thinkingStartTimeRef.current = Date.now();
      const beforeCount = baseMessages.length;
      const currentMessages = [...baseMessages, userMessage];

      const data = await chatStream.send(
        message,
        requestStrategy.treatAsApproval,
        chatAttachments,
        documentPath || undefined,
        requestStrategy.requestMode,
      );
      const duration = Date.now() - thinkingStartTimeRef.current;
      const assistantMessage: ChatMessage = { role: 'assistant', content: data.reply, thinkingDuration: duration };

      setMessages((current) => {
        const hasStreamedAssistant = current.length > beforeCount + 1 && current[current.length - 1]?.role === 'assistant';
        if (hasStreamedAssistant) {
          return current.map((item, index) =>
            index === current.length - 1
              ? { ...item, content: data.reply }
              : item,
          );
        }

        return [...current, assistantMessage];
      });

      persistChatMessages([...currentMessages, assistantMessage]).catch(() => {});

      setChatAttachments([]);
      setUiError('');
      setChatError('');
      setChatErrorPayload(null);
      await refreshSession({ preserveDocument: true });
    } catch (error) {
      const errorMessage = error instanceof ChatRequestError ? error.message : '聊天失败，请稍后重试。';
      if (error instanceof ChatRequestError) {
        setUiError('');
      } else {
        setUiError(errorMessage);
      }
      setChatError(errorMessage);
      setChatErrorPayload(error instanceof ChatRequestError ? error.payload ?? null : null);
      setChatInput(message);
      setMessages(baseMessages);
    } finally {
      setIsSendingChat(false);
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chatInput.trim().length === 0) {
      return;
    }

    await submitMessage(chatInput.trim());
  }

  function handleRetryChat() {
    if (!chatInput) return;
    void submitMessage(chatInput);
  }

  function handleContinueDiscussion() {
    if (!chatInput.trim()) {
      return;
    }

    void submitMessage(chatInput.trim(), { forceDiscussion: true });
  }

  async function handleQuickMode(mode: 'guide' | 'analyze', baseMessagesOverride?: ChatMessage[]) {
    const presets = {
      guide: 'guide',
      analyze: 'analyze',
    } as const;

    await submitMessage(presets[mode], { baseMessagesOverride });
  }

  async function handlePickFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    try {
      const supportedFiles = Array.from(fileList).slice(0, 4);
      const parsed = await Promise.all(
        supportedFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          textContent: await file.text(),
        })),
      );
      const invalid = parsed.find((file) => file.size > 200_000 || !/(text|json|markdown|yaml|csv)/i.test(file.mimeType) && !/\.(md|txt|json|csv|ya?ml|ts|tsx|js|jsx|py|html|css)$/i.test(file.name));
      if (invalid) {
        setUiError('仅支持较小的文本类文件（如 .md、.txt、.json、.csv、代码文件）。');
        return;
      }
      setChatAttachments((current) => [...current, ...parsed]);
      setUiError('');
    } catch {
      setUiError('读取附件失败，请检查文件是否为可读文本。');
    }
  }

  function handleRemoveAttachment(name: string) {
    setChatAttachments((current) => current.filter((item) => item.name !== name));
  }

  return {
    assistantStatus: chatStream.isStreaming ? 'streaming' as const : isSendingChat ? 'thinking' as const : 'idle' as const,
    canContinueDiscussion,
    chatAttachments,
    chatError,
    chatErrorPayload,
    chatInput,
    composerTurnStrategy,
    handleChatSubmit,
    handleContinueDiscussion,
    handlePickFiles,
    handleQuickMode,
    handleRemoveAttachment,
    handleRetryChat,
    isBusy: chatStream.isStreaming || isSendingChat,
    isSendingChat,
    messages,
    persistChatMessages,
    setChatAttachments,
    setChatError,
    setChatErrorPayload,
    setChatInput,
    setMessages,
  };
}
