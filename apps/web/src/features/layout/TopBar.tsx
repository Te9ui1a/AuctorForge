import type { RefObject } from 'react';

import { ArrowLeft, Files, ListChecks, SlidersHorizontal, Sparkles } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Breadcrumbs } from './Breadcrumbs';
import { BrandMark } from './BrandMark';

export type TopBarContextRail = 'files' | 'workflow' | null;

type TopBarProps = {
  projectName: string;
  intentLabel?: string;
  stepTitle: string;
  chapterLabel?: string;
  modelStatus: string;
  activeContextRail: TopBarContextRail;
  onBack: () => void;
  onOpenSettings: () => void;
  onToggleContextRail: (panel: Exclude<TopBarContextRail, null>) => void;
  fileNavigationButtonRef?: RefObject<HTMLButtonElement | null>;
  workflowStatusButtonRef?: RefObject<HTMLButtonElement | null>;
};

export function TopBar({
  projectName,
  intentLabel,
  stepTitle,
  chapterLabel,
  modelStatus,
  activeContextRail,
  onBack,
  onOpenSettings,
  onToggleContextRail,
  fileNavigationButtonRef,
  workflowStatusButtonRef,
}: TopBarProps) {
  const isFileNavigationActive = activeContextRail === 'files';
  const isWorkflowStatusActive = activeContextRail === 'workflow';

  return (
    <section
      className="top-bar relative flex min-h-[56px] flex-col gap-1.5 overflow-hidden rounded-[var(--radius-lg)] px-3.5 py-2 sm:px-4"
      data-ui-surface="top-bar"
      data-shell-region="top-bar"
      data-shell-chrome="quiet"
      data-shell-cohesion="sunken-band"
      data-topbar-layout="compact-navigation"
      data-topbar-tone="supportive-editorial"
      data-topbar-context="project-focus"
      aria-label="工作台顶部栏"
    >
      <TooltipProvider delayDuration={180}>
        <div className="top-bar-primary-row flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="top-bar-left flex min-w-0 flex-1 items-center gap-3" data-shell-region="top-bar-primary">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="top-bar-back h-8 w-8 rounded-[var(--radius-md)] text-muted-foreground hover:text-foreground"
                  aria-label="返回"
                  data-topbar-control-style="ambient"
                  onClick={onBack}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>返回项目中心</TooltipContent>
            </Tooltip>

            <div className="top-bar-story flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5" data-shell-region="top-bar-story" data-topbar-layout="continuous">
              <div
                className="top-bar-system flex min-w-0 items-center gap-2.5"
                data-shell-region="top-bar-project"
                data-context-tone="embedded"
              >
                <BrandMark compact />
                <div className="top-bar-project-meta min-w-0">
                  <span className="top-bar-project truncate">{projectName}</span>
                </div>
              </div>

              <div className="top-bar-context min-w-0 flex-1" data-shell-region="top-bar-context">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="top-bar-story-kicker">继续</span>
                  <span className="top-bar-story-divider" aria-hidden="true">/</span>
                  <Breadcrumbs items={[stepTitle, ...(chapterLabel ? [chapterLabel] : [])]} />
                </div>
                {intentLabel ? (
                  <div
                    className="top-bar-intent mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"
                    data-ui-intent-weight="supporting"
                  >
                    <Sparkles className="h-3 w-3 text-primary/90" aria-hidden="true" />
                    <span>{intentLabel}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="top-bar-right ml-auto flex items-center gap-1.5">
            <Badge
              variant="muted"
              className="top-bar-chip h-7 rounded-[var(--radius-sm)] px-2 py-0 text-[10px] font-medium text-secondary-foreground"
              data-topbar-chip-style="muted"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {modelStatus}
            </Badge>
            <div
              className="top-bar-controls flex items-center gap-1.5"
              data-shell-region="top-bar-controls"
              data-control-density="quiet"
              role="toolbar"
              aria-label="工作台控制区"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={isFileNavigationActive ? '关闭文稿导航' : '打开文稿导航'}
                    aria-controls="workbench-context-rail"
                    aria-expanded={isFileNavigationActive}
                    className="top-bar-context-rail-control h-8 rounded-[var(--radius-md)] px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    data-topbar-control-style="ambient"
                    data-context-rail-control="files"
                    data-active={isFileNavigationActive}
                    onClick={() => onToggleContextRail('files')}
                    ref={fileNavigationButtonRef}
                  >
                    <Files className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>文稿</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFileNavigationActive ? '关闭文稿导航' : '打开文稿导航'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={isWorkflowStatusActive ? '关闭流程状态' : '打开流程状态'}
                    aria-controls="workbench-context-rail"
                    aria-expanded={isWorkflowStatusActive}
                    className="top-bar-context-rail-control h-8 rounded-[var(--radius-md)] px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    data-topbar-control-style="ambient"
                    data-context-rail-control="workflow"
                    data-active={isWorkflowStatusActive}
                    onClick={() => onToggleContextRail('workflow')}
                    ref={workflowStatusButtonRef}
                  >
                    <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>流程</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isWorkflowStatusActive ? '关闭流程状态' : '打开流程状态'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="模型配置"
                    className="settings-trigger settings-trigger--icon-only h-8 w-8 rounded-[var(--radius-md)] text-muted-foreground hover:text-foreground"
                    data-topbar-control-style="ambient"
                    onClick={onOpenSettings}
                  >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>打开模型配置</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </section>
  );
}
