import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentProps } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from './ChatPanel';

const srcDirectory = dirname(fileURLToPath(import.meta.url));
const injectedSurfaceStyles = [
  readFileSync(resolve(srcDirectory, '../../styles/tokens.css'), 'utf8'),
  readFileSync(resolve(srcDirectory, '../../styles.css'), 'utf8'),
].join('\n');

if (!document.head.querySelector('[data-test-styles="chat-surface-contract"]')) {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-test-styles', 'chat-surface-contract');
  styleElement.textContent = injectedSurfaceStyles;
  document.head.appendChild(styleElement);
}

function readCustomProperty(element: Element | null, propertyName: string) {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  return getComputedStyle(element).getPropertyValue(propertyName).trim();
}

function readRuleProperty(selectorText: string, propertyName: string) {
  for (const styleSheet of Array.from(document.styleSheets)) {
    const rules = Array.from(styleSheet.cssRules ?? []);

    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }

      const selectors = rule.selectorText.split(',').map((selector) => selector.trim());
      if (!selectors.includes(selectorText)) {
        continue;
      }

      const value = rule.style.getPropertyValue(propertyName).trim();
      if (value) {
        return value;
      }
    }
  }

  return '';
}

function readMediaRuleProperty(mediaText: string, selectorText: string, propertyName: string) {
  for (const styleSheet of Array.from(document.styleSheets)) {
    const rules = Array.from(styleSheet.cssRules ?? []);

    for (const rule of rules) {
      if (!(rule instanceof CSSMediaRule) || rule.conditionText !== mediaText) {
        continue;
      }

      for (const nestedRule of Array.from(rule.cssRules ?? [])) {
        if (!(nestedRule instanceof CSSStyleRule)) {
          continue;
        }

        const selectors = nestedRule.selectorText.split(',').map((selector) => selector.trim());
        if (!selectors.includes(selectorText)) {
          continue;
        }

        const value = nestedRule.style.getPropertyValue(propertyName).trim();
        if (value) {
          return value;
        }
      }
    }
  }

  return '';
}

function resolveLengthContractValue(contractValue: string, scope: Element | null = document.documentElement) {
  const trimmedValue = contractValue.trim();
  const customPropertyMatch = /^var\((--[^),\s]+)(?:,\s*([^)]+))?\)$/.exec(trimmedValue);

  if (!customPropertyMatch) {
    return trimmedValue;
  }

  return readCustomProperty(scope, customPropertyMatch[1]) || customPropertyMatch[2]?.trim() || '';
}

afterEach(() => {
  cleanup();
});

type ChatPanelProps = ComponentProps<typeof ChatPanel>;

function renderChatPanel(overrides: Partial<ChatPanelProps> = {}) {
  const defaultProps: ChatPanelProps = {
    messages: [],
    chatInput: '',
    assistantStatus: 'idle',
    onChangeInput: () => {},
    onSubmit: () => {},
    attachments: [],
    onPickFiles: () => {},
    onRemoveAttachment: () => {},
  };

  return render(<ChatPanel {...defaultProps} {...overrides} />);
}

describe('ChatPanel', () => {
  it('renders the collaborator panel, message history, and streaming indicator', () => {
    renderChatPanel({
      messages: [
        { role: 'assistant', content: '你好' },
        { role: 'user', content: '继续', attachments: [{ name: '设定.md' }] },
      ],
      assistantStatus: 'streaming',
    });

    const chatPanel = screen.getByRole('complementary', { name: '创作助手对话区' });

    expect(chatPanel).toHaveAttribute('data-ui-surface', 'chat-panel');
    expect(screen.getByRole('heading', { name: '创作助手' })).toBeInTheDocument();
    expect(chatPanel.querySelector('[data-chat-surface="dock-header"]')).not.toBeNull();
    expect(chatPanel.querySelector('[data-chat-surface="dock-context"]')).toBeNull();
    expect(chatPanel.querySelector('[data-chat-surface="header-row"]')).not.toBeNull();
    expect(chatPanel.querySelector('[data-chat-surface="composer"]')).not.toBeNull();
    expect(chatPanel.querySelectorAll('[data-chat-surface="log"] article')).toHaveLength(2);
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('继续')).toBeInTheDocument();
    expect(screen.getByText('设定.md')).toBeInTheDocument();
    expect(chatPanel.querySelector('[data-chat-surface="streaming-indicator"]')).not.toBeNull();
  });

  it('marks message turns for quiet grouping and entrance motion', () => {
    renderChatPanel({
      messages: [
        { role: 'assistant', content: '先整理一下方向。' },
        { role: 'assistant', content: '这里补充一个风险。' },
        { role: 'user', content: '那继续写。' },
        { role: 'assistant', content: '好的，进入正文。' },
      ],
    });

    const chatPanel = screen.getByRole('complementary', { name: '创作助手对话区' });
    const messages = Array.from(chatPanel.querySelectorAll<HTMLElement>('[data-chat-message-role]'));

    expect(messages).toHaveLength(4);
    expect(messages[0]).toHaveAttribute('data-chat-message-role', 'assistant');
    expect(messages[0]).toHaveAttribute('data-chat-message-flow', 'turn-start');
    expect(messages[0]).toHaveAttribute('data-chat-message-motion', 'enter');
    expect(messages[1]).toHaveAttribute('data-chat-message-role', 'assistant');
    expect(messages[1]).toHaveAttribute('data-chat-message-flow', 'continuation');
    expect(messages[1]).toHaveAttribute('data-chat-message-motion', 'enter');
    expect(messages[2]).toHaveAttribute('data-chat-message-role', 'user');
    expect(messages[2]).toHaveAttribute('data-chat-message-flow', 'turn-start');
    expect(messages[3]).toHaveAttribute('data-chat-message-flow', 'turn-start');
  });

  it('uses shared motion tokens for chat message entrance polish', () => {
    expect(readRuleProperty(".chat-message[data-chat-message-motion='enter']", 'animation-name')).toBe('chatMessageIn');
    expect(readRuleProperty(".chat-message[data-chat-message-motion='enter']", 'animation-duration')).toBe('var(--motion-duration-slow)');
    expect(readRuleProperty(".chat-message[data-chat-message-flow='continuation']", 'margin-top')).toBe('calc(var(--ui-assistant-log-gap) * -0.45)');
  });

  it('renders a thinking indicator when assistantStatus is thinking', () => {
    renderChatPanel({ assistantStatus: 'thinking' });

    expect(screen.getByRole('status', { name: '正在构思回复' })).toBeInTheDocument();
  });

  it('renders lively accessible thinking and streaming motion states', () => {
    const { rerender } = renderChatPanel({ assistantStatus: 'thinking' });

    const thinkingIndicator = screen.getByRole('status', { name: '正在构思回复' });

    expect(thinkingIndicator).toHaveAttribute('data-chat-motion-state', 'thinking');
    expect(thinkingIndicator.querySelectorAll('[data-chat-motion-dot]')).toHaveLength(3);
    expect(thinkingIndicator.querySelector('[data-chat-motion-sweep]')).not.toBeNull();
    expect(readRuleProperty('.chat-thinking-indicator[data-chat-motion-state=\'thinking\'] [data-chat-motion-dot]', 'animation-name')).toBe('chatThinkingPulse');
    expect(readRuleProperty('.chat-thinking-indicator[data-chat-motion-state=\'thinking\'] [data-chat-motion-sweep]', 'animation-name')).toBe('chatThinkingSweep');

    rerender(
      <ChatPanel
        messages={[]}
        chatInput=""
        assistantStatus="streaming"
        onChangeInput={() => {}}
        onSubmit={() => {}}
        attachments={[]}
        onPickFiles={() => {}}
        onRemoveAttachment={() => {}}
      />,
    );

    const streamingIndicator = screen.getByRole('status', { name: '正在输出回复' });

    expect(streamingIndicator).toHaveAttribute('data-chat-motion-state', 'streaming');
    expect(streamingIndicator.querySelector('[data-chat-motion-line]')).not.toBeNull();
    expect(readRuleProperty("[data-chat-surface='streaming-indicator'] [data-chat-motion-line]", 'animation-name')).toBe('chatStreamingTrace');
    expect(readMediaRuleProperty('(prefers-reduced-motion: reduce)', '.chat-thinking-indicator[data-chat-motion-state=\'thinking\'] [data-chat-motion-dot]', 'animation')).toBe('none');
    expect(readMediaRuleProperty('(prefers-reduced-motion: reduce)', "[data-chat-surface='streaming-indicator'] [data-chat-motion-line]", 'animation')).toBe('none');
  });

  it('disables sending while the composer has no text or attachments', () => {
    renderChatPanel({ chatInput: '   ' });

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
  });

  it('renders a thinking duration label for the last assistant message when idle', () => {
    renderChatPanel({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi', thinkingDuration: 1200 },
      ],
    });

    expect(screen.getByText('思考 1.2s')).toBeInTheDocument();
  });

  it('keeps the streamed assistant row mounted when its content updates in place', () => {
    const initialMessages = [
      { role: 'user' as const, content: '继续' },
      { role: 'assistant' as const, content: '先给你第一版。' },
    ];
    const { rerender } = renderChatPanel({ messages: initialMessages });

    const initialAssistantRow = screen.getByText('先给你第一版。').closest('article');

    rerender(
      <ChatPanel
        messages={[
          { role: 'user', content: '继续' },
          { role: 'assistant', content: '先给你第一版。这里再补一句。' },
        ]}
        chatInput=""
        assistantStatus="idle"
        onChangeInput={() => {}}
        onSubmit={() => {}}
        attachments={[]}
        onPickFiles={() => {}}
        onRemoveAttachment={() => {}}
      />,
    );

    const updatedAssistantRow = screen.getByText('先给你第一版。这里再补一句。').closest('article');

    expect(updatedAssistantRow).toBe(initialAssistantRow);
  });

  it('keeps an existing assistant row mounted when earlier history is trimmed away', () => {
    const { rerender } = renderChatPanel({
      messages: [
        { role: 'user', content: '旧的上下文' },
        { role: 'assistant', content: '保留这条助手消息。' },
      ],
    });

    const initialAssistantRow = screen.getByText('保留这条助手消息。').closest('article');

    rerender(
      <ChatPanel
        messages={[{ role: 'assistant', content: '保留这条助手消息。' }]}
        chatInput=""
        assistantStatus="idle"
        onChangeInput={() => {}}
        onSubmit={() => {}}
        attachments={[]}
        onPickFiles={() => {}}
        onRemoveAttachment={() => {}}
      />,
    );

    const trimmedAssistantRow = screen.getByText('保留这条助手消息。').closest('article');

    expect(trimmedAssistantRow).toBe(initialAssistantRow);
  });

  it('does not reuse an assistant row when same-named attachments change content', () => {
    const initialAttachments = [
      { name: '设定.md', mimeType: 'text/markdown', size: 120, textContent: '# 设定 A' },
    ] as unknown as NonNullable<ChatPanelProps['messages'][number]['attachments']>;
    const updatedAttachments = [
      { name: '设定.md', mimeType: 'text/markdown', size: 240, textContent: '# 设定 B' },
    ] as unknown as NonNullable<ChatPanelProps['messages'][number]['attachments']>;

    const { rerender } = renderChatPanel({
      messages: [
        { role: 'user', content: '继续' },
        {
          role: 'assistant',
          content: '带附件的回复。',
          attachments: initialAttachments,
        },
      ],
    });

    const initialAssistantRow = screen.getByText('带附件的回复。').closest('article');

    rerender(
      <ChatPanel
        messages={[
          { role: 'user', content: '继续' },
          {
            role: 'assistant',
            content: '带附件的回复。',
            attachments: updatedAttachments,
          },
        ]}
        chatInput=""
        assistantStatus="idle"
        onChangeInput={() => {}}
        onSubmit={() => {}}
        attachments={[]}
        onPickFiles={() => {}}
        onRemoveAttachment={() => {}}
      />,
    );

    const updatedAssistantRow = screen.getByText('带附件的回复。').closest('article');

    expect(updatedAssistantRow).not.toBe(initialAssistantRow);
  });

  it('submits the current input', () => {
    const onSubmit = vi.fn();

    renderChatPanel({
      chatInput: 'hello',
      onSubmit,
    });

    fireEvent.submit(screen.getByRole('button', { name: '发送' }).closest('form')!);

    expect(onSubmit).toHaveBeenCalled();
  });

  it('renders attachment chips and exposes file picker trigger', () => {
    const onRemoveAttachment = vi.fn();

    renderChatPanel({
      attachments: [{ name: '人物设定.md', mimeType: 'text/markdown', size: 120, textContent: '# 人物设定' }],
      onRemoveAttachment,
    });

    expect(screen.getByRole('button', { name: '添加文件' })).toBeInTheDocument();
    expect(screen.getByText('参考附件')).toBeInTheDocument();
    expect(screen.getByText('人物设定.md')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移除附件 人物设定.md' }));

    expect(onRemoveAttachment).toHaveBeenCalledWith('人物设定.md');
  });

  it('clears the hidden file input after handing picked files upstream', () => {
    const onPickFiles = vi.fn();

    renderChatPanel({ onPickFiles });

    const fileInput = document.querySelector('[data-chat-surface="file-input"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(['# same file'], 'same.md', { type: 'text/markdown' });
    Object.defineProperty(fileInput, 'value', {
      configurable: true,
      value: 'C:\\fakepath\\same.md',
      writable: true,
    });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [file],
      },
    });

    expect(onPickFiles).toHaveBeenCalled();
    expect((fileInput as HTMLInputElement).value).toBe('');
  });

  it('renders a single conversational composer without Plan / Write controls', () => {
    renderChatPanel();

    expect(screen.queryByLabelText('Plan')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Write')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '这轮只讨论' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '这轮直接写' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('聊天输入框')).toBeInTheDocument();
  });

  it('keeps assistant context supporting while leaving send as the primary action', () => {
    renderChatPanel({
      turnStrategy: {
        requestMode: 'write',
        hintText: '本轮可能生成写入提案',
        treatAsApproval: false,
        showsWriteTargetHint: true,
      },
      chatError: '提案生成失败：未配置模型 API Key。',
      onRetryChat: vi.fn(),
      onContinueDiscussion: vi.fn(),
      onOpenSettings: vi.fn(),
    });

    const advisoryNote = document.querySelector('[data-chat-surface="composer-advisory"]');
    const sendButton = screen.getByRole('button', { name: '发送' });
    const attachTrigger = screen.getByRole('button', { name: '添加文件' });
    const retryButton = document.querySelector('[data-chat-action="retry"]');
    const continueButton = document.querySelector('[data-chat-action="continue-discussion"]');
    const settingsButton = document.querySelector('[data-chat-action="open-settings"]');

    expect(advisoryNote).toHaveTextContent('本轮可能生成写入提案');
    expect(screen.queryByText('写作支持')).not.toBeInTheDocument();
    expect(screen.queryByText('偏写作')).not.toBeInTheDocument();
    expect(screen.getByText('提案生成失败：未配置模型 API Key。')).toBeInTheDocument();
    expect(sendButton).toHaveAttribute('data-ui-control-tier', 'primary');
    expect(attachTrigger).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(retryButton).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(continueButton).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(settingsButton).toHaveAttribute('data-ui-control-tier', 'quiet');
  });

  it('only renders recovery buttons when the corresponding handlers exist', () => {
    renderChatPanel({
      chatError: '提案生成失败：未配置模型 API Key。',
      onRetryChat: vi.fn(),
    });

    expect(document.querySelector('[data-chat-action="retry"]')).toBeInTheDocument();
    expect(document.querySelector('[data-chat-action="continue-discussion"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-chat-action="open-settings"]')).not.toBeInTheDocument();
  });

  it('renders document-attached collaborator context through visible manuscript cues', () => {
    renderChatPanel({
      turnStrategy: {
        requestMode: 'write',
        hintText: '这是任意自定义提示文案',
        treatAsApproval: false,
        showsWriteTargetHint: true,
      },
      writeTargetHint: {
        activeDocumentPath: 'src/foo.md',
        strictWorkflowWrites: [],
        chatAllowedWrites: [],
        hasPendingProposal: false,
      },
    });

    const chatPanel = screen.getByRole('complementary', { name: '创作助手对话区' });
    const dockHeader = chatPanel.querySelector<HTMLElement>('[data-chat-surface="dock-header"]');
    const inlineContext = chatPanel.querySelector<HTMLElement>('[data-chat-surface="context-inline"]');
    const advisoryNote = chatPanel.querySelector<HTMLElement>('[data-chat-surface="composer-advisory"]');

    expect(chatPanel).toHaveAttribute('data-chat-context-state', 'document-attached');
    expect(chatPanel).toHaveAttribute('data-chat-shell-link', 'continuity-band');
    expect(readCustomProperty(chatPanel, '--ui-shell-cohesion-band')).toBe('creative-workbench');
    expect(screen.queryByText('当前协作焦点')).not.toBeInTheDocument();
    expect(inlineContext).toHaveTextContent('foo.md');
    expect(screen.queryByText('可编辑草稿')).not.toBeInTheDocument();
    expect(advisoryNote).toHaveTextContent('将写入: foo.md');
    expect(dockHeader).toHaveAttribute('data-chat-shell-link', 'continuity-band');
    expect(chatPanel.querySelector('[data-chat-surface="dock-context"]')).toBeNull();
    expect(chatPanel.querySelector('[data-chat-surface="proposal-notice"]')).toBeNull();
    expect(readCustomProperty(chatPanel, '--ui-assistant-context-shell-link')).toBe('continuity-linked');
  });

  it('renders proposal-pending collaborator context through visible manuscript cues', () => {
    renderChatPanel({
      turnStrategy: {
        requestMode: 'write',
        hintText: '完全不同的确认文案',
        treatAsApproval: true,
        showsWriteTargetHint: true,
      },
      writeTargetHint: {
        activeDocumentPath: 'src/foo.md',
        strictWorkflowWrites: [],
        chatAllowedWrites: [],
        hasPendingProposal: true,
      },
      proposalTargets: [{ path: 'drafts/proposal-target.md' }],
    });

    const chatPanel = screen.getByRole('complementary', { name: '创作助手对话区' });
    const proposalNotice = chatPanel.querySelector<HTMLElement>('[data-chat-surface="proposal-notice"]');

    expect(chatPanel).toHaveAttribute('data-chat-context-state', 'proposal-pending');
    expect(chatPanel).toHaveAttribute('data-chat-shell-link', 'continuity-band');
    expect(screen.queryByText('提案待确认')).not.toBeInTheDocument();
    expect(proposalNotice).toHaveTextContent('proposal-target.md');
    expect(screen.queryByText('foo.md')).not.toBeInTheDocument();
    expect(screen.queryByText('提案预览')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-context-inline')).not.toBeInTheDocument();
    expect(screen.getByText('先确认当前提案，再继续推进。')).toBeInTheDocument();
    expect(chatPanel.querySelector('[data-chat-surface="dock-context"]')).toBeNull();
    expect(readCustomProperty(chatPanel, '--ui-assistant-context-shell-link')).toBe('continuity-linked');
  });

  it('does not render write target hint when the structured strategy disables it even if hint text looks write-like', () => {
    renderChatPanel({
      turnStrategy: {
        requestMode: 'plan',
        hintText: '本轮可能生成写入提案',
        treatAsApproval: false,
        showsWriteTargetHint: false,
      },
      writeTargetHint: {
        activeDocumentPath: 'src/foo.md',
        strictWorkflowWrites: [],
        chatAllowedWrites: [],
        hasPendingProposal: false,
      },
    });

    expect(screen.queryByText('将写入: foo.md')).not.toBeInTheDocument();
  });

  it('renders a quiet header row without the standalone dock-context card', () => {
    renderChatPanel({
      messages: [{ role: 'assistant', content: '你好' }],
      turnStrategy: {
        requestMode: 'write',
        hintText: '围绕当前文稿继续推进下一步。',
        treatAsApproval: false,
        showsWriteTargetHint: true,
      },
      writeTargetHint: {
        activeDocumentPath: 'drafts/foo.md',
        strictWorkflowWrites: [],
        chatAllowedWrites: [],
        hasPendingProposal: false,
      },
    });

    const chatPanel = screen.getByRole('complementary', { name: '创作助手对话区' });

    expect(chatPanel.querySelector('[data-chat-surface="dock-context"]')).toBeNull();
    expect(chatPanel.querySelector('[data-chat-surface="header-row"]')).not.toBeNull();
    expect(screen.getByTestId('chat-context-inline')).toHaveTextContent('foo.md');
    expect(screen.queryByText('贴稿协作')).not.toBeInTheDocument();
  });

  it('uses a proposal notice instead of the document hint when proposal approval is pending', () => {
    renderChatPanel({
      turnStrategy: {
        requestMode: 'write',
        hintText: '完全不同的确认文案',
        treatAsApproval: true,
        showsWriteTargetHint: true,
      },
      writeTargetHint: {
        activeDocumentPath: 'drafts/foo.md',
        strictWorkflowWrites: [],
        chatAllowedWrites: [],
        hasPendingProposal: true,
      },
      proposalTargets: [{ path: 'drafts/proposal-target.md' }],
    });

    expect(screen.queryByTestId('chat-context-inline')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-proposal-notice')).toHaveTextContent('proposal-target.md');
  });

  it('keeps pending proposal confirmation conversational instead of rendering a composer approval button', () => {
    renderChatPanel({
      writeTargetHint: {
        activeDocumentPath: 'drafts/foo.md',
        strictWorkflowWrites: [],
        chatAllowedWrites: [],
        hasPendingProposal: true,
      },
      proposalTargets: [{ path: 'drafts/proposal-target.md' }],
    });

    expect(screen.getByTestId('chat-proposal-notice')).toHaveTextContent('proposal-target.md');
    expect(screen.queryByRole('button', { name: '确认写入当前提案' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认写入' })).not.toBeInTheDocument();
  });

  it('places upload and icon-only send controls inside the composer frame', () => {
    renderChatPanel({ chatInput: '继续讨论' });

    const composerFrame = screen.getByTestId('chat-composer-frame');
    const upload = screen.getByRole('button', { name: '添加文件' });
    const send = screen.getByRole('button', { name: '发送' });

    expect(composerFrame).toContainElement(upload);
    expect(composerFrame).toContainElement(send);
    expect(send).not.toHaveTextContent('发送');
  });

  it('keeps the composer compact when there is no advisory text', () => {
    renderChatPanel({
      chatInput: '继续讨论',
      turnStrategy: {
        requestMode: 'auto',
        hintText: null,
        treatAsApproval: false,
        showsWriteTargetHint: false,
      },
    });

    expect(screen.queryByText('交给创作助手判断')).not.toBeInTheDocument();
    expect(document.querySelector('[data-chat-surface="composer-advisory"]')).not.toBeInTheDocument();
    expect(readRuleProperty("[data-ui-surface='chat-panel'] [data-chat-surface='composer']", 'row-gap')).toBe('8px');
    expect(readRuleProperty("[data-ui-surface='chat-panel'] [data-chat-surface='composer-shell']", 'padding')).toBe(
      '8px var(--ui-assistant-log-padding-inline) 12px',
    );
  });

  it('keeps the attachment trigger visible in compact form and hides the strip until attachments exist', () => {
    renderChatPanel();

    expect(screen.getByRole('button', { name: '添加文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加文件' })).toHaveAttribute('data-chat-surface', 'attachment-trigger');
    expect(screen.queryByText('参考附件')).not.toBeInTheDocument();
  });

  it('exposes a compact input selector contract and grows the textarea when content is long', () => {
    const shortPrompt = '短句';
    const longPrompt = '这是一段需要触发多行增长的输入。'.repeat(20);
    const minHeightSelector = "[data-ui-surface='chat-panel'] [data-chat-surface='composer-shell'] [data-chat-surface='input']";
    const contractMinHeight = readRuleProperty(minHeightSelector, 'min-height');
    const resolvedContractMinHeight = resolveLengthContractValue(contractMinHeight);
    const resolvedContractMinHeightValue = Number.parseFloat(resolvedContractMinHeight);

    const { rerender } = renderChatPanel({ chatInput: shortPrompt });

    const input = screen.getByLabelText('聊天输入框') as HTMLTextAreaElement;
    const restingHeight = Number.parseFloat(getComputedStyle(input).height || input.style.height || '0');

    rerender(
      <ChatPanel
        messages={[]}
        chatInput={longPrompt}
        assistantStatus="idle"
        onChangeInput={() => {}}
        onSubmit={() => {}}
        attachments={[]}
        onPickFiles={() => {}}
        onRemoveAttachment={() => {}}
      />,
    );

    const grownHeight = Number.parseFloat(getComputedStyle(input).height || input.style.height || '0');

    expect(input).toHaveAttribute('data-chat-surface', 'input');
    expect(contractMinHeight).not.toBe('');
    expect(resolvedContractMinHeight).not.toBe('');
    expect(Number.isNaN(resolvedContractMinHeightValue)).toBe(false);
    expect(restingHeight).toBe(resolvedContractMinHeightValue);
    expect(grownHeight).toBeGreaterThan(restingHeight);
    expect(grownHeight).toBeGreaterThan(resolvedContractMinHeightValue);
  });

  it('uses the same compact type size for composer input and message body text', () => {
    const inputSelector = "[data-ui-surface='chat-panel'] [data-chat-surface='composer-shell'] [data-chat-surface='input']";
    const messageSelector = "[data-ui-surface='chat-panel'] [data-chat-surface='message-content']";

    renderChatPanel({
      messages: [{ role: 'assistant', content: '这一行是对话正文' }],
      chatInput: '输入框文字',
    });

    expect(screen.getByLabelText('聊天输入框')).toHaveAttribute('data-chat-surface', 'input');
    expect(document.querySelector('[data-chat-surface="message-content"]')).toHaveTextContent('这一行是对话正文');
    expect(readRuleProperty(inputSelector, 'font-size')).toBe('14px');
    expect(readRuleProperty(inputSelector, 'line-height')).toBe('24px');
    expect(readRuleProperty(messageSelector, 'font-size')).toBe('14px');
    expect(readRuleProperty(messageSelector, 'line-height')).toBe('24px');
  });

  it('still exposes recovery controls when a chat error is present', () => {
    renderChatPanel({
      chatError: '提案生成失败：未配置模型 API Key。',
      onRetryChat: vi.fn(),
      onContinueDiscussion: vi.fn(),
      onOpenSettings: vi.fn(),
    });

    expect(screen.getByText('提案生成失败：未配置模型 API Key。')).toBeInTheDocument();
    expect(document.querySelector('[data-chat-surface="error-actions"]')).not.toBeNull();
    expect(document.querySelector('[data-chat-action="retry"]')).not.toBeNull();
    expect(document.querySelector('[data-chat-action="continue-discussion"]')).not.toBeNull();
    expect(document.querySelector('[data-chat-action="open-settings"]')).not.toBeNull();
  });
});
