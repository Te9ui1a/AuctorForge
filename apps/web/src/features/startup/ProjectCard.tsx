import { ArrowRight, Clock3, FolderTree } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { ProjectInfo, ProjectStatus } from './projectTypes';

interface ProjectCardProps {
  project: ProjectInfo;
  onClick: () => void;
  isSelected?: boolean;
  variant?: 'recent' | 'management';
  onContinue?: () => void;
}

export const projectStatusLabels: Record<ProjectStatus, string> = {
  active: '活跃',
  archived: '已归档',
  'needs-repair': '需修复',
  'missing-path': '路径丢失',
  uninitialized: '未初始化',
};

export function getProjectStatusLabel(status: ProjectStatus) {
  return projectStatusLabels[status];
}

const projectStatusMeta: Record<ProjectStatus, { label: string; className: string }> = {
  active: {
    label: projectStatusLabels.active,
    className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
  },
  archived: {
    label: projectStatusLabels.archived,
    className: 'border-border/70 bg-muted/50 text-muted-foreground',
  },
  'needs-repair': {
    label: projectStatusLabels['needs-repair'],
    className: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
  },
  'missing-path': {
    label: projectStatusLabels['missing-path'],
    className: 'border-rose-400/25 bg-rose-500/10 text-rose-100',
  },
  uninitialized: {
    label: projectStatusLabels.uninitialized,
    className: 'border-slate-300/15 bg-slate-400/10 text-slate-200',
  },
};

export function ProjectCard({ project, onClick, isSelected, variant = 'recent', onContinue }: ProjectCardProps) {
  const date = new Date(project.lastModified);
  const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const statusMeta = projectStatusMeta[project.status];
  const surfaceClassName = cn(
    'group relative w-full overflow-hidden border text-left transition-all duration-200',
    variant === 'recent'
      ? 'rounded-[var(--radius-md)] border-white/10 bg-white/[0.018] p-3 shadow-none hover:border-white/16 hover:bg-white/[0.035]'
      : 'rounded-[var(--radius-md)] border-border/45 bg-background/35 p-4 shadow-none hover:border-border/65 hover:bg-background/50',
    isSelected ? 'border-primary/45 bg-primary/10 ring-1 ring-primary/25 shadow-none' : '',
  );

  const cardBody = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <strong className="block break-all text-base font-semibold leading-6 text-foreground">{project.name}</strong>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              最后修改: {formattedDate}
            </span>
          </div>
        </div>
        <Badge variant="outline" className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium', statusMeta.className)}>
          {statusMeta.label}
        </Badge>
      </div>

      {variant === 'management' && project.rootPath ? (
        <div className="inline-flex items-start gap-2 rounded-[var(--radius-md)] border border-border/25 bg-background/20 px-3 py-2 text-xs text-muted-foreground">
          <FolderTree className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{project.rootPath}</span>
        </div>
      ) : null}

      {project.phase || project.coreTask ? (
        <div className="grid gap-1 rounded-[var(--radius-md)] border border-border/25 bg-background/16 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {project.phase ? <span>{project.phase}</span> : null}
          {project.coreTask ? <span>{project.coreTask}</span> : null}
        </div>
      ) : null}
    </>
  );

  if (variant === 'recent') {
    return (
      <article
        data-entry-surface="project-card"
        data-project-state={isSelected ? 'selected' : 'idle'}
        data-project-variant={variant}
        className={cn(surfaceClassName, 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center')}
      >
        <button
          type="button"
          className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-md)] px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClick}
          aria-label={`选择项目 ${project.name}`}
        >
          {cardBody}
        </button>
        <Button
          variant="secondary"
          size="sm"
          className="h-10 w-full rounded-[var(--radius-md)] px-4 shadow-none lg:w-auto lg:self-center"
          aria-label={`选择并继续 ${project.name}`}
          onClick={() => (onContinue ?? onClick)()}
        >
          选择并继续
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </article>
    );
  }

  return (
    <button
      type="button"
      data-entry-surface="project-card"
      data-project-state={isSelected ? 'selected' : 'idle'}
      data-project-variant={variant}
      className={cn(surfaceClassName, 'flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring')}
      onClick={onClick}
    >
      {cardBody}
      <span className="text-xs font-medium text-muted-foreground">查看项目详情与维护操作</span>
    </button>
  );
}
