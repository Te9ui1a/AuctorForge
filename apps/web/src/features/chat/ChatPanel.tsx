import { type ComponentPropsWithoutRef, type FormEvent, useLayoutEffect, useRef, useState } from 'react';
import { Check, MessageSquareText, Paperclip, Pencil, RefreshCcw, SendHorizontal, Settings2, Undo2, X } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import type { ChatTurnStrategy } from './chatTurnStrategy';
import type { ChatAttachment, ChatMessage, PendingProposal, ProposalAction, WriteTargetHint } from '../workflow/types';

type MessageKeySlot = {
  key: string;
  role: ChatMessage['role'];
  content: string;
  attachmentsSignature: string;
  thinkingDuration?: number;
};

type AttachmentLike = {
  name: string;
  mimeType?: string;
  size?: number;
  textContent?: string;
};

function buildAttachmentIdentity(attachment: AttachmentLike) {
  return [attachment.name, attachment.mimeType ?? '', attachment.size ?? '', attachment.textContent ?? ''].join('\u0000');
}

function buildAttachmentsSignature(message: ChatMessage) {
  return message.attachments?.map((attachment) => buildAttachmentIdentity(attachment)).join('\u0001') ?? '';
}

function canReuseAssistantContinuation(slot: MessageKeySlot, message: ChatMessage) {
  if (slot.role !== 'assistant' || message.role !== 'assistant') {
    return false;
  }

  if (slot.attachmentsSignature !== buildAttachmentsSignature(message)) {
    return false;
  }

  if (slot.thinkingDuration !== message.thinkingDuration) {
    return false;
  }

  return slot.content.startsWith(message.content) || message.content.startsWith(slot.content);
}

type ChatPanelProps = {
  messages: ChatMessage[];
  chatInput: string;
  assistantStatus: 'idle' | 'thinking' | 'streaming';
  isBusy?: boolean;
  onChangeInput: (value: string) => void;
  onSubmit: NonNullable<ComponentPropsWithoutRef<'form'>['onSubmit']>;
  attachments: ChatAttachment[];
  onPickFiles: (fileList: FileList | null) => void;
  onRemoveAttachment: (name: string) => void;
  turnStrategy?: ChatTurnStrategy | null;
  onContinueDiscussion?: () => void;
  chatError?: string;
  writeTargetHint?: WriteTargetHint;
  proposalTargets?: PendingProposal['proposedWrites'];
  onRetryChat?: () => void;
  onOpenSettings?: () => void;
  pendingProposal?: PendingProposal | null;
  onProposalAction?: (action: ProposalAction) => void;
};

type ProposalDecision = 'approve' | 'revise' | 'discard' | null;

export function ChatPanel({
  messages,
  chatInput,
  assistantStatus,
  isBusy = false,
  onChangeInput,
  onSubmit,
  attachments,
  onPickFiles,
  onRemoveAttachment,
  turnStrategy,
  onContinueDiscussion,
  chatError,
  writeTargetHint,
  proposalTargets = [],
  onRetryChat,
  onOpenSettings,
  pendingProposal,
  onProposalAction,
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageKeySlotsRef = useRef<MessageKeySlot[]>([]);
  const nextMessageSlotKeyRef = useRef(0);
  const [proposalDecision, setProposalDecision] = useState<ProposalDecision>(null);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }

    const currentValue = chatInput;
    if (element.value !== currentValue) {
      return;
    }

    const minHeight = 88;
    const maxHeight = Math.floor(window.innerHeight * 0.25);
    element.style.height = 'auto';
    const measuredHeight = element.scrollHeight || element.clientHeight || element.offsetHeight;
    const fallbackLineCount = Math.max(
      currentValue.split('\n').length,
      Math.ceil(currentValue.length / 24) || 1,
    );
    const fallbackHeight = 40 + fallbackLineCount * 24;
    const nextHeight = Math.min(Math.max(measuredHeight, fallbackHeight, minHeight), maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = Math.max(measuredHeight, fallbackHeight) > maxHeight ? 'auto' : 'hidden';
  }, [chatInput]);

  const hasPendingProposal = Boolean(writeTargetHint?.hasPendingProposal);
  const canSubmitMessage = chatInput.trim().length > 0 || attachments.length > 0;
  const normalizedProposalWrites = pendingProposal?.proposedWrites ?? proposalTargets;
  const proposalTargetPath = hasPendingProposal ? normalizedProposalWrites[0]?.path ?? '' : '';
  const activeWritingPath = proposalTargetPath
    || writeTargetHint?.activeDocumentPath
    || writeTargetHint?.strictWorkflowWrites[0]
    || writeTargetHint?.chatAllowedWrites[0]
    || '';
  const activeWritingLabel = activeWritingPath ? activeWritingPath.split('/').pop() ?? activeWritingPath : '当前稿件';
  const hasActiveDocument = activeWritingPath.length > 0;
  const proposalTargetLabel = pendingProposal?.title
    ?? (proposalTargetPath ? proposalTargetPath.split('/').pop() ?? proposalTargetPath : '当前提案');
  const chatContextState = hasPendingProposal
    ? 'proposal-pending'
    : activeWritingPath
      ? 'document-attached'
      : 'general';

  let writeHintText = '';
  if (turnStrategy?.showsWriteTargetHint && writeTargetHint) {
    if (writeTargetHint.hasPendingProposal) {
      writeHintText = '当前有未处理的写入提案，请先确认或拒绝。';
    } else if (writeTargetHint.activeDocumentPath) {
      writeHintText = `将写入: ${writeTargetHint.activeDocumentPath.split('/').pop()}`;
    } else if (writeTargetHint.strictWorkflowWrites.length > 0) {
      writeHintText = `将写入: ${writeTargetHint.strictWorkflowWrites[0].split('/').pop()}`;
    } else if (writeTargetHint.chatAllowedWrites.length > 0) {
      writeHintText = `将写入: ${writeTargetHint.chatAllowedWrites[0].split('/').pop()}`;
    } else {
      writeHintText = '当前没有可写入的文档。';
    }
  }

  const headerContextText = hasPendingProposal || !hasActiveDocument ? '' : activeWritingLabel;
  const proposalNoticeText = hasPendingProposal
    ? `待确认提案${pendingProposal?.version ? ` v${pendingProposal.version}` : ''}：${proposalTargetLabel} · 尚未写入`
    : '';
  const composerAdvisoryText = hasPendingProposal
    ? '先确认当前提案，再继续推进。'
    : turnStrategy?.showsWriteTargetHint && writeHintText
      ? writeHintText
      : turnStrategy?.hintText ?? '';

  let lastAssistantMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      lastAssistantMessageIndex = index;
      break;
    }
  }

  const previousMessageKeySlots = messageKeySlotsRef.current;
  const usedPreviousSlotIndexes = new Set<number>();
  const currentMessageKeySlots = messages.map((message, index) => {
    const attachmentsSignature = buildAttachmentsSignature(message);
    let matchingSlotIndex = previousMessageKeySlots.findIndex(
      (slot, slotIndex) => !usedPreviousSlotIndexes.has(slotIndex)
        && slot.role === message.role
        && slot.content === message.content
        && slot.attachmentsSignature === attachmentsSignature
        && slot.thinkingDuration === message.thinkingDuration,
    );

    if (matchingSlotIndex === -1 && index === lastAssistantMessageIndex) {
      matchingSlotIndex = previousMessageKeySlots.findIndex(
        (slot, slotIndex) => !usedPreviousSlotIndexes.has(slotIndex) && canReuseAssistantContinuation(slot, message),
      );
    }

    const key = matchingSlotIndex === -1
      ? `chat-message-${nextMessageSlotKeyRef.current++}`
      : previousMessageKeySlots[matchingSlotIndex].key;

    if (matchingSlotIndex !== -1) {
      usedPreviousSlotIndexes.add(matchingSlotIndex);
    }

    return {
      key,
      role: message.role,
      content: message.content,
      attachmentsSignature,
      thinkingDuration: message.thinkingDuration,
    } satisfies MessageKeySlot;
  });

  messageKeySlotsRef.current = currentMessageKeySlots;

  function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    if (hasPendingProposal && pendingProposal?.id) {
      if (isApprovalIntent(chatInput)) {
        event.preventDefault();
        setProposalDecision('approve');
        return;
      }

      if (isDiscardIntent(chatInput)) {
        event.preventDefault();
        setProposalDecision('discard');
        return;
      }

      if (isRevisionIntent(chatInput)) {
        event.preventDefault();
        setProposalDecision('revise');
        return;
      }
    }

    onSubmit(event);
  }

  const proposalFileCount = normalizedProposalWrites.length;
  const proposalFileCountLabel = `${proposalFileCount} 个文件`;
  const shouldShowProposalFileCount = proposalFileCount > 0 && !proposalTargetLabel.includes(proposalFileCountLabel);
  const confirmWriteLabel = proposalFileCount > 1 ? `确认写入 ${proposalFileCount} 个文件` : '确认写入当前提案';
  const canSubmitRevision = chatInput.trim().length > 0;

  function renderProposalDecisionInline() {
    if (!pendingProposal?.id || proposalDecision === null) {
      return null;
    }

    if (proposalDecision === 'approve') {
      return (
        <div
          role="group"
          aria-label="确认写入提案？"
          className="mt-2 space-y-2 rounded-[var(--radius-sm)] border border-[color:var(--ui-assistant-chip-border)] bg-[color:var(--ui-assistant-chip-surface)] px-3 py-2 text-xs text-foreground"
          data-chat-surface="proposal-decision-inline"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <strong className="text-xs font-semibold text-foreground">确认写入提案？</strong>
            <span>{proposalTargetLabel}</span>
            {shouldShowProposalFileCount ? <span>{proposalFileCountLabel}</span> : null}
          </div>
          <p className="m-0 leading-5 text-muted-foreground">
            提案 v{pendingProposal.version ?? 1}，尚未写入
          </p>
          {pendingProposal.transitionPreview?.afterApproveLabel ? (
            <p className="m-0 leading-5 text-muted-foreground">
              确认后进入：{pendingProposal.transitionPreview.afterApproveLabel}
            </p>
          ) : null}
          {proposalFileCount > 1 ? (
            <ul className="m-0 space-y-1 pl-4 leading-5 text-muted-foreground">
              {normalizedProposalWrites.map((write) => (
                <li key={write.path}>{write.path}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  aria-label={confirmWriteLabel}
                  className="h-8 w-8 rounded-[var(--radius-sm)] shadow-none"
                  onClick={() => {
                    onProposalAction?.({
                      type: 'approve',
                      proposalId: pendingProposal.id!,
                    });
                    setProposalDecision(null);
                  }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{confirmWriteLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="返回查看提案"
                  className="h-8 w-8 rounded-[var(--radius-sm)]"
                  onClick={() => setProposalDecision(null)}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>返回查看提案</TooltipContent>
            </Tooltip>
          </div>
        </div>
      );
    }

    if (proposalDecision === 'revise') {
      return (
        <div
          role="group"
          aria-label="修改当前提案？"
          className="mt-2 space-y-2 rounded-[var(--radius-sm)] border border-[color:var(--ui-assistant-chip-border)] bg-[color:var(--ui-assistant-chip-surface)] px-3 py-2 text-xs text-foreground"
          data-chat-surface="proposal-decision-inline"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <strong className="text-xs font-semibold text-foreground">修改当前提案？</strong>
            <span>{proposalTargetLabel}</span>
          </div>
          <p className="m-0 leading-5 text-muted-foreground">
            当前提案 v{pendingProposal.version ?? 1} 不会写入。
          </p>
          <p className="m-0 leading-5 text-muted-foreground">
            {canSubmitRevision ? '将根据输入框中的修改意见生成新版提案。' : '先在输入框写修改意见。'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {canSubmitRevision ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    aria-label="生成新版提案"
                    className="h-8 w-8 rounded-[var(--radius-sm)] shadow-none"
                    onClick={() => {
                      onProposalAction?.({
                        type: 'revise',
                        proposalId: pendingProposal.id!,
                        instructions: chatInput.trim(),
                      });
                      setProposalDecision(null);
                    }}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>生成新版提案</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="继续编辑修改意见"
                  className="h-8 w-8 rounded-[var(--radius-sm)]"
                  onClick={() => setProposalDecision(null)}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>继续编辑</TooltipContent>
            </Tooltip>
          </div>
        </div>
      );
    }

    return (
      <div
        role="group"
        aria-label="放弃当前提案？"
        className="mt-2 space-y-2 rounded-[var(--radius-sm)] border border-[color:var(--ui-assistant-chip-border)] bg-[color:var(--ui-assistant-chip-surface)] px-3 py-2 text-xs text-foreground"
        data-chat-surface="proposal-decision-inline"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <strong className="text-xs font-semibold text-foreground">放弃当前提案？</strong>
          <span>{proposalTargetLabel}</span>
        </div>
        <p className="m-0 leading-5 text-muted-foreground">项目文件不会变化。</p>
        <p className="m-0 leading-5 text-muted-foreground">放弃后可以继续对话并重新生成提案。</p>
        <div className="flex flex-wrap gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                aria-label="确认放弃提案"
                className="h-8 w-8 rounded-[var(--radius-sm)] shadow-none"
                onClick={() => {
                  onProposalAction?.({
                    type: 'discard',
                    proposalId: pendingProposal.id!,
                  });
                  setProposalDecision(null);
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>确认放弃提案</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="保留提案"
                className="h-8 w-8 rounded-[var(--radius-sm)]"
                onClick={() => setProposalDecision(null)}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>保留提案</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  function renderProposalActionsForMessage(index: number, role: ChatMessage['role']) {
    if (role !== 'assistant' || index !== lastAssistantMessageIndex || !hasPendingProposal || !pendingProposal?.id) {
      return null;
    }

    return (
      <div
        role="group"
        aria-label="当前提案操作"
        className="mt-3 max-w-full space-y-2 rounded-[var(--radius-sm)] border border-[color:var(--ui-assistant-chip-border)] bg-[color:var(--ui-assistant-chip-surface)] px-3 py-2"
        data-chat-surface="proposal-message-actions"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs leading-5 text-muted-foreground">
            待确认提案 v{pendingProposal.version ?? 1} · {proposalTargetLabel}
            {shouldShowProposalFileCount ? ` · ${proposalFileCountLabel}` : ''}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="确认写入提案"
                  disabled={isBusy}
                  className="h-7 w-7 rounded-[var(--radius-sm)] shadow-none"
                  onClick={() => setProposalDecision('approve')}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>确认写入</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="修改提案"
                  disabled={isBusy}
                  className="h-7 w-7 rounded-[var(--radius-sm)] shadow-none"
                  onClick={() => setProposalDecision('revise')}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>修改提案</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="放弃提案"
                  disabled={isBusy}
                  className="h-7 w-7 rounded-[var(--radius-sm)] shadow-none"
                  onClick={() => setProposalDecision('discard')}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>放弃提案</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {renderProposalDecisionInline()}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        className="chat-dock flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--ui-surface-border)] bg-[image:var(--ui-surface-background)] text-[color:var(--ui-surface-foreground)] shadow-[var(--ui-surface-shadow)]"
        aria-label="创作助手对话区"
        data-ui-surface="chat-panel"
        data-chat-layout="docked"
        data-chat-tone="collaborator-dock"
        data-chat-density="docked-quiet"
        data-chat-frame="integrated-dock"
        data-chat-relationship="manuscript-attached"
        data-chat-shell-link="continuity-band"
        data-chat-context-state={chatContextState}
      >
        <div
          className="px-4 pb-2 pt-4"
          data-chat-surface="dock-header"
          data-chat-shell-link="continuity-band"
        >
          <div className="min-w-0 space-y-1.5" data-chat-header="quiet-manuscript">
            <div className="flex min-w-0 items-center justify-between gap-3" data-chat-surface="header-row">
              <h1 className="text-[17px] font-semibold tracking-[0.02em] text-foreground">创作助手</h1>
              {headerContextText ? (
                <span
                  className="truncate text-xs leading-5 text-[color:var(--ui-assistant-muted)]"
                  data-chat-surface="context-inline"
                  data-testid="chat-context-inline"
                >
                  {headerContextText}
                </span>
              ) : null}
            </div>
            {proposalNoticeText ? (
              <p
                className="text-xs leading-5 text-[color:var(--ui-assistant-context-foreground)]"
                data-chat-surface="proposal-notice"
                data-testid="chat-proposal-notice"
              >
                {proposalNoticeText}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="chat-dock-log flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" data-chat-surface="log">
            {messages.map((message, index) => (
              <article
                key={currentMessageKeySlots[index]?.key}
                className={message.role === 'assistant'
                  ? 'chat-message chat-message--assistant max-w-full space-y-2 pl-4'
                  : 'chat-message chat-message--user ml-auto max-w-[94%] space-y-2 pl-4 text-foreground'}
                data-chat-message-role={message.role}
                data-chat-message-flow={messages[index - 1]?.role === message.role ? 'continuation' : 'turn-start'}
                data-chat-message-motion="enter"
              >
                <strong className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-assistant-caption)]">
                  {message.role === 'assistant' ? '创作助手' : '你'}
                </strong>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground" data-chat-surface="message-content">{message.content}</p>
                {message.attachments?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <Badge key={buildAttachmentIdentity(attachment)} variant="muted" className="chat-message-attachment rounded-[var(--radius-sm)] border-[color:var(--ui-assistant-chip-border)] bg-[color:var(--ui-assistant-chip-surface)] px-2.5 py-1 text-[11px] normal-case tracking-[0.04em] text-[color:var(--ui-assistant-chip-foreground)] shadow-none">
                        {attachment.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {message.role === 'assistant' && message.thinkingDuration !== undefined && index === lastAssistantMessageIndex && assistantStatus === 'idle' ? (
                  <div className="text-xs text-muted-foreground">
                    <span>思考 {(message.thinkingDuration / 1000).toFixed(1)}s</span>
                  </div>
                ) : null}
                {renderProposalActionsForMessage(index, message.role)}
              </article>
            ))}
            {assistantStatus === 'thinking' ? (
              <div className="flex items-center justify-center py-2" data-chat-surface="thinking-indicator">
                <div
                  className="chat-thinking-indicator inline-flex items-center gap-1.5 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--ui-assistant-thinking-border)] bg-[color:var(--ui-assistant-thinking-surface)] px-3 py-1.5"
                  role="status"
                  aria-label="正在构思回复"
                  data-chat-motion-state="thinking"
                >
                  <span className="h-2 w-2 rounded-full bg-primary/70" data-chat-motion-dot />
                  <span className="h-2 w-2 rounded-full bg-primary/50" data-chat-motion-dot />
                  <span className="h-2 w-2 rounded-full bg-primary/30" data-chat-motion-dot />
                  <span aria-hidden="true" data-chat-motion-sweep />
                </div>
              </div>
            ) : null}
            {assistantStatus === 'streaming' ? (
              <div
                className="chat-streaming-indicator text-sm text-muted-foreground"
                data-chat-surface="streaming-indicator"
                data-chat-motion-state="streaming"
                role="status"
                aria-label="正在输出回复"
              >
                <span>正在输出回复</span>
                <span aria-hidden="true" data-chat-motion-line />
              </div>
            ) : null}
          </div>

          <form
            className="chat-composer-shell border-t border-[color:var(--ui-assistant-divider)] bg-[image:var(--ui-assistant-composer-surface)] px-4 pb-4 pt-3"
            data-chat-surface="composer-shell"
            onSubmit={handleComposerSubmit}
          >
            <div className="space-y-3" data-chat-surface="composer">
              {attachments.length > 0 ? (
                <div className="chat-attachment-strip space-y-2 rounded-[var(--radius-md)] border border-[color:var(--ui-assistant-chip-border)] bg-[color:var(--ui-assistant-chip-surface)] px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ui-assistant-caption)]">参考附件</div>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((attachment) => (
                      <Badge
                        key={buildAttachmentIdentity(attachment)}
                        variant="muted"
                        className="chat-attachment-chip group flex items-center gap-1.5 rounded-[var(--radius-sm)] border-[color:var(--ui-assistant-chip-border)] bg-[color:var(--ui-assistant-chip-surface)] px-2.5 py-1 text-[11px] normal-case tracking-[0.04em] text-[color:var(--ui-assistant-chip-foreground)] shadow-none"
                      >
                        <span>{attachment.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`移除附件 ${attachment.name}`}
                          data-chat-surface="attachment-remove"
                          className="h-5 w-5 rounded-[var(--radius-sm)] p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => onRemoveAttachment(attachment.name)}
                        >
                          ×
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                data-chat-surface="file-input"
                onChange={(event) => {
                  onPickFiles(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
              <div
                className="chat-composer-frame rounded-[var(--radius-md)] border border-[color:var(--ui-assistant-field-border)] bg-[color:var(--ui-assistant-field-surface)] px-3 py-3"
                data-chat-surface="composer-frame"
                data-testid="chat-composer-frame"
              >
                <Textarea
                  ref={textareaRef}
                  aria-label="聊天输入框"
                  data-chat-surface="input"
                  value={chatInput}
                  disabled={isBusy}
                  onChange={(event) => onChangeInput(event.target.value)}
                  placeholder="输入你的想法或指令，例如：继续，或者讨论接下来的剧情"
                  className="resize-none rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-6 text-[color:var(--ui-assistant-field-foreground)] shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex items-center justify-between gap-2 pt-2" data-chat-surface="composer-actions">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="添加文件"
                        data-chat-surface="attachment-trigger"
                        className="h-8 w-8 rounded-[var(--radius-sm)] shadow-none"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>附加资料、设定或参考片段</TooltipContent>
                  </Tooltip>
                  <Button
                    type="submit"
                    aria-label="发送"
                    size="icon"
                    disabled={isBusy || !canSubmitMessage}
                    className="h-8 w-8 rounded-[var(--radius-sm)] shadow-none"
                  >
                    <SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {composerAdvisoryText ? (
                <p className="m-0 max-w-[30ch] text-xs leading-5 text-[color:var(--ui-assistant-muted)]" data-chat-surface="composer-advisory">
                  {composerAdvisoryText}
                </p>
              ) : null}
              {chatError ? (
                <div
                  className="space-y-3 rounded-[var(--radius-md)] border border-destructive/20 bg-destructive/[0.08] p-3 text-sm text-destructive-foreground"
                  data-chat-surface="error-banner"
                >
                  <div>{chatError}</div>
                  <div className="flex flex-wrap gap-2" data-chat-surface="error-actions">
                    {onRetryChat ? (
                      <Button type="button" variant="secondary" size="sm" data-chat-action="retry" className="h-8 rounded-[var(--radius-sm)] px-3 shadow-none" onClick={onRetryChat}>
                        <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        重试
                      </Button>
                    ) : null}
                    {onContinueDiscussion ? (
                      <Button type="button" variant="ghost" size="sm" data-chat-action="continue-discussion" className="h-8 rounded-[var(--radius-sm)] px-3" onClick={onContinueDiscussion}>
                        <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                        继续讨论，不生成
                      </Button>
                    ) : null}
                    {onOpenSettings ? (
                      <Button type="button" variant="ghost" size="sm" data-chat-action="open-settings" className="h-8 rounded-[var(--radius-sm)] px-3" onClick={onOpenSettings}>
                        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                        打开模型配置
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function isApprovalIntent(message: string) {
  return /(^\s*(确认|同意|批准|写入)(?:写入)?(?:当前提案|这个提案|这些内容)?(?=$|[\s，。,！!]))|(满意.{0,8}确认|没问题|可以写入|确认.{0,8}写入|就这样|就这样吧)/u.test(message.trim());
}

function isRevisionIntent(message: string) {
  return /(^\s*(改一下|修改|调整|重写|重新生成|重新来过)(?=$|[\s:：，。,！!]))|(不要.{0,12}写入|先别写入|换个版本|生成新版)/u.test(message.trim());
}

function isDiscardIntent(message: string) {
  return /(^\s*(放弃|取消|丢弃|作废)(?=$|[\s，。,！!]))|(不要了|这个提案不要|放弃这个提案|取消这个提案|作废当前提案)/u.test(message.trim());
}
