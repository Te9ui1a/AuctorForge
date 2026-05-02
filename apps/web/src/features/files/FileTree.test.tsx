import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileTree } from './FileTree';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('FileTree', () => {
  it('renders grouped files as a drawer-ready navigation surface while preserving file actions', () => {
    const onOpenFile = vi.fn();
    const onToggleCollapse = vi.fn();
    const onCreateFile = vi.fn();
    const onCreateFolder = vi.fn();
    const onRefresh = vi.fn();

    render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '1-边界',
            files: [{ path: '1-边界/1.2_文风.md', label: '1.2_文风.md' }],
          },
          {
            title: '2-设定',
            files: [{ path: '2-设定/2.2_新书设定案.md', label: '2.2_新书设定案.md' }],
          },
        ]}
        activePath="1-边界/1.2_文风.md"
        collapsed={false}
        onOpenFile={onOpenFile}
        onToggleCollapse={onToggleCollapse}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onRefresh={onRefresh}
      />, 
    );

    const fileRail = screen.getByRole('complementary', { name: '文件树导航' });
    const fileTreeHeading = screen.getByRole('heading', { name: '文稿导航' });
    const fileTreeHeader = fileRail.querySelector('[data-shell-region="file-tree-header"]');
    const fileTreeActions = fileRail.querySelector('[data-shell-region="file-tree-actions"]');
    const fileTreeContent = fileRail.querySelector('[data-shell-region="file-tree-content"]');

    expect(fileRail).toHaveAttribute('data-ui-surface', 'file-rail');
    expect(fileRail).toHaveAttribute('data-shell-region', 'file-tree-rail');
    expect(fileRail).toHaveAttribute('data-shell-role', 'supporting-navigation');
    expect(fileRail).toHaveAttribute('data-panel-state', 'expanded');
    expect(fileRail).toHaveAttribute('data-file-tree-tone', 'navigation');
    expect(fileTreeHeader).not.toBeNull();
    expect(fileTreeActions).not.toBeNull();
    expect(fileTreeContent).not.toBeNull();
    expect(screen.getByText('沿着分区进入当前文稿与资料。')).toBeInTheDocument();
    expect(fileTreeHeading.closest('[data-shell-region="file-tree-header"]')).toBe(fileTreeHeader);
    expect(fileTreeHeader).toHaveAttribute('data-file-tree-header', 'quiet-navigation');
    expect(fileTreeActions).toHaveAttribute('data-file-tree-actions', 'ambient-support');
    expect(fileTreeActions).toHaveAttribute('data-file-tree-density', 'subtle');
    expect(fileTreeContent).toHaveAttribute('data-file-tree-view', 'navigation-tree');
    const createFileButton = within(fileTreeActions as HTMLElement).getByRole('button', { name: '新建文件' });
    const createFolderButton = within(fileTreeActions as HTMLElement).getByRole('button', { name: '新建文件夹' });
    const refreshButton = within(fileTreeActions as HTMLElement).getByRole('button', { name: '刷新文件树' });
    const copyPathButton = within(fileTreeActions as HTMLElement).getByRole('button', { name: '复制当前路径' });
    const collapseButton = screen.getByRole('button', { name: '关闭文稿导航' });
    const firstFolderToggle = screen.getByRole('button', { name: '折叠目录 1-边界' });

    expect(createFileButton).toHaveAttribute('data-file-tree-control-style', 'ambient');
    expect(createFolderButton).toHaveAttribute('data-file-tree-control-style', 'ambient');
    expect(refreshButton).toHaveAttribute('data-file-tree-control-style', 'ambient');
    expect(copyPathButton).toHaveAttribute('data-file-tree-control-style', 'ambient');
    expect(collapseButton).toHaveAttribute('data-file-tree-control-style', 'ambient');
    expect(firstFolderToggle).toHaveAttribute('aria-expanded', 'true');
    expect(firstFolderToggle).toHaveAttribute('aria-controls', 'file-tree-folder-panel-1-边界');

    expect(screen.getByText('1-边界')).toBeInTheDocument();
    expect(screen.getByText('2-设定')).toBeInTheDocument();

    fireEvent.click(screen.getByText('2.2_新书设定案.md'));

    expect(onOpenFile).toHaveBeenCalledWith('2-设定/2.2_新书设定案.md');

    expect(screen.getByRole('button', { name: '新建文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建文件夹' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新文件树' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制当前路径' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新建文件' }));
    fireEvent.change(screen.getByLabelText('文件名'), { target: { value: '新角色.md' } });
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }));

    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }));
    fireEvent.change(screen.getByLabelText('文件夹名'), { target: { value: '角色资料' } });
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新文件树' }));

    expect(onCreateFile).toHaveBeenCalledWith('新角色.md');
    expect(onCreateFolder).toHaveBeenCalledWith('角色资料');
    expect(onRefresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '关闭文稿导航' }));

    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('keeps the navigation tree mounted in hidden mode instead of switching to a compact marker rail', () => {
    const onToggleCollapse = vi.fn();

    render(
      <FileTree
        rootFiles={[{ path: 'PROJECT.md', label: 'PROJECT.md' }]}
        groups={[
          {
            title: '1-边界',
            files: [{ path: '1-边界/1.2_文风.md', label: '1.2_文风.md' }],
          },
        ]}
        activePath="1-边界/1.2_文风.md"
        collapsed
        onOpenFile={() => {}}
        onToggleCollapse={onToggleCollapse}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />, 
    );

    const fileRail = screen.getByRole('complementary', { name: '文件树导航' });
    const fileTreeContent = fileRail.querySelector('[data-shell-region="file-tree-content"]');

    expect(fileRail).toHaveAttribute('data-panel-state', 'hidden');
    expect(fileTreeContent).toHaveAttribute('data-file-tree-view', 'navigation-tree');
    expect(screen.queryByRole('button', { name: '展开文件树' })).not.toBeInTheDocument();
    expect(screen.queryByText('控')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭文稿导航' })).toHaveAttribute('data-file-tree-control-style', 'ambient');

    fireEvent.click(screen.getByRole('button', { name: '关闭文稿导航' }));

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('renders PROJECT after the folders as a special control file entry', () => {
    const { container } = render(
      <FileTree
        rootFiles={[{ path: 'PROJECT.md', label: 'PROJECT.md' }]}
        groups={[
          { title: '.novelkit', files: [] },
          { title: '1-边界', files: [] },
        ]}
        activePath="PROJECT.md"
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />,
    );

    const fileTreeContent = container.querySelector('[data-shell-region="file-tree-content"]');
    const rootFilesSection = fileTreeContent?.querySelector('.file-root-files');

    expect(screen.getByText('.novelkit')).toBeInTheDocument();
    expect(screen.getByText('1-边界')).toBeInTheDocument();
    expect(rootFilesSection).not.toBeNull();
    expect(within(rootFilesSection as HTMLElement).getByLabelText('主控文件 PROJECT.md')).toBeInTheDocument();
  });

  it('renders nested folder structure like an IDE tree', () => {
    render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '.novelkit',
            files: [
              { path: '.novelkit/constitution/MASTER.md', label: 'MASTER.md' },
              { path: '.novelkit/memory/character_state.md', label: 'character_state.md' },
            ],
          },
        ]}
        activePath=".novelkit/constitution/MASTER.md"
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText('.novelkit')).toBeInTheDocument();
    expect(screen.getByText('constitution')).toBeInTheDocument();
    expect(screen.getByText('memory')).toBeInTheDocument();
    expect(screen.getByText('MASTER.md')).toBeInTheDocument();
    expect(screen.getByText('character_state.md')).toBeInTheDocument();
  });

  it('renders empty nested folders from the file tree contract', () => {
    render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '1-边界',
            files: [{ path: '1-边界/角色资料', label: '角色资料', type: 'folder' }],
          },
        ]}
        activePath=""
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: '折叠目录 角色资料' })).toBeInTheDocument();
  });

  it('keeps .novelkit core folders expanded by default', () => {
    render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '.novelkit',
            files: [
              { path: '.novelkit/constitution/MASTER.md', label: 'MASTER.md' },
              { path: '.novelkit/memory/character_state.md', label: 'character_state.md' },
            ],
          },
        ]}
        activePath=""
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText('MASTER.md')).toBeInTheDocument();
    expect(screen.getByText('character_state.md')).toBeInTheDocument();
  });

  it('renders empty standard folders so the project structure stays visible', () => {
    render(
      <FileTree
        rootFiles={[]}
        groups={[
          { title: '2-设定', files: [] },
          { title: '3-大纲', files: [] },
        ]}
        activePath=""
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText('2-设定')).toBeInTheDocument();
    expect(screen.getByText('3-大纲')).toBeInTheDocument();
  });

  it('allows collapsing a tree branch', () => {
    render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '.novelkit',
            files: [{ path: '.novelkit/constitution/MASTER.md', label: 'MASTER.md' }],
          },
        ]}
        activePath=".novelkit/constitution/MASTER.md"
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />,
    );

    const constitutionToggle = screen.getByRole('button', { name: '折叠目录 constitution' });

    expect(constitutionToggle).toHaveAttribute('aria-expanded', 'true');
    expect(constitutionToggle).toHaveAttribute('aria-controls', 'file-tree-folder-panel-.novelkit/constitution');

    fireEvent.click(constitutionToggle);

    expect(screen.queryByText('MASTER.md')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开目录 constitution' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('persists collapsed folder state only within the same workspace key', () => {
    const firstMount = render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '.novelkit',
            files: [{ path: '.novelkit/constitution/MASTER.md', label: 'MASTER.md' }],
          },
        ]}
        activePath=".novelkit/constitution/MASTER.md"
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
        persistenceKey="project-a"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '折叠目录 constitution' }));
    expect(screen.queryByText('MASTER.md')).not.toBeInTheDocument();

    firstMount.unmount();

    render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '.novelkit',
            files: [{ path: '.novelkit/constitution/MASTER.md', label: 'MASTER.md' }],
          },
        ]}
        activePath=".novelkit/constitution/MASTER.md"
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
        persistenceKey="project-a"
      />,
    );

    expect(screen.queryByText('MASTER.md')).not.toBeInTheDocument();

    cleanup();

    render(
      <FileTree
        rootFiles={[]}
        groups={[
          {
            title: '.novelkit',
            files: [{ path: '.novelkit/constitution/MASTER.md', label: 'MASTER.md' }],
          },
        ]}
        activePath=".novelkit/constitution/MASTER.md"
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
        persistenceKey="project-b"
      />,
    );

    expect(screen.getByText('MASTER.md')).toBeInTheDocument();
    expect(window.localStorage.getItem('auctorforge:file-tree-collapsed-folders')).toBeNull();
  });

  it('opens named modal create dialogs instead of relying on prompt', () => {
    render(
      <FileTree
        rootFiles={[]}
        groups={[]}
        activePath=""
        collapsed={false}
        onOpenFile={() => {}}
        onToggleCollapse={() => {}}
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新建文件' }));

    const createFileDialog = screen.getByRole('dialog', { name: '创建新文件' });
    expect(createFileDialog).toHaveAttribute('aria-modal', 'true');
    expect(within(createFileDialog).getByRole('textbox', { name: '文件名' })).toBeInTheDocument();
    expect(within(createFileDialog).getByRole('button', { name: '确认创建' })).toBeInTheDocument();

    fireEvent.click(within(createFileDialog).getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }));

    const createFolderDialog = screen.getByRole('dialog', { name: '创建新文件夹' });
    expect(createFolderDialog).toHaveAttribute('aria-modal', 'true');
    expect(within(createFolderDialog).getByRole('textbox', { name: '文件夹名' })).toBeInTheDocument();
    expect(within(createFolderDialog).getByRole('button', { name: '确认创建' })).toBeInTheDocument();
  });
});
