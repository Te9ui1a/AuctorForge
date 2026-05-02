import { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { SettingsGlyph } from '../layout/SettingsGlyph';
import { ProjectInfo } from './projectTypes';
import { archiveProject, createProject, fetchRecentProjects, importProject, pickProjectFolder, removeProject, repairProject } from './projectApi';
import { ProjectManagerPanel } from './ProjectManagerPanel';
import { StartupBrandMark } from './StartupBrandMark';
import { StartupGlyph } from './StartupGlyph';
import { StartupProductPreview } from './StartupProductPreview';

type StartupMode = 'create' | 'analyze';
const FOLDER_PICKER_TIMEOUT_MS = 12_000;

type StartupScreenProps = {
  onStart: (mode: StartupMode, projectId?: string) => void | Promise<void>;
  onOpenSettings: () => void;
  isStarting: boolean;
  selectedProjectId?: string;
  onSelectProjectId?: (projectId?: string) => void;
  isManagerOpen?: boolean;
  onManagerOpenChange?: (isOpen: boolean) => void;
};

const modeCards: Array<{
  mode: StartupMode;
  title: string;
  description: string;
  details: string;
}> = [
  {
    mode: 'create',
    title: '从一个想法开始',
    description: '从一句灵感、一个角色、一个场景出发，逐步长成完整作品。',
    details: '适合从零开始、建立新世界',
  },
  {
    mode: 'analyze',
    title: '先分析参考，再建立自己的写法',
    description: '先看清结构和节奏，再进入你自己的长篇创作流程。',
    details: '适合拆样、建立写作方法',
  },
];

export function StartupScreen({
  onStart,
  onOpenSettings,
  isStarting,
  selectedProjectId: controlledSelectedProjectId,
  onSelectProjectId,
  isManagerOpen: controlledIsManagerOpen,
  onManagerOpenChange,
}: StartupScreenProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [internalSelectedProjectId, setInternalSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectError, setProjectError] = useState('');
  const [internalIsManagerOpen, setInternalIsManagerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'create' | 'import' | null>(null);
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [draftRootPath, setDraftRootPath] = useState('');
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const selectedProjectId = controlledSelectedProjectId ?? internalSelectedProjectId;
  const isManagerOpen = controlledIsManagerOpen ?? internalIsManagerOpen;

  const updateSelectedProjectId = (projectId: string | null) => {
    if (controlledSelectedProjectId === undefined) {
      setInternalSelectedProjectId(projectId);
    }

    onSelectProjectId?.(projectId ?? undefined);
  };

  const updateManagerOpen = (isOpen: boolean) => {
    if (controlledIsManagerOpen === undefined) {
      setInternalIsManagerOpen(isOpen);
    }

    onManagerOpenChange?.(isOpen);
  };

  useEffect(() => {
    let isMounted = true;
    const loadProjects = async () => {
      try {
        setIsLoading(true);
        const data = await fetchRecentProjects();
        if (isMounted) {
          setProjectError('');
          setProjects(prev => {
            const existingIds = new Set(data.map(p => p.id));
            const newlyCreated = prev.filter(p => !existingIds.has(p.id));
            return [...newlyCreated, ...data];
          });
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
        if (isMounted) {
          setProjectError('项目列表加载失败，请稍后重试。');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadProjects();
    return () => { isMounted = false; };
  }, []);

  const resetDraft = () => {
    setDraftDisplayName('');
    setDraftRootPath('');
    setPickerMode(null);
  };

  const openCreateSheet = () => {
    setPickerMode('create');
    setDraftDisplayName('');
    setDraftRootPath('');
  };

  const openImportSheet = () => {
    setPickerMode('import');
    setDraftDisplayName('');
    setDraftRootPath('');
  };

  const handlePickFolder = async () => {
    if (!pickerMode) return;

    try {
      setIsPickingFolder(true);
      const picked = await withTimeout(
        pickProjectFolder({
          purpose: pickerMode,
          defaultPath: draftRootPath || undefined,
        }),
        FOLDER_PICKER_TIMEOUT_MS,
      );
      if (!picked) {
        return;
      }
      setDraftRootPath(picked);
      if (pickerMode === 'create' && !draftDisplayName) {
        const pieces = picked.split('/').filter(Boolean);
        setDraftDisplayName(pieces[pieces.length - 1] ?? '未命名项目');
      }
      setProjectError('');
    } catch (error) {
      console.error('Failed to pick folder:', error);
      setProjectError(error instanceof FolderPickerTimeoutError
        ? '文件夹选择器响应超时，请手动输入项目目录。'
        : '打开文件夹选择器失败，请手动输入项目目录。');
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleSubmitProject = async () => {
    if (!pickerMode || !draftRootPath.trim()) {
      setProjectError('请先选择项目文件夹。');
      return;
    }

    try {
      setIsSubmittingProject(true);
      const project = pickerMode === 'create'
        ? await createProject({
          displayName: draftDisplayName.trim() || '未命名项目',
          rootPath: draftRootPath.trim(),
          entryMode: 'create',
        })
        : await importProject({
          rootPath: draftRootPath.trim(),
          displayName: draftDisplayName.trim() || undefined,
          entryMode: 'create',
        });

      setProjects((prev) => [project, ...prev.filter((entry) => entry.id !== project.id)]);
      updateSelectedProjectId(project.id);
      setProjectError('');
      resetDraft();
      await onStart('create', project.id);
    } catch (error) {
      console.error(`Failed to ${pickerMode} project:`, error);
      setProjectError(pickerMode === 'create' ? '新建项目失败，请稍后重试。' : '导入项目失败，请稍后重试。');
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const handleRepairProject = async (project: ProjectInfo) => {
    try {
      const repairedProject = await repairProject(project.id);
      setProjects((prev) => prev.map((entry) => (entry.id === repairedProject.id ? repairedProject : entry)));
      updateSelectedProjectId(repairedProject.id);
      setProjectError('');
    } catch (error) {
      console.error('Failed to repair project:', error);
      setProjectError('修复项目失败，请稍后重试。');
    }
  };

  const handleToggleArchiveProject = async (project: ProjectInfo) => {
    try {
      const nextArchived = project.status !== 'archived';
      const updatedProject = await archiveProject(project.id, nextArchived);
      if (updatedProject) {
        setProjects((prev) => prev.map((entry) => (entry.id === updatedProject.id ? updatedProject : entry)));
      }
      setProjectError('');
    } catch (error) {
      console.error('Failed to archive project:', error);
      setProjectError('更新项目状态失败，请稍后重试。');
    }
  };

  const handleRemoveProject = async (project: ProjectInfo) => {
    try {
      await removeProject(project.id);
      setProjects((prev) => prev.filter((entry) => entry.id !== project.id));
      if (selectedProjectId === project.id) {
        updateSelectedProjectId(null);
      }
      setProjectError('');
    } catch (error) {
      console.error('Failed to remove project:', error);
      setProjectError('移除项目失败，请稍后重试。');
    }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId) || null;
  const isCreateSheet = pickerMode === 'create';
  const displayNameFieldId = isCreateSheet ? 'startup-create-display-name' : 'startup-import-display-name';

  useEffect(() => {
    const rootElement = document.getElementById('root');
    rootElement?.classList.add('startup-entry-root');

    return () => {
      rootElement?.classList.remove('startup-entry-root');
    };
  }, []);

  const showRecentProjects = () => {
    updateManagerOpen(false);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const recentProjectsElement = document.getElementById('startup-recent-projects');
        if (typeof recentProjectsElement?.scrollIntoView === 'function') {
          recentProjectsElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      });
    }
  };

  const toggleManagementPanel = () => {
    const shouldOpenManager = !isManagerOpen;
    updateManagerOpen(shouldOpenManager);
    if (shouldOpenManager && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const managementPanelElement = document.getElementById('startup-management-panel');
        if (typeof managementPanelElement?.scrollIntoView === 'function') {
          managementPanelElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      });
    }
  };

  return (
    <div
      className="startup-shell text-foreground"
      data-ui-layer="entry"
      data-ui-surface="entry"
      data-homepage-flow="editorial-launcher"
      data-homepage-layout="two-stage-entry"
      data-homepage-density="breathing"
    >
      <header className="startup-top-nav" data-entry-surface="top-nav" data-nav-behavior="editorial-launcher-nav">
        <div className="startup-top-nav-brand">
          <StartupBrandMark compact />
          <div className="startup-top-nav-copy">
            <strong>AuctorForge</strong>
            <span>为长篇创作设计的 AI 工作流</span>
          </div>
        </div>
        <nav className="startup-top-nav-links" aria-label="首页导航">
          <Button variant="ghost" size="sm" className="startup-nav-link startup-nav-link--button px-4 text-xs sm:text-sm" onClick={showRecentProjects}>
            最近项目
          </Button>
          <Button variant="ghost" size="sm" className="startup-nav-link startup-nav-link--button px-4 text-xs sm:text-sm" aria-expanded={isManagerOpen} aria-controls="startup-management-panel" onClick={toggleManagementPanel}>
            <StartupGlyph name="panels" />
            管理项目
          </Button>
          <Button variant="ghost" size="sm" className="startup-nav-settings rounded-[var(--radius-md)] px-4 text-xs sm:text-sm" onClick={onOpenSettings}>
            <span className="settings-trigger-icon"><SettingsGlyph /></span>
            模型配置
          </Button>
        </nav>
      </header>

      <section
        className="startup-hero"
        data-entry-surface="hero"
        data-entry-tone="editorial"
        data-launcher-style="quiet-workbench"
        data-homepage-stage="primary-entry"
      >
        <div className="startup-hero-layout" data-hero-layout="editorial-stack">
          <div className="startup-hero-copy" data-entry-surface="hero-copy" data-hero-surface="copy">
            <h2 className="startup-subtitle">AuctorForge</h2>
            <h1>开始写你的长篇小说</h1>
            <p className="startup-hero-description">
              新建、导入，或者继续上次的项目。
            </p>
            <div className="startup-hero-actions">
              <Button size="lg" className="rounded-[var(--radius-md)] px-5 shadow-none" onClick={openCreateSheet} disabled={isStarting}>
                <StartupGlyph name="spark" />
                开始一个新故事
              </Button>
              <Button variant="secondary" size="lg" className="rounded-[var(--radius-md)] px-5 shadow-none" onClick={openImportSheet} disabled={isStarting}>
                <StartupGlyph name="upload" />
                导入旧稿继续写
              </Button>
            </div>
          </div>
          <StartupProductPreview />
        </div>
      </section>

      {projectError ? <div className="startup-error" role="alert" aria-live="polite">{projectError}</div> : null}

      <Dialog
        open={Boolean(pickerMode)}
        onOpenChange={(isOpen) => {
          if (!isOpen) resetDraft();
        }}
      >
        <DialogContent
          aria-modal="true"
          className="startup-create-sheet"
          data-entry-surface="create-sheet"
          data-overlay-surface="project-setup-dialog"
        >
          <DialogHeader className="startup-create-sheet-header">
            <div className="grid gap-2">
              <DialogTitle>{isCreateSheet ? '开始一个新故事' : '导入旧稿继续写'}</DialogTitle>
              <DialogDescription>
                {isCreateSheet ? '选择故事名称和项目目录。' : '选择旧稿目录，可选填写显示名称。'}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="startup-create-sheet-body">
            <label className="startup-sheet-field" htmlFor={displayNameFieldId}>
              <span>{isCreateSheet ? '故事名称' : '显示名称（可选）'}</span>
              <Input
                id={displayNameFieldId}
                aria-label={isCreateSheet ? '故事名称' : '显示名称（可选）'}
                value={draftDisplayName}
                onChange={(event) => setDraftDisplayName(event.target.value)}
                placeholder={isCreateSheet ? '例如：星海长夜' : '可留空'}
                className="bg-background/40"
              />
            </label>
            <div className="startup-sheet-field">
              <span>{isCreateSheet ? '项目目录' : '旧稿目录'}</span>
              <div className="startup-folder-picker-row">
                <div className={`startup-folder-preview${draftRootPath ? '' : ' is-empty'}`}>
                  {draftRootPath || '尚未选择文件夹'}
                </div>
                <Button variant="secondary" className="rounded-[var(--radius-md)] px-4" onClick={handlePickFolder} disabled={isPickingFolder}>
                  {isPickingFolder ? '打开中…' : '选择文件夹'}
                </Button>
              </div>
              <Input
                aria-label={isCreateSheet ? '项目目录' : '旧稿目录'}
                value={draftRootPath}
                onChange={(event) => setDraftRootPath(event.target.value)}
                placeholder={isCreateSheet ? './Novels/new-story' : './Novels/existing-draft'}
                className="bg-background/40"
              />
            </div>
          </div>
          <DialogFooter className="startup-create-sheet-actions">
            <Button variant="secondary" onClick={resetDraft} disabled={isSubmittingProject}>
              取消
            </Button>
            <Button onClick={handleSubmitProject} disabled={isSubmittingProject}>
              {isSubmittingProject ? '处理中…' : isCreateSheet ? '创建故事项目' : '导入并继续'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="startup-content-layout" data-homepage-stage="project-list">
        {!isManagerOpen ? (
          <>
            <section
              id="startup-recent-projects"
              className="startup-section startup-section--recent"
              data-entry-surface="recent-projects"
              data-entry-tone="recent"
              data-project-collection="editorial-stack"
            >
              {isLoading ? (
                <div className="startup-loading">加载中...</div>
              ) : (
                <ProjectManagerPanel
                  title="最近项目"
                  subtitle="选择一个项目继续写。"
                  projects={projects}
                  onSelectProject={(p) => updateSelectedProjectId(p.id)}
                  onContinueProject={(project) => void onStart('create', project.id)}
                  selectedProjectId={selectedProjectId || undefined}
                  variant="recent"
                />
              )}
            </section>

            {selectedProject ? (
              <section className="startup-mode-section" data-entry-surface="start-paths" data-start-context="selected-project">
                <div className="startup-section-heading">
                  <Badge variant="outline" className="w-fit rounded-full border-border/80 bg-background/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    已选择
                  </Badge>
                  <h2>下一步</h2>
                  <p>继续写，或先看参考。</p>
                </div>
                <Badge variant="secondary" className="startup-selected-project-info px-4 py-2 text-sm text-secondary-foreground">
                  已选择项目 · {selectedProject.name}
                </Badge>
                <div className="startup-grid startup-grid--paths">
                  {modeCards.map((card) => {
                    const isCreate = card.mode === 'create';
                    return (
                      <article
                        key={card.mode}
                        data-entry-surface="mode-card"
                        className={`startup-card startup-card--${card.mode} startup-card--path`}
                      >
                        <span className="startup-card-kicker">{isCreate ? '继续创作' : '辅助入口'}</span>
                        <strong className="startup-card-title">
                          {isCreate ? '继续当前项目创作' : '进入参考模式'}
                        </strong>
                        <span className="startup-card-description">
                          {isCreate ? '回到当前项目。' : '拆解参考文本。'}
                        </span>
                        <small className="startup-card-details">
                          {isCreate ? '进入工作台' : '进入参考模式'}
                        </small>
                        <Button
                          variant={isCreate ? 'default' : 'outline'}
                          className="startup-path-action rounded-[var(--radius-md)] px-4"
                          onClick={() => {
                            if (isCreate) {
                              void onStart('create', selectedProject.id);
                              return;
                            }
                            void onStart('analyze', selectedProject.id);
                          }}
                          disabled={isStarting}
                        >
                          {isCreate ? '继续当前项目创作' : '进入参考模式'}
                        </Button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {isManagerOpen ? (
          <section id="startup-management-panel" className="startup-section startup-section--management" data-entry-surface="management-panel" data-entry-tone="management">
            {isLoading ? (
              <div className="startup-loading">加载中...</div>
            ) : (
              <ProjectManagerPanel
                title="项目管理"
                subtitle="修复、归档或移除项目。"
                projects={projects}
                onSelectProject={(p) => updateSelectedProjectId(p.id)}
                selectedProjectId={selectedProjectId || undefined}
                managementMode
                variant="management"
                onRepairProject={handleRepairProject}
                onToggleArchiveProject={handleToggleArchiveProject}
                onRemoveProject={handleRemoveProject}
              />
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export class FolderPickerTimeoutError extends Error {
  constructor() {
    super('Folder picker timed out.');
    this.name = 'FolderPickerTimeoutError';
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new FolderPickerTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
