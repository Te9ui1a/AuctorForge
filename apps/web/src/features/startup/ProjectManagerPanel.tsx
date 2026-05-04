import { FolderTree } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { ProjectInfo } from './projectTypes';
import { getProjectStatusLabel, ProjectCard } from './ProjectCard';
import { StartupGlyph } from './StartupGlyph';

interface ProjectManagerPanelProps {
  projects: ProjectInfo[];
  onSelectProject: (project: ProjectInfo) => void;
  selectedProjectId?: string;
  managementMode?: boolean;
  title?: string;
  subtitle?: string;
  variant?: 'recent' | 'management';
  onContinueProject?: (project: ProjectInfo) => void;
  onRepairProject?: (project: ProjectInfo) => void;
  onToggleArchiveProject?: (project: ProjectInfo) => void;
  onRemoveProject?: (project: ProjectInfo) => void;
}

type ProjectManagerPanelVariant = 'recent' | 'management';

export function ProjectManagerPanel({
  projects,
  onSelectProject,
  selectedProjectId,
  managementMode,
  title,
  subtitle,
  variant,
  onContinueProject,
  onRepairProject,
  onToggleArchiveProject,
  onRemoveProject,
}: ProjectManagerPanelProps) {
  const resolvedVariant: ProjectManagerPanelVariant = variant ?? (managementMode ? 'management' : 'recent');
  const isManagementVariant = resolvedVariant === 'management';
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectStatusLabel = selectedProject ? getProjectStatusLabel(selectedProject.status) : null;
  const isRecentVariant = resolvedVariant === 'recent';
  const [statusDialogProjectId, setStatusDialogProjectId] = useState<string | null>(null);
  const isStatusDialogOpen = Boolean(selectedProject && statusDialogProjectId === selectedProject.id);
  const [pendingRemovalProjectId, setPendingRemovalProjectId] = useState<string | null>(null);
  const isRemovalPending = Boolean(selectedProject && pendingRemovalProjectId === selectedProject.id);

  useEffect(() => {
    setPendingRemovalProjectId(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProject) {
      setStatusDialogProjectId(null);
    }
  }, [selectedProject]);

  return (
    <div
      className="startup-project-manager flex min-h-0 flex-col gap-5"
      data-entry-surface="project-manager"
      data-project-manager-variant={resolvedVariant}
    >
      <div className="startup-project-manager-heading grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-[1.65rem]">
          {title ?? (isManagementVariant ? '项目管理' : '最近项目')}
        </h2>
        {subtitle ? <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div
        data-project-manager-layout={isRecentVariant ? 'editorial-stack' : 'editorial-grid'}
        className={cn(
          'startup-project-manager-list min-h-0 overflow-auto pr-1',
          isRecentVariant ? 'grid gap-3' : 'grid max-h-[420px] gap-4 md:grid-cols-2 xl:grid-cols-2',
        )}
      >
        {projects.length === 0 ? (
          <div
            className={cn(
              'startup-project-manager-empty text-sm text-muted-foreground',
              isRecentVariant
                ? 'rounded-[var(--radius-md)] border border-dashed border-border/35 bg-background/16 px-5 py-6'
                : 'rounded-[var(--radius-md)] border border-dashed border-border/50 bg-background/25 px-6 py-10 text-center',
            )}
          >
            暂无项目
          </div>
        ) : (
          projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => {
                onSelectProject(project);
                if (isManagementVariant) {
                  setStatusDialogProjectId(project.id);
                }
              }}
              onContinue={isRecentVariant ? () => onContinueProject?.(project) : undefined}
              isSelected={project.id === selectedProjectId}
              variant={resolvedVariant}
            />
          ))
        )}
      </div>

      {isManagementVariant && selectedProject ? (
        <Dialog
          open={isStatusDialogOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setStatusDialogProjectId(null);
              setPendingRemovalProjectId(null);
            }
          }}
        >
          <DialogContent
            aria-modal="true"
            className="startup-project-status-dialog max-h-[min(720px,calc(100vh-2rem))] w-[min(100%-2rem,42rem)] overflow-auto"
            data-entry-surface="project-status-dialog"
          >
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-3 pr-8">
                <DialogTitle>{selectedProject.name}</DialogTitle>
                <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {selectedProjectStatusLabel}
                </Badge>
              </div>
              <DialogDescription>查看项目状态，进入项目，或执行维护操作。</DialogDescription>
            </DialogHeader>

            <div className="grid gap-5">
              <div className="grid gap-3 text-sm text-muted-foreground">
                {selectedProject.rootPath ? (
                  <div className="inline-flex items-start gap-2 rounded-[var(--radius-md)] border border-border/25 bg-background/20 px-3 py-2 text-xs">
                    <FolderTree className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="break-all">{selectedProject.rootPath}</span>
                  </div>
                ) : null}
                {selectedProject.phase ? <span>阶段：{selectedProject.phase}</span> : null}
                {selectedProject.coreTask ? <span>任务：{selectedProject.coreTask}</span> : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  data-management-action="enter"
                  className="justify-start rounded-[var(--radius-md)] px-4 shadow-none"
                  onClick={() => onContinueProject?.(selectedProject)}
                >
                  <StartupGlyph name="enter" />
                  进入项目
                </Button>
                <Button
                  variant="secondary"
                  data-management-action="repair"
                  className="justify-start rounded-[var(--radius-md)] px-4 shadow-none"
                  onClick={() => onRepairProject?.(selectedProject)}
                >
                  <StartupGlyph name="repair" />
                  修复项目
                </Button>
                <Button
                  variant="secondary"
                  data-management-action="archive"
                  className={cn(
                    'justify-start rounded-[var(--radius-md)] px-4 shadow-none',
                    selectedProject.status === 'archived' ? 'bg-primary/15 text-primary hover:bg-primary/20' : undefined,
                  )}
                  onClick={() => onToggleArchiveProject?.(selectedProject)}
                >
                  <StartupGlyph name="archive" />
                  {selectedProject.status === 'archived' ? '取消归档' : '归档项目'}
                </Button>
              </div>

              <Button
                variant="destructive"
                data-management-action="remove"
                className="justify-start rounded-[var(--radius-md)] px-4 shadow-none"
                onClick={() => setPendingRemovalProjectId(selectedProject.id)}
              >
                <StartupGlyph name="remove" />
                从列表移除
              </Button>
              {isRemovalPending ? (
                <div className="grid gap-3 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground" role="group" aria-label="移除项目确认">
                  <p className="m-0 text-muted-foreground">确认要将“{selectedProject.name}”从列表移除吗？项目文件不会被删除。</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-[var(--radius-md)] px-4 shadow-none"
                      onClick={() => setPendingRemovalProjectId(null)}
                    >
                      取消移除
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="rounded-[var(--radius-md)] px-4 shadow-none"
                      onClick={() => onRemoveProject?.(selectedProject)}
                    >
                      确认移除
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
