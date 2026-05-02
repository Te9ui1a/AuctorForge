/**
 * @vitest-environment jsdom
 */
import type { ComponentProps } from 'react';

import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { Files } from 'lucide-react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkflowPanel, WorkflowSection } from './WorkflowPanel';

type WorkflowPanelProps = ComponentProps<typeof WorkflowPanel>;

function createDefaultProps(): WorkflowPanelProps {
  return {
    session: {
      initialized: true,
      currentStepId: 'test-step',
      currentModule: 'test-module',
      waitingForApproval: false,
      currentStepTitle: 'Test Step',
      currentChapterNumber: 1,
      interactionMode: 'discussion',
    },
    summary: {
      phase: 'Test Phase',
      coreTask: 'Test Task',
      nextSuggestion: 'Test Suggestion',
      callableModules: [],
      assetPointers: [{ section: 'test', label: 'Test Asset', path: 'test/path' }],
    },
    requiredProjectReads: ['read1.txt'],
    allowedWrites: ['write1.txt'],
    collapsed: false,
    onToggleCollapse: vi.fn(),
  };
}

describe('WorkflowPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the expanded workflow panel as a quiet support rail', () => {
    const defaultProps = createDefaultProps();

    render(<WorkflowPanel {...defaultProps} />);
    const workflowRail = screen.getByRole('complementary', { name: '流程状态侧栏' });
    const workflowHeading = screen.getByRole('heading', { name: '流程状态' });
    const workflowHeader = workflowRail.querySelector('[data-shell-region="workflow-header"]');
    const workflowBody = workflowRail.querySelector('[data-shell-region="workflow-body"]');
    const workflowHero = workflowRail.querySelector('[data-shell-region="workflow-hero"]');
    const actionGuide = workflowRail.querySelector('[data-workflow-section="actionable-guidance"]');
    const blocking = workflowRail.querySelector('[data-workflow-action="blocking"]');
    const nextWrite = workflowRail.querySelector('[data-workflow-action="next-write"]');
    const collapseButton = within(workflowHeader as HTMLElement).getByRole('button', { name: '折叠流程状态栏' });
    const statusChip = screen.getByText('讨论中').closest('[data-workflow-status-style]');

    expect(workflowRail).toHaveAttribute('data-ui-surface', 'workflow-rail');
    expect(workflowRail).toHaveAttribute('data-shell-region', 'workflow-rail');
    expect(workflowRail).toHaveAttribute('data-shell-role', 'supporting-guidance');
    expect(workflowRail).toHaveAttribute('data-panel-state', 'expanded');
    expect(workflowRail).toHaveAttribute('data-workflow-layout', 'guidance-rail');
    expect(workflowRail).toHaveAttribute('data-workflow-tone', 'quiet-support');
    expect(workflowHeader).not.toBeNull();
    expect(workflowBody).not.toBeNull();
    expect(workflowHero).not.toBeNull();
    expect(workflowHeading.closest('[data-shell-region="workflow-header"]')).toBe(workflowHeader);
    expect(workflowHeader).toHaveAttribute('data-workflow-header', 'quiet-support');
    expect(workflowBody).toHaveAttribute('data-workflow-body', 'support-flow');
    expect(workflowHero).toHaveAttribute('data-workflow-card', 'support-context');
    expect(collapseButton).toHaveAttribute('data-workflow-control-style', 'ambient');
    expect(statusChip).toHaveAttribute('data-workflow-status-style', 'ambient');
    expect(actionGuide).toHaveAttribute('data-workflow-guidance-state', 'blocked');
    expect(actionGuide).toHaveAttribute('data-workflow-guidance-tone', 'support-rail');
    expect(blocking).toHaveAttribute('data-workflow-blocking', 'reads');
    expect(nextWrite).toHaveAttribute('data-workflow-target-kind', 'strict-target');
    expect(screen.getByText('Test Step')).toBeInTheDocument();
    expect(screen.getByText('Test Step').closest('[data-shell-region="workflow-hero"]')).toBe(workflowHero);
    expect(within(workflowHeader as HTMLElement).getByText('贴边提示')).toBeInTheDocument();
    expect(within(workflowHeader as HTMLElement).queryByText(/不打断正文/)).not.toBeInTheDocument();
    expect(screen.getByText('Test Phase · Test Task')).toBeInTheDocument();
    expect(screen.getByText('下一步：Test Suggestion')).toBeInTheDocument();
    expect(screen.queryByText(/当前任务：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前工具焦点/)).not.toBeInTheDocument();
    expect(blocking).toHaveTextContent('read1.txt');
    expect(nextWrite).toHaveTextContent('write1.txt');
  });

  it('renders the migrated workbench summary inside the hero without adding another card', () => {
    const defaultProps = {
      ...createDefaultProps(),
      allowedWrites: [],
      strictWorkflowWrites: [],
      chatAllowedWrites: [],
      manualWritablePaths: [],
      pendingProposal: {
        proposedWrites: [{ path: '3-正文/第001章.md', content: '# 提案' }],
      },
      workflowSummary: {
        currentDocumentLabel: '当前文档：3-正文/第001章.md',
        continuityFlow: 'drafting',
        continuityFlowLabel: '围绕正文继续推进',
        pendingState: 'ready',
        pendingStateLabel: '等待下一步',
        nextTargetLabel: '第001章.md',
        nextSuggestion: '保持人物张力并推进冲突',
        nextTargetPath: '3-正文/第001章.md',
      },
    } as WorkflowPanelProps & {
      workflowSummary: {
        currentDocumentLabel: string;
        continuityFlow: string;
        continuityFlowLabel: string;
        pendingState: string;
        pendingStateLabel: string;
        nextTargetLabel: string;
        nextSuggestion: string;
        nextTargetPath: string;
      };
    };

    render(<WorkflowPanel {...(defaultProps as WorkflowPanelProps)} />);

    const workflowHero = screen.getByRole('complementary', { name: '流程状态侧栏' }).querySelector('[data-shell-region="workflow-hero"]');
    const workflowSummary = workflowHero?.querySelector('[data-workflow-summary="inline-context"]');

    expect(workflowHero).not.toBeNull();
    expect(workflowSummary).not.toBeNull();
    expect(workflowSummary).toHaveTextContent('当前文档：3-正文/第001章.md');
    expect(workflowSummary).toHaveTextContent('围绕正文继续推进');
    expect(workflowSummary).toHaveTextContent('等待下一步');
    expect(workflowSummary).toHaveTextContent('下一目标：第001章.md');
    expect(workflowSummary).toHaveTextContent('保持人物张力并推进冲突');
    expect(workflowSummary).toHaveTextContent('3-正文/第001章.md');
    expect(workflowSummary).toHaveTextContent('下一步：保持人物张力并推进冲突');
    expect(workflowSummary).not.toHaveTextContent('下一目标：3-正文/第001章.md');
    expect(workflowHero).toHaveAttribute('data-workflow-card', 'support-context');
  });

  it('renders references, write scopes, and assets as light context folds', () => {
    const defaultProps = createDefaultProps();

    render(<WorkflowPanel {...defaultProps} />);
    
    const referencesDetails = screen.getByText('参考文件').closest('details');
    expect(referencesDetails).toBeInTheDocument();
    expect(referencesDetails).toHaveAttribute('data-workflow-section', 'details');
    expect(referencesDetails).toHaveAttribute('data-workflow-card', 'context-fold');
    expect(referencesDetails).toHaveAttribute('data-workflow-disclosure-style', 'ambient-support');

    const writeScopesDetails = screen.getByText('写入范围').closest('details');
    expect(writeScopesDetails).toBeInTheDocument();
    expect(writeScopesDetails).toHaveAttribute('data-workflow-section', 'details');
    expect(writeScopesDetails).toHaveAttribute('data-workflow-card', 'context-fold');
    expect(writeScopesDetails).toHaveAttribute('data-workflow-disclosure-style', 'ambient-support');

    const assetsDetails = screen.getByText('关键资产').closest('details');
    expect(assetsDetails).toBeInTheDocument();
    expect(assetsDetails).toHaveAttribute('data-workflow-section', 'details');
    expect(assetsDetails).toHaveAttribute('data-workflow-card', 'context-fold');
    expect(assetsDetails).toHaveAttribute('data-workflow-disclosure-style', 'ambient-support');
  });

  it('renders asset pointers as guidance list content instead of boxed sub-panels', () => {
    const defaultProps = createDefaultProps();

    render(<WorkflowPanel {...defaultProps} />);

    const assetsDetails = screen.getByText('关键资产').closest('details');
    const assetList = screen.getByRole('list', { name: '关键资产列表' });
    const assetItems = within(assetList).getAllByRole('listitem');

    expect(assetsDetails).toContainElement(assetList);
    expect(assetItems).toHaveLength(1);
    expect(assetItems[0]).toHaveTextContent('关键资产：Test Asset');
    expect(assetItems[0]).toHaveTextContent('test/path');
    expect(screen.getByText('test/path')).toHaveAttribute('data-workflow-pointer-style', 'ambient');
  });

  it('keeps rail state semantics when the workflow panel is collapsed', () => {
    const defaultProps = createDefaultProps();
    const onToggleCollapse = vi.fn();

    render(<WorkflowPanel {...defaultProps} collapsed onToggleCollapse={onToggleCollapse} />);

    const workflowRail = screen.getByRole('complementary', { name: '流程状态侧栏' });
    const workflowHeading = screen.getByRole('heading', { name: '流程状态' });
    const workflowHeader = workflowRail.querySelector('[data-shell-region="workflow-header"]');

    expect(workflowRail).toHaveAttribute('data-panel-state', 'collapsed');
    expect(workflowRail).toHaveAttribute('data-shell-region', 'workflow-rail');
    expect(workflowRail).toHaveAttribute('data-shell-role', 'supporting-guidance');
    expect(workflowRail).toHaveAttribute('data-workflow-layout', 'guidance-rail');
    expect(workflowRail).toHaveAttribute('data-workflow-tone', 'quiet-support');
    expect(workflowHeader).not.toBeNull();
    expect(workflowHeading.closest('[data-shell-region="workflow-header"]')).toBe(workflowHeader);
    expect(workflowHeader).toHaveAttribute('data-workflow-header', 'quiet-support');
    expect(workflowRail.querySelector('[data-shell-region="workflow-body"]')).toHaveAttribute('hidden');
    expect(screen.getByText('Test Step')).not.toBeVisible();
    expect(screen.getByRole('button', { name: '展开流程状态栏' })).toHaveAttribute('data-workflow-control-style', 'ambient');

    fireEvent.click(screen.getByRole('button', { name: '展开流程状态栏' }));

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('renders a drawer close control when onClose is provided', () => {
    const defaultProps = createDefaultProps();
    const onClose = vi.fn();

    render(<WorkflowPanel {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭流程状态' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '折叠流程状态栏' })).toBeInTheDocument();
  });

  it('preserves user-toggled disclosure state across rail collapse and re-expand', () => {
    const defaultProps = createDefaultProps();

    const view = render(
      <WorkflowPanel
        {...defaultProps}
        pendingProposal={{
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
        }}
      />,
    );

    const referencesDetails = screen.getByText('参考文件').closest('details');
    const proposalDetails = screen.getByText('待确认提案').closest('details');

    expect(referencesDetails).not.toHaveAttribute('open');
    expect(proposalDetails).toHaveAttribute('open');

    fireEvent.click(screen.getByText('参考文件'));
    fireEvent.click(screen.getByText('待确认提案'));

    expect(referencesDetails).toHaveAttribute('open');
    expect(proposalDetails).not.toHaveAttribute('open');

    view.rerender(
      <WorkflowPanel
        {...defaultProps}
        collapsed
        pendingProposal={{
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
        }}
      />,
    );

    expect(screen.getByRole('complementary', { name: '流程状态侧栏' }).querySelector('[data-shell-region="workflow-body"]')).toHaveAttribute('hidden');

    view.rerender(
      <WorkflowPanel
        {...defaultProps}
        pendingProposal={{
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
        }}
      />,
    );

    expect(screen.getByText('参考文件').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('待确认提案').closest('details')).not.toHaveAttribute('open');
  });

  it('marks pending decisions with the decision workflow tone', () => {
    const defaultProps = createDefaultProps();

    render(
      <WorkflowPanel
        {...defaultProps}
        pendingDecision={{ decisionType: 'continue', reply: '请决定是否继续。' }}
      />,
    );

    const decisionDetails = screen.getByText('需要决定').closest('details');
    expect(decisionDetails).toHaveAttribute('open');
    expect(decisionDetails).toHaveAttribute('data-workflow-card', 'context-fold');
    expect(decisionDetails).toHaveAttribute('data-workflow-disclosure-style', 'ambient-support');
    expect(decisionDetails).toHaveAttribute('data-workflow-tone', 'decision');
  });

  it('marks pending proposals with the proposal workflow tone', () => {
    const defaultProps = createDefaultProps();

    render(
      <WorkflowPanel
        {...defaultProps}
        pendingProposal={{
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
        }}
      />,
    );

    const proposalDetails = screen.getByText('待确认提案').closest('details');
    const actionGuide = screen.getByRole('complementary', { name: '流程状态侧栏' }).querySelector('[data-workflow-section="actionable-guidance"]');
    const blocking = screen.getByRole('complementary', { name: '流程状态侧栏' }).querySelector('[data-workflow-action="blocking"]');
    const nextWrite = screen.getByRole('complementary', { name: '流程状态侧栏' }).querySelector('[data-workflow-action="next-write"]');
    expect(proposalDetails).toHaveAttribute('open');
    expect(proposalDetails).toHaveAttribute('data-workflow-card', 'context-fold');
    expect(proposalDetails).toHaveAttribute('data-workflow-disclosure-style', 'ambient-support');
    expect(proposalDetails).toHaveAttribute('data-workflow-tone', 'proposal');
    expect(actionGuide).toHaveAttribute('data-workflow-guidance-state', 'blocked');
    expect(actionGuide).toHaveAttribute('data-workflow-guidance-tone', 'support-rail');
    expect(blocking).toHaveAttribute('data-workflow-blocking', 'proposal');
    expect(nextWrite).toHaveAttribute('data-workflow-target-kind', 'proposal-target');
    expect(nextWrite).toHaveTextContent('2-设定/2.1_创意脑暴.md');
  });

  it('auto-opens a section when defaultOpen becomes true after mount', () => {
    const view = render(
      <WorkflowSection title="待确认提案" icon={<Files className="h-3.5 w-3.5" aria-hidden="true" />}>
        <p>提案内容</p>
      </WorkflowSection>,
    );

    const proposalDetails = screen.getByText('待确认提案').closest('details');
    expect(proposalDetails).not.toHaveAttribute('open');

    view.rerender(
      <WorkflowSection
        title="待确认提案"
        defaultOpen
        icon={<Files className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        <p>提案内容</p>
      </WorkflowSection>,
    );

    expect(screen.getByText('待确认提案').closest('details')).toHaveAttribute('open');
  });

  it('preserves a user-toggled section state across parent rerenders', () => {
    const defaultProps = createDefaultProps();

    const view = render(
      <WorkflowPanel
        {...defaultProps}
        pendingProposal={{
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
        }}
      />,
    );

    const proposalDetails = screen.getByText('待确认提案').closest('details');
    expect(proposalDetails).toHaveAttribute('open');

    fireEvent.click(screen.getByText('待确认提案'));
    expect(proposalDetails).not.toHaveAttribute('open');

    view.rerender(
      <WorkflowPanel
        {...defaultProps}
        summary={{
          ...defaultProps.summary,
          nextSuggestion: 'Updated Suggestion',
        }}
        pendingProposal={{
          proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', content: '# 提案' }],
        }}
      />,
    );

    expect(screen.getByText(/下一步：Updated Suggestion/)).toBeInTheDocument();
    expect(screen.getByText('待确认提案').closest('details')).not.toHaveAttribute('open');
  });
});
