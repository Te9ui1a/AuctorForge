import { BrainCircuit, ChevronLeft, ChevronRight, Copy, FilePlus2, FolderPlus, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, CSSProperties, ReactNode, RefObject } from 'react';

import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import type { FileTreeGroup } from '../workflow/types';

type FileTreeProps = {
  rootFiles: Array<{ path: string; label: string }>;
  groups: FileTreeGroup[];
  activePath: string;
  collapsed: boolean;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  persistenceKey?: string;
  onOpenFile: (path: string) => void;
  onToggleCollapse: () => void;
  onCreateFile: (name: string) => void;
  onCreateFolder: (name: string) => void;
  onRefresh: () => void;
};

type TreeNode = {
  id: string;
  label: string;
  path?: string;
  children: TreeNode[];
  type: 'folder' | 'file';
};

const STORAGE_KEY = 'auctorforge:file-tree-collapsed-folders';

export function FileTree({
  rootFiles,
  groups,
  activePath,
  collapsed,
  closeButtonRef,
  persistenceKey,
  onOpenFile,
  onToggleCollapse,
  onCreateFile,
  onCreateFolder,
  onRefresh,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(groups), [groups]);
  const storageKey = useMemo(() => buildStorageKey(persistenceKey), [persistenceKey]);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>(() => readCollapsedFolders(storageKey));
  const [createType, setCreateType] = useState<'file' | 'folder' | null>(null);
  const [createName, setCreateName] = useState('');
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const createDialogTitleId = createType ? `file-tree-create-${createType}-title` : undefined;

  useEffect(() => {
    setCollapsedFolders(readCollapsedFolders(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (createType) {
      createInputRef.current?.focus();
    }
  }, [createType]);

  function toggleFolder(nodeId: string) {
    setCollapsedFolders((current) => {
      const next = {
        ...current,
        [nodeId]: !current[nodeId],
      };
      persistCollapsedFolders(next, storageKey);
      return next;
    });
  }

  async function handleCopyPath() {
    if (!activePath || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(activePath);
  }

  const handleCreateSubmit: NonNullable<ComponentProps<'form'>['onSubmit']> = (event) => {
    event.preventDefault();
    const name = createName.trim();
    if (!createType || name.length === 0) {
      return;
    }

    if (createType === 'file') {
      onCreateFile(name);
    } else {
      onCreateFolder(name);
    }

    setCreateType(null);
    setCreateName('');
  };

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/7 bg-[image:var(--ui-surface-background)] text-[color:var(--ui-surface-foreground)] shadow-[var(--ui-surface-shadow)] backdrop-blur-xl"
        aria-label="文件树导航"
        data-ui-surface="file-rail"
        data-shell-region="file-tree-rail"
        data-shell-role="supporting-navigation"
        data-panel-state={collapsed ? 'hidden' : 'expanded'}
        data-file-tree-tone="navigation"
      >
        <div
          className="flex w-full items-start justify-between gap-3 border-b border-[color:var(--ui-rail-divider)] px-4 py-4"
          data-shell-region="file-tree-header"
          data-file-tree-header="quiet-navigation"
        >
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <div className="file-tree-context-label">分区入口</div>
              <h2 className="m-0 text-sm font-semibold text-foreground">文稿导航</h2>
              <p className="file-tree-context-copy m-0 max-w-[22ch] text-xs leading-5 text-muted-foreground">沿着分区进入当前文稿与资料。</p>
            </div>

            <div
              className="file-tree-secondary-controls flex flex-wrap items-center gap-1"
              data-shell-region="file-tree-actions"
              data-file-tree-actions="ambient-support"
              data-file-tree-density="subtle"
            >
              <FileTreeActionButton label="新建文件" onClick={() => setCreateType('file')}>
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              </FileTreeActionButton>
              <FileTreeActionButton label="新建文件夹" onClick={() => setCreateType('folder')}>
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
              </FileTreeActionButton>
              <FileTreeActionButton label="刷新文件树" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </FileTreeActionButton>
              <FileTreeActionButton label="复制当前路径" onClick={() => void handleCopyPath()}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </FileTreeActionButton>
            </div>
          </div>

          <FileTreeActionButton label="关闭文稿导航" buttonRef={closeButtonRef} onClick={onToggleCollapse}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </FileTreeActionButton>
        </div>

        <div className="file-tree file-tree--navigation w-full" data-file-tree-view="navigation-tree" data-shell-region="file-tree-content">
          {tree.map((node) => renderTreeNode(node, 0, activePath, collapsedFolders, toggleFolder, onOpenFile))}
          {rootFiles.length > 0 ? (
            <section className="file-root-files">
              {rootFiles.map((file) => (
                <div key={file.path} className="tree-node tree-node--control-file" style={{ '--tree-depth': 0 } as CSSProperties}>
                  <button
                    type="button"
                    aria-label={`主控文件 ${file.label}`}
                    className={file.path === activePath ? 'tree-entry tree-entry--control active' : 'tree-entry tree-entry--control'}
                    onClick={() => onOpenFile(file.path)}
                    title={file.label}
                  >
                    <span className="tree-control-icon">
                      <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="tree-label">{file.label}</span>
                  </button>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        {createType ? (
          <div className="file-tree-dialog-backdrop">
            <form
              className="file-tree-dialog space-y-4 rounded-[var(--radius-lg)] border border-white/10 bg-[rgba(12,16,24,0.94)] p-5 text-foreground shadow-[0_14px_34px_rgba(4,8,18,0.26)] backdrop-blur-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby={createDialogTitleId}
              onSubmit={handleCreateSubmit}
            >
              <div className="space-y-1">
                <div className="file-tree-context-label">{createType === 'file' ? '新建文件' : '新建文件夹'}</div>
                <h3 id={createDialogTitleId} className="m-0 text-base font-semibold">
                  {createType === 'file' ? '创建新文件' : '创建新文件夹'}
                </h3>
              </div>
              <input
                aria-label={createType === 'file' ? '文件名' : '文件夹名'}
                className="w-full rounded-[var(--radius-md)] border border-white/10 bg-black/15 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
                ref={createInputRef}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={createType === 'file' ? '例如：新角色.md' : '例如：角色资料'}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[var(--radius-md)] border-white/10 bg-white/[0.03] text-foreground hover:bg-white/[0.08]"
                  onClick={() => {
                    setCreateType(null);
                    setCreateName('');
                  }}
                >
                  取消
                </Button>
                <Button type="submit" className="rounded-[var(--radius-md)] px-4">
                  确认创建
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </aside>
    </TooltipProvider>
  );
}

type FileTreeActionButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement | null>;
};

function FileTreeActionButton({ label, onClick, children, buttonRef }: FileTreeActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          ref={buttonRef}
          variant="ghost"
          size="icon"
          className="file-tree-action-button h-8 w-8 rounded-[var(--radius-sm)] border border-transparent bg-transparent text-muted-foreground shadow-none hover:text-foreground"
          aria-label={label}
          data-file-tree-control-style="ambient"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function buildStorageKey(persistenceKey?: string) {
  return `${STORAGE_KEY}:${persistenceKey ?? 'default'}`;
}

function readCollapsedFolders(storageKey: string) {
  if (typeof window === 'undefined') {
    return {} as Record<string, boolean>;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function persistCollapsedFolders(value: Record<string, boolean>, storageKey: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    return;
  }
}

function renderTreeNode(
  node: TreeNode,
  depth: number,
  activePath: string,
  collapsedFolders: Record<string, boolean>,
  toggleFolder: (nodeId: string) => void,
  onOpenFile: (path: string) => void,
) {
  const isFolder = node.type === 'folder';
  const isCollapsed = collapsedFolders[node.id] ?? false;

  if (isFolder) {
    const childPanelId = `file-tree-folder-panel-${node.id}`;

    return (
      <div
        key={node.id}
        className={depth === 0 ? 'tree-node tree-node--folder is-root' : 'tree-node tree-node--folder is-nested'}
        style={{ '--tree-depth': depth, '--tree-parent-depth': Math.max(depth - 1, 0) } as CSSProperties}
      >
        <button
          type="button"
          className="tree-entry tree-entry--folder"
          aria-label={`${isCollapsed ? '展开目录' : '折叠目录'} ${node.label}`}
          aria-controls={childPanelId}
          aria-expanded={!isCollapsed}
          onClick={() => toggleFolder(node.id)}
        >
          <ChevronRight className={isCollapsed ? 'tree-chevron' : 'tree-chevron is-open'} aria-hidden="true" />
          <span className="tree-icon tree-icon--folder" />
          <span className="tree-label">{node.label}</span>
        </button>
        {!isCollapsed ? (
          <div className="tree-children" id={childPanelId}>
            {node.children.map((child) => renderTreeNode(child, depth + 1, activePath, collapsedFolders, toggleFolder, onOpenFile))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      key={node.id}
      className={depth === 0 ? 'tree-node tree-node--file is-root' : 'tree-node tree-node--file is-nested'}
      style={{ '--tree-depth': depth, '--tree-parent-depth': Math.max(depth - 1, 0) } as CSSProperties}
    >
      <button
        type="button"
        className={node.path === activePath ? 'tree-entry tree-entry--file active' : 'tree-entry tree-entry--file'}
        onClick={() => node.path && onOpenFile(node.path)}
        title={node.label}
      >
        <span className="tree-file-marker" />
        <span className="tree-label">{node.label}</span>
      </button>
    </div>
  );
}

function buildTree(groups: FileTreeGroup[]): TreeNode[] {
  return groups.map((group) => {
    const root: TreeNode = {
      id: group.title,
      label: group.title,
      children: [],
      type: 'folder',
    };

    for (const file of group.files) {
      const segments = file.path.split('/').slice(1);
      let current = root;
      let currentPath = group.title;

      for (const [index, segment] of segments.entries()) {
        currentPath = `${currentPath}/${segment}`;
        const isLast = index === segments.length - 1;

        if (isLast) {
          if (file.type === 'folder') {
            ensureFolderNode(current, currentPath, segment);
          } else {
            current.children.push({
              id: currentPath,
              label: segment,
              path: file.path,
              children: [],
              type: 'file',
            });
          }
          continue;
        }

        const next = ensureFolderNode(current, currentPath, segment);
        current = next;
      }
    }

    return sortTree(root);
  });
}

function ensureFolderNode(parent: TreeNode, id: string, label: string) {
  let node = parent.children.find((child) => child.type === 'folder' && child.label === label);
  if (!node) {
    node = {
      id,
      label,
      children: [],
      type: 'folder',
    };
    parent.children.push(node);
  }

  return node;
}

function sortTree(node: TreeNode): TreeNode {
  if (node.type === 'file') {
    return node;
  }

  return {
    ...node,
    children: node.children
      .map(sortTree)
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }

        return a.label.localeCompare(b.label, 'zh-Hans-CN');
      }),
  };
}
