import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FolderPickerTimeoutError, StartupScreen, withTimeout } from './StartupScreen';
import * as projectApi from './projectApi';

const srcDirectory = dirname(fileURLToPath(import.meta.url));
const stylesSource = [
  readFileSync(resolve(srcDirectory, '../../styles/tokens.css'), 'utf8'),
  readFileSync(resolve(srcDirectory, '../../styles.css'), 'utf8'),
].join('\n');

if (!document.head.querySelector('[data-test-styles="startup-layout-contract"]')) {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-test-styles', 'startup-layout-contract');
  styleElement.textContent = stylesSource;
  document.head.appendChild(styleElement);
}

vi.mock('./projectApi', () => ({
  archiveProject: vi.fn(),
  createSampleProject: vi.fn(),
  fetchRecentProjects: vi.fn(),
  createProject: vi.fn(),
  importProject: vi.fn(),
  pickProjectFolder: vi.fn(),
  removeProject: vi.fn(),
  repairProject: vi.fn(),
}));

function expectLucideStartupIcon(button: HTMLElement, iconName: string) {
  expect(button.querySelector(`[data-startup-icon="${iconName}"][data-icon-system="lucide"]`)).toBeTruthy();
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

describe('StartupScreen', () => {
  const mockOnStart = vi.fn();
  const mockOnOpenSettings = vi.fn();
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let allowedConsoleErrorMessages: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    allowedConsoleErrorMessages = [];
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(projectApi.fetchRecentProjects).mockResolvedValue([
      { id: 'proj-1', name: 'Test Project 1', lastModified: Date.now(), status: 'active' },
      { id: 'proj-2', name: 'Test Project 2', lastModified: Date.now() - 100000, status: 'archived' },
    ]);
  });

  afterEach(() => {
    try {
      const unexpectedConsoleErrors = consoleErrorSpy.mock.calls.filter(([message]) => (
        !allowedConsoleErrorMessages.some((allowedMessage) => String(message).includes(allowedMessage))
      ));
      expect(unexpectedConsoleErrors).toEqual([]);
    } finally {
      consoleErrorSpy.mockRestore();
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('renders startup navigation and launcher actions', () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    expect(screen.getByRole('navigation', { name: '首页导航' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始一个新故事' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入旧稿继续写' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模型配置' })).toBeInTheDocument();
  });

  it('shows first-run guidance without blocking launcher actions', () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    const guidance = screen.getByRole('region', { name: '首次使用建议' });
    expect(within(guidance).getByText('先用虚构示例试跑，再放入真实稿件。')).toBeInTheDocument();
    expect(within(guidance).getByText('项目资料默认保存在你选择的本地文件夹。')).toBeInTheDocument();
    expect(within(guidance).getByText('模型配置前，可以先浏览和编辑本地项目。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始一个新故事' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入旧稿继续写' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '试用示例项目' })).toBeInTheDocument();
  });

  it('shows manuscript safety and backup guidance without blocking launch actions', () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    const backupGuidance = screen.getByRole('region', { name: '稿件安全与备份' });
    expect(within(backupGuidance).getByText('项目就是普通本地文件夹，可以整体复制备份。')).toBeInTheDocument();
    expect(within(backupGuidance).getByText('大改前先复制整个项目文件夹，再继续实验。')).toBeInTheDocument();
    expect(within(backupGuidance).getByText('未配置模型时，仍可浏览、编辑和检查本地项目。')).toBeInTheDocument();
    expect(within(backupGuidance).getByText('只有使用模型能力时，才可能把相关文本交给你配置的服务商。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始一个新故事' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入旧稿继续写' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '试用示例项目' })).toBeInTheDocument();
  });

  it('lets writers dismiss first-run guidance while keeping launcher actions available', () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    fireEvent.click(screen.getByRole('button', { name: '隐藏建议' }));

    expect(screen.queryByRole('region', { name: '首次使用建议' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始一个新故事' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入旧稿继续写' })).toBeInTheDocument();
  });

  it('creates the fictional sample project and enters the workbench', async () => {
    vi.mocked(projectApi.createSampleProject).mockResolvedValue({
      id: 'sample-lantern-road',
      name: 'Lantern Road',
      rootPath: '/tmp/auctorforge-sample',
      lastModified: Date.now(),
      status: 'active',
      phase: '示例阶段',
      coreTask: '熟悉工作台',
    });

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    fireEvent.click(screen.getByRole('button', { name: '试用示例项目' }));

    await waitFor(() => {
      expect(projectApi.createSampleProject).toHaveBeenCalledTimes(1);
      expect(mockOnStart).toHaveBeenCalledWith('create', 'sample-lantern-road');
      expect(screen.getByText('已选择项目 · Lantern Road')).toBeInTheDocument();
    });
  });

  it('offers sample, create, and import actions when no recent projects exist', async () => {
    vi.mocked(projectApi.fetchRecentProjects).mockResolvedValue([]);

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    await screen.findByText('还没有项目');

    expect(screen.getByText('可以先试用示例项目，或者创建/导入自己的本地项目。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '试用示例项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始一个新故事' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入旧稿继续写' })).toBeInTheDocument();
  });

  it('presents AuctorForge as the product identity instead of the old working title', () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    const legacyWorkingTitle = String.fromCharCode(23567, 35828, 25554, 20214, 32, 119, 101, 98, 85, 73, 32, 21270);

    expect(screen.getAllByText('AuctorForge').length).toBeGreaterThan(0);
    expect(document.body.textContent ?? '').not.toContain(legacyWorkingTitle);
    expect(document.body.textContent ?? '').not.toContain('AI 长篇小说创作台');
  });

  it('uses writer-facing homepage copy instead of internal design rationale', () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    expect(screen.getByRole('heading', { name: '开始写你的长篇小说' })).toBeInTheDocument();
    expect(screen.getAllByText('AuctorForge').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: '创作现场预览' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '产品能力摘要' })).not.toBeInTheDocument();

    const pageText = document.body.textContent ?? '';
    expect(pageText).toContain('新建、导入，或者继续上次的项目。');
    expect(pageText).not.toContain('Editorial launcher');
    expect(pageText).not.toContain('从新故事进入创作现场');
    expect(pageText).not.toContain('最近项目直接续写');
    expect(pageText).not.toContain('项目维护安静收纳');
    expect(pageText).not.toContain('适合长篇、连载、系列作品');
    expect(pageText).not.toContain('新建 / 导入 / 最近项目 / 项目维护');
    expect(pageText).not.toContain('从灵感、旧稿或上次停下的章节');
    expect(pageText).not.toContain('主动作');
    expect(pageText).not.toContain('辅助层');
    expect(pageText).not.toContain('分层清晰');
    expect(pageText).not.toContain('不再把它做成产品宣传页');
    expect(pageText).not.toContain('三级入口');
  });

  it('uses a breathing two-stage homepage layout after removing the duplicate management block', () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    const shell = document.querySelector<HTMLElement>('[data-ui-surface="entry"]');
    const hero = document.querySelector<HTMLElement>('[data-entry-surface="hero"]');
    const content = document.querySelector<HTMLElement>('.startup-content-layout');

    expect(shell).toHaveAttribute('data-homepage-layout', 'two-stage-entry');
    expect(shell).toHaveAttribute('data-homepage-density', 'breathing');
    expect(hero).toHaveAttribute('data-homepage-stage', 'primary-entry');
    expect(content).toHaveAttribute('data-homepage-stage', 'project-list');
    expect(document.querySelector('[data-entry-surface="management-entry"]')).toBeNull();
    expect(readRuleProperty('#root.startup-entry-root', 'height')).toBe('auto');
    expect(readRuleProperty('#root.startup-entry-root', 'overflow')).toBe('visible');
    expect(readRuleProperty('.startup-shell', 'height')).toBe('auto');
    expect(readRuleProperty('.startup-shell', 'overflow')).toBe('visible');
    expect(readRuleProperty('.startup-shell', 'padding')).toBe('clamp(24px, 5vw, 56px) clamp(18px, 5vw, 48px) 48px');
    expect(readRuleProperty('.startup-shell', 'gap')).toBe('22px');
    expect(readRuleProperty('.startup-hero', 'padding')).toBe('18px 0 40px');
    expect(readRuleProperty('.startup-content-layout', 'max-width')).toBe('1120px');
    expect(readRuleProperty('.startup-content-layout', 'gap')).toBe('24px');
    expect(readRuleProperty('.startup-hero-copy', 'gap')).toBe('20px');
    expect(readRuleProperty('.startup-product-preview', 'padding')).toBe('22px');
  });

  it('keeps one strong primary action while leaving support and management controls quieter', async () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    const recentProjectsButton = screen.getByRole('button', { name: '最近项目' });
    const manageProjectsButton = screen.getByRole('button', { name: '管理项目' });
    const settingsButton = screen.getByRole('button', { name: '模型配置' });
    const createStoryButton = screen.getByRole('button', { name: '开始一个新故事' });
    const importStoryButton = screen.getByRole('button', { name: '导入旧稿继续写' });

    expect(recentProjectsButton).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(manageProjectsButton).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(settingsButton).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(createStoryButton).toHaveAttribute('data-ui-control-tier', 'primary');
    expect(importStoryButton).toHaveAttribute('data-ui-control-tier', 'supporting');
    expectLucideStartupIcon(createStoryButton, 'spark');
    expectLucideStartupIcon(importStoryButton, 'upload');
    expectLucideStartupIcon(manageProjectsButton, 'panels');
    expect(settingsButton.querySelector('[data-startup-icon="settings"][data-icon-system="lucide"]')).toBeTruthy();

    expect(screen.queryByRole('button', { name: '继续当前项目创作' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^已选择项目/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '展开项目管理' })).not.toBeInTheDocument();
    expect(screen.queryByText('整理项目')).not.toBeInTheDocument();
    await screen.findByRole('button', { name: '选择并继续 Test Project 1' });
  });

  it('shows project-specific start options after selecting a recent project', async () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    // Wait for projects to load
    await waitFor(() => {
      expect(screen.getByText('Test Project 1')).toBeInTheDocument();
    });

    // Click a project
    fireEvent.click(screen.getByText('Test Project 1'));

    expect(screen.getByText('已选择项目 · Test Project 1')).toBeInTheDocument();
    const createAction = screen.getByRole('button', { name: '继续当前项目创作' });
    const analyzeAction = screen.getByRole('button', { name: '进入参考模式' });
    expect(createAction).toHaveAttribute('data-ui-control-tier', 'primary');
    expect(analyzeAction).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(screen.getByText('已选择项目 · Test Project 1')).toBeInTheDocument();

    fireEvent.click(createAction);
    expect(mockOnStart).toHaveBeenCalledWith('create', 'proj-1');
  });

  it('continues a recent project directly from the recent-project action', async () => {
    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    const continueButton = await screen.findByRole('button', { name: '选择并继续 Test Project 1' });

    const recentProjectCard = continueButton.closest('article') as HTMLElement | null;
    expect(recentProjectCard).toBeTruthy();
    expect(within(recentProjectCard as HTMLElement).getByRole('button', { name: '选择项目 Test Project 1' })).toBeInTheDocument();
    expect(within(recentProjectCard as HTMLElement).getByRole('button', { name: '选择并继续 Test Project 1' })).toBe(continueButton);

    fireEvent.click(continueButton);

    expect(mockOnStart).toHaveBeenCalledWith('create', 'proj-1');
  });

  it('uses the externally selected project id as the launcher source of truth', async () => {
    render(
      <StartupScreen
        onStart={mockOnStart}
        onOpenSettings={mockOnOpenSettings}
        isStarting={false}
        selectedProjectId="proj-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('已选择项目 · Test Project 1')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '继续当前项目创作' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '进入参考模式' })).toBeInTheDocument();
  });

  it('uses externally controlled management state and emits management changes', async () => {
    const handleManagerOpenChange = vi.fn();

    render(
      <StartupScreen
        onStart={mockOnStart}
        onOpenSettings={mockOnOpenSettings}
        isStarting={false}
        selectedProjectId="proj-1"
        isManagerOpen
        onManagerOpenChange={handleManagerOpenChange}
      />,
    );

    await screen.findByRole('heading', { name: '项目管理' });

    const managementToggle = screen.getByRole('button', { name: '管理项目' });
    expect(managementToggle).toHaveAttribute('aria-controls', 'startup-management-panel');
    expect(managementToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: '项目管理' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '收起项目管理' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Project 1/ })).toBeInTheDocument();

    fireEvent.click(managementToggle);
    expect(handleManagerOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens a modal project form and enters the workbench after creating a new project', async () => {
    vi.mocked(projectApi.pickProjectFolder).mockResolvedValue('/tmp/novel/new-project');
    vi.mocked(projectApi.createProject).mockResolvedValue({
      id: 'proj-new',
      name: '未命名项目',
      rootPath: '/tmp/novel/new-project',
      lastModified: Date.now(),
      status: 'active',
      phase: null,
      coreTask: null,
    });

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    fireEvent.click(screen.getByText('开始一个新故事'));
    const createDialog = screen.getByRole('dialog', { name: '开始一个新故事' });
    expect(createDialog).toHaveAttribute('aria-modal', 'true');
    expect(createDialog).toHaveAttribute('data-overlay-surface', 'project-setup-dialog');
    expect(within(createDialog).getByText('选择文件夹')).toBeInTheDocument();
    expect(within(createDialog).getByText('取消')).toBeInTheDocument();
    expect(within(createDialog).getByText('创建故事项目')).toBeInTheDocument();
    expect(within(createDialog).getByText('这个文件夹会保存本地项目资料；不配置模型也可以先浏览和编辑。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('故事名称'), { target: { value: '未命名项目' } });
    fireEvent.click(screen.getByText('选择文件夹'));

    await waitFor(() => {
      expect(projectApi.pickProjectFolder).toHaveBeenCalledWith({
        purpose: 'create',
        defaultPath: undefined,
      });
      expect(screen.getByText('/tmp/novel/new-project')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('创建故事项目'));

    await waitFor(() => {
      expect(projectApi.createProject).toHaveBeenCalledWith({
        displayName: '未命名项目',
        rootPath: '/tmp/novel/new-project',
        entryMode: 'create',
      });
      expect(mockOnStart).toHaveBeenCalledWith('create', 'proj-new');
    });
  });

  it('lets the user type a project folder when the native picker is unavailable', async () => {
    allowedConsoleErrorMessages = ['Failed to pick folder:'];
    vi.mocked(projectApi.pickProjectFolder).mockRejectedValue(new Error('picker unavailable'));
    vi.mocked(projectApi.createProject).mockResolvedValue({
      id: 'proj-manual',
      name: '手动路径项目',
      rootPath: '/tmp/manual-project',
      lastModified: Date.now(),
      status: 'active',
      phase: null,
      coreTask: null,
    });

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    fireEvent.click(screen.getByText('开始一个新故事'));
    fireEvent.change(screen.getByLabelText('故事名称'), { target: { value: '手动路径项目' } });
    fireEvent.click(screen.getByText('选择文件夹'));

    await waitFor(() => {
      expect(screen.getByText('打开文件夹选择器失败，请手动输入项目目录。')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('项目目录'), { target: { value: '/tmp/manual-project' } });
    fireEvent.click(screen.getByText('创建故事项目'));

    await waitFor(() => {
      expect(projectApi.createProject).toHaveBeenCalledWith({
        displayName: '手动路径项目',
        rootPath: '/tmp/manual-project',
        entryMode: 'create',
      });
    });
  });

  it('rejects a hanging folder picker operation after the timeout window', async () => {
    vi.useFakeTimers();

    const pending = withTimeout(new Promise<string | null>(() => undefined), 12000);
    const assertion = expect(pending).rejects.toBeInstanceOf(FolderPickerTimeoutError);

    await vi.advanceTimersByTimeAsync(12000);
    await assertion;

    vi.useRealTimers();
  });

  it('does not overwrite a newly created project if loadProjects resolves later', async () => {
    vi.mocked(projectApi.pickProjectFolder).mockResolvedValue('/tmp/novel/new-project');
    let resolveFetch: (projects: any[]) => void;
    vi.mocked(projectApi.fetchRecentProjects).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    vi.mocked(projectApi.createProject).mockResolvedValue({
      id: 'proj-new',
      name: '未命名项目',
      rootPath: '/tmp/novel/new-project',
      lastModified: Date.now(),
      status: 'active',
      phase: null,
      coreTask: null,
    });

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    fireEvent.click(screen.getByText('开始一个新故事'));
    fireEvent.change(screen.getByLabelText('故事名称'), { target: { value: '未命名项目' } });
    fireEvent.click(screen.getByText('选择文件夹'));
    await waitFor(() => {
      expect(screen.getByText('/tmp/novel/new-project')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('创建故事项目'));

    await waitFor(() => {
      expect(screen.getByText('已选择项目 · 未命名项目')).toBeInTheDocument();
    });

    // Now resolve the initial fetch
    resolveFetch!([
      { id: 'proj-1', name: 'Test Project 1', lastModified: Date.now(), status: 'active' }
    ]);

    // The new project should still be in the list and selected
    await waitFor(() => {
      expect(screen.getByText('Test Project 1')).toBeInTheDocument();
      expect(screen.getByText('未命名项目')).toBeInTheDocument();
      expect(screen.getByText('已选择项目 · 未命名项目')).toBeInTheDocument();
    });
  });

  it('shows a visible error when project creation fails', async () => {
    allowedConsoleErrorMessages = ['Failed to create project:'];
    vi.mocked(projectApi.pickProjectFolder).mockResolvedValue('/tmp/novel/new-project');
    vi.mocked(projectApi.createProject).mockRejectedValue(new Error('create failed'));

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    fireEvent.click(screen.getByText('开始一个新故事'));
    fireEvent.change(screen.getByLabelText('故事名称'), { target: { value: '未命名项目' } });
    fireEvent.click(screen.getByText('选择文件夹'));
    await waitFor(() => {
      expect(screen.getByText('/tmp/novel/new-project')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('创建故事项目'));

    await waitFor(() => {
      expect(screen.getByText('新建项目失败，请稍后重试。')).toBeInTheDocument();
    });
  });

  it('imports an existing project and selects it', async () => {
    vi.mocked(projectApi.pickProjectFolder).mockResolvedValue('/tmp/existing-project');
    vi.mocked(projectApi.importProject).mockResolvedValue({
      id: 'proj-imported',
      name: '导入项目',
      rootPath: '/tmp/existing-project',
      lastModified: Date.now(),
      status: 'active',
      phase: null,
      coreTask: null,
    });

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    fireEvent.click(screen.getByText('导入旧稿继续写'));
    const importDialog = screen.getByRole('dialog', { name: '导入旧稿继续写' });
    expect(importDialog).toHaveAttribute('data-overlay-surface', 'project-setup-dialog');
    expect(within(importDialog).getByText('选择文件夹')).toBeInTheDocument();
    expect(within(importDialog).getByText('取消')).toBeInTheDocument();
    expect(within(importDialog).getByText('导入并继续')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('显示名称（可选）'), { target: { value: '导入项目' } });
    fireEvent.click(screen.getByText('选择文件夹'));

    await waitFor(() => {
      expect(projectApi.pickProjectFolder).toHaveBeenCalledWith({
        purpose: 'import',
        defaultPath: undefined,
      });
      expect(screen.getByText('/tmp/existing-project')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('导入并继续'));

    await waitFor(() => {
      expect(projectApi.importProject).toHaveBeenCalledWith({
        rootPath: '/tmp/existing-project',
        displayName: '导入项目',
        entryMode: 'create',
      });
      expect(mockOnStart).toHaveBeenCalledWith('create', 'proj-imported');
      expect(screen.getByText('已选择项目 · 导入项目')).toBeInTheDocument();
    });
  });

  it('toggles project management and allows archive/remove actions on the selected project', async () => {
    vi.mocked(projectApi.repairProject).mockResolvedValue({
      id: 'proj-1',
      name: 'Test Project 1',
      lastModified: Date.now(),
      status: 'active',
    });
    vi.mocked(projectApi.archiveProject).mockResolvedValue({
      id: 'proj-1',
      name: 'Test Project 1',
      lastModified: Date.now(),
      status: 'archived',
    });
    vi.mocked(projectApi.removeProject).mockResolvedValue({
      removedProjectId: 'proj-1',
      activeProjectId: null,
    });

    render(<StartupScreen onStart={mockOnStart} onOpenSettings={mockOnOpenSettings} isStarting={false} />);

    await waitFor(() => {
      expect(screen.getByText('Test Project 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '管理项目' }));
    expect(screen.getByRole('button', { name: '管理项目' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: '展开项目管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '收起项目管理' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '项目管理' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Test Project 1'));
    const repairButton = await screen.findByRole('button', { name: '修复项目' });
    expect(screen.getAllByText('Test Project 1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: '归档项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从列表移除' })).toBeInTheDocument();
    expectLucideStartupIcon(repairButton, 'repair');
    expectLucideStartupIcon(screen.getByRole('button', { name: '归档项目' }), 'archive');
    expectLucideStartupIcon(screen.getByRole('button', { name: '从列表移除' }), 'remove');
    expect(screen.getByRole('button', { name: /Test Project 1/ })).toHaveTextContent('Test Project 1');
    fireEvent.click(repairButton);

    await waitFor(() => {
      expect(projectApi.repairProject).toHaveBeenCalledWith('proj-1');
    });

    fireEvent.click(screen.getByText('归档项目'));

    await waitFor(() => {
      expect(projectApi.archiveProject).toHaveBeenCalledWith('proj-1', true);
    });

    fireEvent.click(screen.getByText('取消归档'));

    await waitFor(() => {
      expect(projectApi.archiveProject).toHaveBeenCalledWith('proj-1', false);
    });

    fireEvent.click(screen.getByText('从列表移除'));

    expect(projectApi.removeProject).not.toHaveBeenCalled();
    expect(screen.getByText('确认要将“Test Project 1”从列表移除吗？项目文件不会被删除。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认移除' }));

    await waitFor(() => {
      expect(projectApi.removeProject).toHaveBeenCalledWith('proj-1');
      expect(screen.queryByText('Test Project 1')).not.toBeInTheDocument();
    });
  });
});
