/**
 * @vitest-environment jsdom
 */
import type { ComponentProps } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopBar } from './TopBar';

type TopBarProps = ComponentProps<typeof TopBar>;

type LegacyInlineContext = {
  currentDocumentLabel: string;
  continuityFlow: string;
  continuityFlowLabel: string;
  pendingState: string;
  pendingStateLabel: string;
  nextTargetLabel: string;
  nextSuggestion: string;
  nextTargetPath: string;
};

function createProps(overrides: Partial<TopBarProps> = {}): TopBarProps {
  return {
    projectName: '测试项目',
    intentLabel: '当前意图 · 围绕当前稿件与上下文继续推进',
    stepTitle: '新书方向定义',
    chapterLabel: '第001章',
    modelStatus: '模型已配置',
    activeContextRail: null,
    onBack: vi.fn(),
    onOpenSettings: vi.fn(),
    onToggleContextRail: vi.fn(),
    fileNavigationButtonRef: { current: null },
    workflowStatusButtonRef: { current: null },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('TopBar', () => {
  it('renders a compact navigation shell without the legacy inline workflow context row', () => {
    const propsWithLegacyInlineContext = {
      ...createProps(),
      inlineContext: {
        currentDocumentLabel: '1-边界/预期.md',
        continuityFlow: 'drafting',
        continuityFlowLabel: '围绕正文继续推进',
        pendingState: 'ready',
        pendingStateLabel: '等待下一步',
        nextTargetLabel: '第001章 · 冲突升级',
        nextSuggestion: '保持人物张力并推进冲突',
        nextTargetPath: '3-正文/第001章.md',
      } satisfies LegacyInlineContext,
    } as TopBarProps & { inlineContext: LegacyInlineContext };

    render(<TopBar {...(propsWithLegacyInlineContext as TopBarProps)} />);

    const topBar = screen.getByLabelText('工作台顶部栏');
    const breadcrumbs = screen.getByRole('navigation', { name: '页面导航' });
    const intentCue = screen.getByText('当前意图 · 围绕当前稿件与上下文继续推进');

    expect(topBar).toHaveAttribute('data-shell-region', 'top-bar');
    expect(topBar).toHaveAttribute('data-topbar-layout', 'compact-navigation');
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
    expect(screen.getByText('测试项目')).toBeInTheDocument();
    expect(breadcrumbs).toHaveTextContent('新书方向定义');
    expect(breadcrumbs).toHaveTextContent('第001章');
    expect(screen.getByText('模型已配置')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模型配置' })).toBeInTheDocument();
    expect(intentCue.closest('[data-ui-intent-weight]')).toHaveAttribute('data-ui-intent-weight', 'supporting');
    expect(topBar.querySelector('[data-shell-region="top-bar-context-inline"]')).toBeNull();
    expect(screen.queryByText('当前推进')).not.toBeInTheDocument();
    expect(screen.queryByText('接续目标')).not.toBeInTheDocument();
    expect(screen.queryByText('1-边界/预期.md')).not.toBeInTheDocument();
    expect(screen.queryByText('保持人物张力并推进冲突')).not.toBeInTheDocument();
  });

  it('keeps the compact shell even when legacy inline summary fields are present', () => {
    const propsWithLegacyInlineContext = {
      ...createProps(),
      inlineContext: {
        currentDocumentLabel: '1-边界/预期.md',
        continuityFlow: 'drafting',
        continuityFlowLabel: '围绕正文继续推进',
        pendingState: 'ready',
        pendingStateLabel: '等待下一步',
        nextTargetLabel: '第001章 · 冲突升级',
        nextSuggestion: '保持人物张力并推进冲突',
        nextTargetPath: '3-正文/第001章.md',
      } satisfies LegacyInlineContext,
    } as TopBarProps & { inlineContext: LegacyInlineContext };

    render(<TopBar {...(propsWithLegacyInlineContext as TopBarProps)} />);

    const topBar = screen.getByLabelText('工作台顶部栏');

    expect(topBar).toHaveAttribute('data-topbar-layout', 'compact-navigation');
    expect(topBar.querySelector('[data-shell-region="top-bar-context-inline"]')).toBeNull();
    expect(screen.queryByText('围绕正文继续推进')).not.toBeInTheDocument();
    expect(screen.queryByText('等待下一步')).not.toBeInTheDocument();
    expect(screen.queryByText('第001章 · 冲突升级')).not.toBeInTheDocument();
  });

  it('keeps back and settings actions wired in the compact shell', () => {
    const props = createProps();

    render(<TopBar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    fireEvent.click(screen.getByRole('button', { name: '模型配置' }));

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('renders context rail controls and toggles the requested panel', () => {
    const props = createProps();

    render(<TopBar {...props} />);

    const fileButton = screen.getByRole('button', { name: '打开文稿导航' });
    const workflowButton = screen.getByRole('button', { name: '打开流程状态' });

    expect(fileButton).toHaveAttribute('aria-expanded', 'false');
    expect(fileButton).toHaveAttribute('aria-controls', 'workbench-context-rail');
    expect(fileButton).toHaveAttribute('data-context-rail-control', 'files');
    expect(fileButton).toHaveAttribute('data-active', 'false');
    expect(workflowButton).toHaveAttribute('aria-expanded', 'false');
    expect(workflowButton).toHaveAttribute('aria-controls', 'workbench-context-rail');
    expect(workflowButton).toHaveAttribute('data-context-rail-control', 'workflow');
    expect(workflowButton).toHaveAttribute('data-active', 'false');

    fireEvent.click(fileButton);
    fireEvent.click(workflowButton);

    expect(props.onToggleContextRail).toHaveBeenNthCalledWith(1, 'files');
    expect(props.onToggleContextRail).toHaveBeenNthCalledWith(2, 'workflow');
  });

  it('marks the active context rail control by panel', () => {
    render(<TopBar {...createProps({ activeContextRail: 'workflow' })} />);

    const fileButton = screen.getByRole('button', { name: '打开文稿导航' });
    const workflowButton = screen.getByRole('button', { name: '关闭流程状态' });

    expect(fileButton).toHaveAttribute('aria-expanded', 'false');
    expect(fileButton).toHaveAttribute('data-active', 'false');
    expect(workflowButton).toHaveAttribute('aria-expanded', 'true');
    expect(workflowButton).toHaveAttribute('data-active', 'true');
  });
});
