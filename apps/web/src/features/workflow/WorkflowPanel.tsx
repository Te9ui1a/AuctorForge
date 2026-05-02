import { useEffect, useRef, useState, type RefObject } from 'react';

import { ChevronDown, ChevronLeft, ChevronRight, CircleDot, Files, FolderSearch, PencilLine, Sparkles, X } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { cn } from '../../lib/utils';
import type { PendingDecision, PendingProposal, SessionResponse, WorkflowProgressSummary } from './types';
import { formatWriteTargetLabel, selectNextWriteTarget } from './writeTarget';

function formatChapterLabel(chapterNumber: number) {
  return `第${chapterNumber.toString().padStart(3, '0')}章`;
}

function formatInteractionMode(mode?: string) {
  switch (mode) {
    case 'discussion':
      return '讨论中';
    case 'decision':
      return '等待决定';
    case 'proposal':
      return '等待确认提案';
    default:
      return mode || '未知';
  }
}

type WorkflowPanelProps = {
  session: SessionResponse | null;
  summary: WorkflowProgressSummary;
  workflowSummary?: {
    currentDocumentLabel: string;
    continuityFlow: string;
    continuityFlowLabel: string;
    pendingState: string;
    pendingStateLabel: string;
    nextTargetLabel: string;
    nextSuggestion: string;
    nextTargetPath: string;
  };
  requiredProjectReads: string[];
  allowedWrites: string[];
  strictWorkflowWrites?: string[];
  chatAllowedWrites?: string[];
  manualWritablePaths?: string[];
  pendingDecision?: PendingDecision | null;
  pendingProposal?: PendingProposal | null;
  hidden?: boolean;
  collapsed: boolean;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
  onToggleCollapse: () => void;
};

export function WorkflowPanel({
  session,
  summary,
  workflowSummary,
  requiredProjectReads,
  allowedWrites,
  strictWorkflowWrites,
  chatAllowedWrites,
  manualWritablePaths,
  pendingDecision,
  pendingProposal,
  hidden = false,
  collapsed,
  closeButtonRef,
  onClose,
  onToggleCollapse,
}: WorkflowPanelProps) {
  const strictTargets = strictWorkflowWrites ?? allowedWrites;
  const flexibleTargets = Array.from(
    new Set([...(chatAllowedWrites ?? []), ...(manualWritablePaths ?? allowedWrites)]),
  );
  const editableTargets = flexibleTargets.filter((path) => !strictTargets.includes(path));
  const toolFocus = summary.callableModules.join(' / ') || '暂无';
  const proposalTarget = pendingProposal?.proposedWrites[0]?.path ?? '';
  const nextWritePath = selectNextWriteTarget({
    proposalTarget,
    strictTargets,
    flexibleTargets: editableTargets,
  });
  const nextWriteKind = proposalTarget
    ? 'proposal-target'
    : strictTargets[0]
      ? 'strict-target'
      : editableTargets[0]
        ? 'flexible-target'
        : 'none';
  const blockingType = pendingProposal
    ? 'proposal'
    : pendingDecision
      ? 'decision'
      : requiredProjectReads[0]
        ? 'reads'
        : 'clear';
  const blockingLabel = pendingProposal
    ? '先确认当前提案后再继续写入。'
    : pendingDecision
      ? '先在聊天中完成这一步决定。'
    : requiredProjectReads[0]
      ? `动笔前先阅读：${requiredProjectReads[0]}`
      : '当前没有阻塞，可以继续推进。';
  const summaryOverview = [summary.phase, summary.coreTask].filter(Boolean).join(' · ');
  const summaryNextLabel = summary.nextSuggestion ? `下一步：${summary.nextSuggestion}` : '';
  const nextTargetLabel = nextWritePath ? formatWriteTargetLabel(nextWritePath) : '';
  const showToolFocus = summary.callableModules.length > 0;
  const showWorkflowSummary = Boolean(workflowSummary);
  const memorySummary = summary.memorySummary;
  const panelState = hidden ? 'hidden' : collapsed ? 'collapsed' : 'expanded';

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--ui-surface-border)] bg-[image:var(--ui-surface-background)] text-[color:var(--ui-surface-foreground)] shadow-[var(--ui-surface-shadow)] backdrop-blur-xl',
          collapsed ? 'items-center' : '',
        )}
        aria-label="流程状态侧栏"
        aria-hidden={hidden}
        data-ui-surface="workflow-rail"
        data-shell-region="workflow-rail"
        data-shell-role="supporting-guidance"
        data-panel-state={panelState}
        data-workflow-layout="guidance-rail"
        data-workflow-tone="quiet-support"
        hidden={hidden}
      >
          <div
            className={cn(
              'flex items-start justify-between gap-3 border-b border-[color:var(--ui-rail-divider)] px-4 py-4',
              collapsed ? 'w-full flex-col items-center gap-2 px-2.5' : 'w-full',
            )}
            data-shell-region="workflow-header"
            data-workflow-header="quiet-support"
          >
              <div className={cn('space-y-1', collapsed ? 'text-center' : '')}>
                {!collapsed ? (
                  <div className="workflow-rail-kicker inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em]">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    贴边提示
                  </div>
                ) : null}
              <div className="space-y-1">
                <h2 className="m-0 text-sm font-semibold text-foreground">流程状态</h2>
                {!collapsed ? <p className="m-0 max-w-[24ch] text-xs leading-5 text-[color:var(--ui-workflow-rail-helper)]">阶段、参考与待确认项，都收在这里。</p> : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-[var(--radius-md)] border border-[color:var(--ui-workflow-control-border)] bg-[color:var(--ui-workflow-control-surface)] text-[color:var(--ui-workflow-control-foreground)] shadow-none hover:bg-[color:var(--ui-workflow-control-hover-surface)] hover:text-[color:var(--ui-workflow-control-hover-foreground)]"
                    aria-label={collapsed ? '展开流程状态栏' : '折叠流程状态栏'}
                    data-workflow-control-style="ambient"
                    onClick={onToggleCollapse}
                  >
                    {collapsed ? <ChevronLeft className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{collapsed ? '展开流程状态栏' : '折叠流程状态栏'}</TooltipContent>
              </Tooltip>
              {onClose ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      ref={closeButtonRef}
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-[var(--radius-md)] border border-[color:var(--ui-workflow-control-border)] bg-[color:var(--ui-workflow-control-surface)] text-[color:var(--ui-workflow-control-foreground)] shadow-none hover:bg-[color:var(--ui-workflow-control-hover-surface)] hover:text-[color:var(--ui-workflow-control-hover-foreground)]"
                      aria-label="关闭流程状态"
                      data-workflow-control-style="ambient"
                      onClick={onClose}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>关闭流程状态</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
        </div>
          <div
            className={cn('flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 pb-4 pt-3', collapsed || hidden ? 'hidden' : '')}
            data-shell-region="workflow-body"
            data-workflow-body="support-flow"
            hidden={collapsed || hidden}
            aria-hidden={collapsed || hidden}
          >
            <section
              className="border-b border-[color:var(--ui-rail-divider)] pb-4"
              data-workflow-section="hero"
              data-shell-region="workflow-hero"
              data-workflow-card="support-context"
            >
              <div className="space-y-3">
                {showWorkflowSummary ? (
                  <div
                    className="grid gap-1.5 text-[11px] text-[color:var(--ui-workflow-guide-value)]"
                    data-workflow-summary="inline-context"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--ui-workflow-rail-caption)]">
                      <span>{workflowSummary?.continuityFlowLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{workflowSummary?.pendingStateLabel}</span>
                    </div>
                    <p className="m-0">{workflowSummary?.currentDocumentLabel}</p>
                    <p className="m-0">下一目标：{nextTargetLabel || workflowSummary?.nextTargetLabel}</p>
                    <p className="m-0">下一步：{workflowSummary?.nextSuggestion}</p>
                    {workflowSummary?.nextTargetPath && workflowSummary.nextTargetPath !== nextTargetLabel && workflowSummary.nextTargetPath !== workflowSummary.nextTargetLabel ? (
                      <p className="m-0 text-xs text-[color:var(--ui-workflow-rail-caption)]">{workflowSummary.nextTargetPath}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="workflow-hero-kicker inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--ui-workflow-rail-caption)]">
                      <CircleDot className="h-3 w-3" aria-hidden="true" />
                      当前节点
                    </div>
                    <h3 className="m-0 text-base font-semibold text-foreground">{session?.currentStepTitle ?? '等待初始化'}</h3>
                    {session?.currentChapterNumber ? <p className="m-0 text-xs text-[color:var(--ui-workflow-rail-caption)]">当前章节：{formatChapterLabel(session.currentChapterNumber)}</p> : null}
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-[var(--radius-sm)] border-[color:var(--ui-workflow-status-border)] bg-[color:var(--ui-workflow-status-surface)] px-2.5 py-1 text-[11px] text-[color:var(--ui-workflow-status-foreground)] shadow-none"
                    data-workflow-status-style="ambient"
                  >
                    {formatInteractionMode(session?.interactionMode)}
                  </Badge>
                </div>

                <div className="grid gap-1.5 text-sm text-[color:var(--ui-workflow-guide-value)]" data-workflow-summary="compact">
                  <p className="m-0">{summaryOverview || '暂无流程摘要'}</p>
                  {summaryNextLabel ? <p className="m-0">{summaryNextLabel}</p> : null}
                  {showToolFocus ? <p className="m-0 text-xs text-[color:var(--ui-workflow-rail-caption)]">工具：{toolFocus}</p> : null}
                </div>

                {memorySummary ? (
                  <div className="grid gap-1.5 text-xs text-[color:var(--ui-workflow-rail-caption)]" data-workflow-summary="memory">
                    <p className="m-0">记忆：{memorySummary.chapterCount} 章，最新第{memorySummary.latestChapter?.toString().padStart(3, '0') ?? '---'}章</p>
                    <p className="m-0">伏笔：{memorySummary.unresolvedHookCount}，警告：{memorySummary.latestWarningCount}</p>
                  </div>
                ) : null}

                <section
                  className="workflow-action-guide grid gap-2"
                  data-workflow-section="actionable-guidance"
                  data-workflow-guidance-state={blockingType === 'clear' ? 'clear' : 'blocked'}
                  data-workflow-guidance-tone="support-rail"
                >
                  <div className="workflow-action-item" data-workflow-action="blocking" data-workflow-blocking={blockingType}>
                    <span className="workflow-action-label">先处理</span>
                    <p className="workflow-action-value">{blockingLabel}</p>
                  </div>
                  <div className="workflow-action-item" data-workflow-action="next-write" data-workflow-target-kind={nextWriteKind}>
                    <span className="workflow-action-label">落笔处</span>
                    <p className="workflow-action-value">{nextWritePath || '暂无明确写入目标'}</p>
                  </div>
                </section>
              </div>
            </section>

            <WorkflowSection title="关键资产" icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}>
              {summary.assetPointers?.length ? (
                <ul aria-label="关键资产列表" className="m-0 list-none space-y-3 p-0 text-sm text-secondary-foreground">
                  {summary.assetPointers.map((pointer) => (
                    <li key={`${pointer.section}-${pointer.label}`} className="workflow-pointer">
                      <p className="workflow-pointer-label m-0 text-sm text-foreground">关键资产：{pointer.label}</p>
                       <code
                         className="workflow-pointer-path mt-2 inline-flex rounded-[var(--radius-sm)] border border-[color:var(--ui-workflow-pointer-border)] bg-[color:var(--ui-workflow-pointer-surface)] px-2.5 py-1 text-[11px] text-[color:var(--ui-workflow-pointer-foreground)]"
                         data-workflow-pointer-style="ambient"
                       >
                         {pointer.path}
                       </code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="workflow-empty m-0 text-sm text-muted-foreground">暂无</p>
              )}
            </WorkflowSection>

            <WorkflowSection title="参考文件" icon={<FolderSearch className="h-3.5 w-3.5" aria-hidden="true" />}>
              {requiredProjectReads.length > 0 ? (
                <ul className="m-0 space-y-2 pl-4 text-sm text-secondary-foreground">
                  {requiredProjectReads.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="workflow-empty m-0 text-sm text-muted-foreground">暂无</p>
              )}
            </WorkflowSection>

            <WorkflowSection title="写入范围" icon={<PencilLine className="h-3.5 w-3.5" aria-hidden="true" />}>
              {strictTargets.length > 0 ? (
                <div data-workflow-scope="strict">
                  <h4 className="m-0 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">当前流程目标</h4>
                  <ul className="m-0 mt-2 space-y-2 pl-4 text-sm text-secondary-foreground">
                    {strictTargets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              {editableTargets.length > 0 ? (
                <div data-workflow-scope="flexible">
                  <h4 className={cn('m-0 text-[11px] uppercase tracking-[0.12em] text-muted-foreground', strictTargets.length > 0 ? 'pt-3' : '')}>可自由编辑/对话修改</h4>
                  <ul className="m-0 mt-2 space-y-2 pl-4 text-sm text-secondary-foreground">
                    {editableTargets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              {strictTargets.length === 0 && editableTargets.length === 0 ? (
                <p className="workflow-empty m-0 text-sm text-muted-foreground">暂无</p>
              ) : null}
            </WorkflowSection>

            {pendingDecision && !pendingProposal ? (
              <WorkflowSection title="需要决定" tone="decision" defaultOpen icon={<Files className="h-3.5 w-3.5" aria-hidden="true" />}>
                <p className="m-0 text-sm leading-6 text-secondary-foreground">{pendingDecision.reply || '请在聊天中回复以继续。'}</p>
              </WorkflowSection>
            ) : null}

            {pendingProposal ? (
              <WorkflowSection title="待确认提案" tone="proposal" defaultOpen icon={<Files className="h-3.5 w-3.5" aria-hidden="true" />}>
                <p className="m-0 text-sm leading-6 text-secondary-foreground">发送“确认”后会把以下文件写入当前项目。</p>
                <ul className="m-0 mt-3 space-y-2 pl-4 text-sm text-secondary-foreground">
                  {pendingProposal.proposedWrites.map((write) => (
                    <li key={write.path}>{write.path}</li>
                  ))}
                </ul>
              </WorkflowSection>
            ) : null}
          </div>
      </aside>
    </TooltipProvider>
  );
}

type WorkflowSectionProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon: React.ReactNode;
  title: string;
  tone?: 'decision' | 'proposal';
};

export function WorkflowSection({ children, defaultOpen = false, icon, title, tone }: WorkflowSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const previousDefaultOpenRef = useRef(defaultOpen);

  useEffect(() => {
    if (!previousDefaultOpenRef.current && defaultOpen) {
      setIsOpen(true);
    }

    previousDefaultOpenRef.current = defaultOpen;
  }, [defaultOpen]);

  return (
    <details
      className="workflow-group border-t border-[color:var(--ui-rail-divider)] py-1"
      data-workflow-section="details"
      data-workflow-card="context-fold"
      data-workflow-disclosure-style="ambient-support"
      data-workflow-tone={tone}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-[13px] font-medium text-[color:var(--ui-workflow-fold-foreground)]"
        data-workflow-summary-style="ambient"
      >
        <span className="inline-flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </span>
        <ChevronDown className="workflow-summary-chevron h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </summary>
      <div className="space-y-3 pl-5 pr-1 pb-3 text-sm text-[color:var(--ui-workflow-fold-foreground)]">{children}</div>
    </details>
  );
}
