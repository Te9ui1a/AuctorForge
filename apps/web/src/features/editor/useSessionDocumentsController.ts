import { useCallback, useState } from 'react';

import { buildProjectScopedHeaders } from '../api/apiClient';
import type {
  FileResponse,
  FileTreeData,
  FileTreeGroup,
  ProgressResponse,
  SessionResponse,
} from '../workflow/types';

export function useSessionDocumentsController({
  activeProjectId,
  clearDocument,
  documentPathRef,
  draftStateByPath,
  draftStateByPathRef,
  openDocument,
  setHasBootstrapped,
  setUiError,
}: {
  activeProjectId?: string | null;
  clearDocument: () => void;
  documentPathRef: { current: string };
  draftStateByPath: Record<string, { content: string; dirty: boolean }>;
  draftStateByPathRef: { current: Record<string, { content: string; dirty: boolean }> };
  openDocument: (path: string, content: string, options?: { dirty?: boolean }) => void;
  setHasBootstrapped: (value: boolean) => void;
  setUiError: (message: string) => void;
}) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [rootFiles, setRootFiles] = useState<Array<{ path: string; label: string }>>([]);
  const [fileTree, setFileTree] = useState<FileTreeGroup[]>([]);
  const [fileTreeError, setFileTreeError] = useState('');

  const refreshSession = useCallback(async (options?: { preserveDocument?: boolean; ignoreDraftState?: boolean; preferredDocumentPath?: string }) => {
    try {
      const draftSource = options?.ignoreDraftState ? {} : draftStateByPathRef.current;
      const sessionResponse = await fetch('/api/session', {
        headers: buildProjectScopedHeaders({}, activeProjectId),
      });
      if (!sessionResponse.ok) {
        throw new Error('session');
      }
      const sessionData = (await sessionResponse.json()) as SessionResponse;
      setSession(sessionData);

      const progressHeaders: Record<string, string> = {};
      if (options?.preserveDocument && documentPathRef.current) {
        progressHeaders['x-active-document-path'] = encodeURIComponent(documentPathRef.current);
      }
      const progressResponse = await fetch('/api/progress', {
        headers: buildProjectScopedHeaders(progressHeaders, activeProjectId),
      });
      if (!progressResponse.ok) {
        throw new Error('progress');
      }
      const progressData = (await progressResponse.json()) as ProgressResponse;
      setProgress(progressData);

      try {
        const fileTreeResponse = await fetch('/api/files/tree', {
          headers: buildProjectScopedHeaders({}, activeProjectId),
        });
        if (fileTreeResponse.ok) {
          const treeData = (await fileTreeResponse.json()) as FileTreeData | FileTreeGroup[];
          if (Array.isArray(treeData)) {
            setRootFiles([]);
            setFileTree(treeData);
          } else {
            setRootFiles(treeData.rootFiles);
            setFileTree(treeData.groups);
          }
          setFileTreeError('');
        } else {
          setRootFiles([]);
          setFileTree([]);
          setFileTreeError('文件树加载失败，已回退为当前文件模式。');
        }
      } catch {
        setRootFiles([]);
        setFileTree([]);
        setFileTreeError('文件树加载失败，已回退为当前文件模式。');
      }

      setUiError('');
      setHasBootstrapped(true);

      const requiredProjectReads = progressData.requiredProjectReads ?? [];
      const allowedWriteTargets = progressData.allowedWrites ?? [];
      const proposalWrites = progressData.pendingProposal?.proposedWrites ?? [];
      const candidatePaths = Array.from(
        new Set(
          progressData.pendingProposal
            ? [...proposalWrites.map((write) => write.path), ...requiredProjectReads]
            : [...requiredProjectReads, ...allowedWriteTargets],
        ),
      );
      const preservedDocumentPath = options?.preserveDocument && documentPathRef.current
        ? documentPathRef.current
        : '';
      const preservedDraft = preservedDocumentPath && !options?.ignoreDraftState
        ? draftStateByPathRef.current[preservedDocumentPath] ?? draftSource[preservedDocumentPath]
        : undefined;
      const shouldPrioritizePendingProposal = Boolean(progressData.pendingProposal)
        && !options?.preferredDocumentPath
        && !preservedDraft?.dirty;
      const preferredPaths = Array.from(
        new Set([
          ...(options?.preferredDocumentPath ? [options.preferredDocumentPath] : []),
          ...(shouldPrioritizePendingProposal ? candidatePaths : []),
          ...(preservedDocumentPath ? [preservedDocumentPath] : []),
          ...(shouldPrioritizePendingProposal ? [] : candidatePaths),
        ]),
      );

      if (preferredPaths.length === 0) {
        clearDocument();
        return true;
      }

      for (const candidatePath of preferredPaths) {
        const matchingProposal = proposalWrites.find(
          (item) => item.path === candidatePath && typeof item.content === 'string',
        );

        if (matchingProposal?.content) {
          openDocument(candidatePath, matchingProposal.content, { dirty: false });
          return true;
        }

        const fileResponse = await fetch(`/api/file?path=${encodeURIComponent(candidatePath)}`, {
          headers: buildProjectScopedHeaders({}, activeProjectId),
        });

        if (!fileResponse.ok) {
          continue;
        }

        const fileData = (await fileResponse.json()) as FileResponse;
        const currentDraft = options?.ignoreDraftState
          ? undefined
          : draftStateByPathRef.current[candidatePath] ?? draftSource[candidatePath];
        openDocument(candidatePath, currentDraft?.dirty ? currentDraft.content : fileData.content, {
          dirty: currentDraft?.dirty ?? false,
        });
        return true;
      }

      if (progressData.pendingProposal) {
        clearDocument();
        return true;
      }

      const fallbackPath = allowedWriteTargets[0] ?? preferredPaths[0];
      const fallbackDraft = options?.ignoreDraftState
        ? undefined
        : draftStateByPathRef.current[fallbackPath] ?? draftSource[fallbackPath];
      openDocument(fallbackPath, fallbackDraft?.content ?? '', { dirty: fallbackDraft?.dirty ?? false });
      return true;
    } catch {
      setUiError('工作区加载失败，请稍后重试。');
      setHasBootstrapped(true);
      return false;
    }
  }, [activeProjectId, clearDocument, documentPathRef, draftStateByPathRef, openDocument, setHasBootstrapped, setUiError]);

  const handleOpenFile = useCallback(async (path: string) => {
    if (draftStateByPath[path]?.dirty) {
      openDocument(path, draftStateByPath[path].content, { dirty: true });
      return;
    }

    const matchingProposal = progress?.pendingProposal?.proposedWrites.find(
      (item) => item.path === path && typeof item.content === 'string',
    );

    if (matchingProposal?.content) {
      setUiError('');
      openDocument(path, matchingProposal.content, { dirty: false });
      return;
    }

    try {
      const fileResponse = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
        headers: buildProjectScopedHeaders({}, activeProjectId),
      });
      if (!fileResponse.ok) {
        setUiError('文件打开失败，请稍后重试。');
        return;
      }

      const fileData = (await fileResponse.json()) as FileResponse;
      setUiError('');
      openDocument(path, fileData.content, { dirty: false });
    } catch {
      setUiError('文件打开失败，请稍后重试。');
    }
  }, [activeProjectId, draftStateByPath, openDocument, progress?.pendingProposal?.proposedWrites, setUiError]);

  return {
    fileTree,
    fileTreeError,
    handleOpenFile,
    progress,
    refreshSession,
    rootFiles,
    session,
    setFileTree,
    setFileTreeError,
    setProgress,
    setRootFiles,
    setSession,
  };
}
