import { useCallback, useState } from 'react';

import { buildProjectScopedHeaders } from '../api/apiClient';
import { loadChatSession } from '../chat/chatSessionApi';
import { toLauncherPath } from '../navigation/routeState';
import { toWorkbenchModePath, type WorkbenchMode } from '../navigation/useWorkbenchRouteSync';
import type {
  ChatAttachment,
  ChatMessage,
  FileTreeGroup,
  ProgressResponse,
  SessionResponse,
} from '../workflow/types';

export type ProjectScopedUiSnapshot = {
  openPaths: string[];
  draftStateByPath: Record<string, { content: string; dirty: boolean }>;
  documentPath: string;
  documentContent: string;
  chatInput: string;
  chatAttachments: ChatAttachment[];
  messages: ChatMessage[];
  uiError: string;
  chatError: string;
  chatErrorPayload: unknown;
  fileTreeError: string;
  rootFiles: Array<{ path: string; label: string }>;
  fileTree: FileTreeGroup[];
  session: SessionResponse | null;
  progress: ProgressResponse | null;
  activeProjectId: string;
  activeProjectName: string;
};

export function useProjectSwitcher({
  chatAttachments,
  chatError,
  chatErrorPayload,
  chatInput,
  currentWorkbenchMode,
  defaultGreeting,
  documentContent,
  documentPath,
  documentPathRef,
  draftStateByPath,
  fileTree,
  fileTreeError,
  messages,
  navigateIfMounted,
  openPaths,
  persistChatMessages,
  progress,
  refreshSession,
  resetProjectScopedUiState,
  restoreProjectScopedUiState,
  rootFiles,
  runQuickMode,
  saveDocument,
  session,
  setDraftStateByPath,
  setHasBootstrapped,
  setMessages,
  setUiError,
  starterMessage,
  uiError,
}: {
  chatAttachments: ChatAttachment[];
  chatError: string;
  chatErrorPayload: unknown;
  chatInput: string;
  currentWorkbenchMode: WorkbenchMode;
  defaultGreeting: ChatMessage;
  documentContent: string;
  documentPath: string;
  documentPathRef: { current: string };
  draftStateByPath: Record<string, { content: string; dirty: boolean }>;
  fileTree: FileTreeGroup[];
  fileTreeError: string;
  messages: ChatMessage[];
  navigateIfMounted: (to: string, options?: { replace?: boolean }) => void;
  openPaths: string[];
  persistChatMessages: (nextMessages: ChatMessage[]) => Promise<unknown>;
  progress: ProgressResponse | null;
  refreshSession: (options?: { preserveDocument?: boolean; ignoreDraftState?: boolean; preferredDocumentPath?: string }) => Promise<boolean>;
  resetProjectScopedUiState: () => void;
  restoreProjectScopedUiState: (snapshot: ProjectScopedUiSnapshot) => void;
  rootFiles: Array<{ path: string; label: string }>;
  runQuickMode: (mode: 'guide' | 'analyze', baseMessagesOverride?: ChatMessage[]) => Promise<void>;
  saveDocument: (path: string, content: string) => Promise<boolean>;
  session: SessionResponse | null;
  setDraftStateByPath: (next: Record<string, { content: string; dirty: boolean }>) => void;
  setHasBootstrapped: (value: boolean) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setUiError: (message: string) => void;
  starterMessage: ChatMessage;
  uiError: string;
}) {
  const [pendingSwitch, setPendingSwitch] = useState<{ mode: WorkbenchMode; projectId: string } | null>(null);
  const [activeProjectName, setActiveProjectName] = useState('');
  const [activeProjectId, setActiveProjectId] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const buildSnapshot = useCallback((): ProjectScopedUiSnapshot => ({
    openPaths,
    draftStateByPath,
    documentPath,
    documentContent,
    chatInput,
    chatAttachments,
    messages,
    uiError,
    chatError,
    chatErrorPayload,
    fileTreeError,
    rootFiles,
    fileTree,
    session,
    progress,
    activeProjectId,
    activeProjectName,
  }), [
    activeProjectId,
    activeProjectName,
    chatAttachments,
    chatError,
    chatErrorPayload,
    chatInput,
    documentContent,
    documentPath,
    draftStateByPath,
    fileTree,
    fileTreeError,
    messages,
    openPaths,
    progress,
    rootFiles,
    session,
    uiError,
  ]);

  const restoreSnapshot = useCallback((snapshot: ProjectScopedUiSnapshot) => {
    restoreProjectScopedUiState(snapshot);
    setActiveProjectId(snapshot.activeProjectId);
    setActiveProjectName(snapshot.activeProjectName);
  }, [restoreProjectScopedUiState]);

  const handleStartMode = useCallback(async (mode: WorkbenchMode, projectId?: string) => {
    if (!projectId) {
      return;
    }

    const isSwitchingProjects = projectId !== activeProjectId;
    const dirtyPaths = Object.keys(draftStateByPath).filter((path) => draftStateByPath[path].dirty);

    if (isSwitchingProjects && dirtyPaths.length > 0) {
      setPendingSwitch({ mode, projectId });
      return;
    }

    navigateIfMounted(toWorkbenchModePath({ projectId, mode }));
  }, [activeProjectId, draftStateByPath, navigateIfMounted]);

  const executeSwitch = useCallback(async (mode: WorkbenchMode, projectId: string, preferredDocumentPath?: string) => {
    setIsStarting(true);
    setPendingSwitch(null);
    const snapshot = buildSnapshot();
    const fallbackLauncherPath = toLauncherPath({
      projectId: snapshot.activeProjectId || projectId,
    });
    setHasBootstrapped(false);

    try {
      const openResponse = await fetch('/api/projects/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (!openResponse.ok) {
        restoreSnapshot(snapshot);
        setUiError('打开项目失败，请稍后重试。');
        setHasBootstrapped(true);
        navigateIfMounted(fallbackLauncherPath, { replace: true });
        return;
      }

      const openData = await openResponse.json() as {
        activeProjectId?: string | null;
        project?: { id?: string | null; projectId?: string | null; displayName?: string | null } | null;
      };

      resetProjectScopedUiState();

      const resolvedProjectId = openData.project?.id || openData.project?.projectId || openData.activeProjectId || projectId;
      let nextProjectName = openData.project?.displayName || '';

      if (!nextProjectName) {
        const projectsResponse = await fetch('/api/projects');
        if (projectsResponse.ok) {
          const payload = await projectsResponse.json() as
            | { activeProjectId: string | null; projects: Array<{ id?: string | null; projectId?: string | null; displayName: string }> }
            | Array<{ id?: string | null; projectId?: string | null; displayName: string }>;

          const projects = Array.isArray(payload) ? payload : payload.projects;
          const activeProject = projects.find((entry) => (entry.id || entry.projectId) === resolvedProjectId);
          if (activeProject) {
            nextProjectName = activeProject.displayName;
          }
        }
      }

      const sessionResponse = await fetch('/api/session', {
        headers: buildProjectScopedHeaders({}, resolvedProjectId),
      });
      const sessionData = sessionResponse.ok ? await sessionResponse.json() as SessionResponse : null;

      if (!sessionData?.initialized) {
        const initResponse = await fetch('/api/workspace/init', {
          method: 'POST',
          headers: buildProjectScopedHeaders({}, resolvedProjectId),
        });
        if (!initResponse.ok) {
          restoreSnapshot(snapshot);
          setUiError('初始化项目失败，请稍后重试。');
          setHasBootstrapped(true);
          navigateIfMounted(fallbackLauncherPath, { replace: true });
          return;
        }
      }

      const refreshSucceeded = await refreshSession({ ignoreDraftState: true, preferredDocumentPath });
      if (!refreshSucceeded) {
        restoreSnapshot(snapshot);
        setUiError('打开项目失败，请稍后重试。');
        setHasBootstrapped(true);
        navigateIfMounted(fallbackLauncherPath, { replace: true });
        return;
      }

      setActiveProjectId(resolvedProjectId);
      setActiveProjectName(nextProjectName || snapshot.activeProjectName || '');

      let loadedMessages: ChatMessage[] = [];
      try {
        const loadedChatSession = await loadChatSession(documentPathRef.current || undefined, resolvedProjectId);
        loadedMessages = loadedChatSession.messages;
      } catch {
        // The workbench can start with a fresh greeting when the saved chat is unavailable.
      }

      let finalMessages = loadedMessages.length > 0
        ? loadedMessages
        : [defaultGreeting];

      if (mode === 'create') {
        if (loadedMessages.length === 0) {
          finalMessages = [...finalMessages, starterMessage];
          persistChatMessages(finalMessages).catch(() => {});
        }
        setMessages(finalMessages);
        return;
      }

      setMessages(finalMessages);
      if (loadedMessages.length === 0) {
        persistChatMessages(finalMessages).catch(() => {});
      }
      await runQuickMode('analyze', finalMessages);
    } catch {
      restoreSnapshot(snapshot);
      setUiError('打开项目失败，请稍后重试。');
      setHasBootstrapped(true);
      navigateIfMounted(fallbackLauncherPath, { replace: true });
    } finally {
      setIsStarting(false);
    }
  }, [
    buildSnapshot,
    defaultGreeting,
    documentPathRef,
    navigateIfMounted,
    persistChatMessages,
    refreshSession,
    resetProjectScopedUiState,
    restoreSnapshot,
    runQuickMode,
    setHasBootstrapped,
    setMessages,
    setUiError,
    starterMessage,
  ]);

  const handleSaveAndSwitch = useCallback(async () => {
    if (!pendingSwitch) return;

    const dirtyPaths = Object.keys(draftStateByPath).filter(path => draftStateByPath[path].dirty);
    for (const path of dirtyPaths) {
      const saved = await saveDocument(path, draftStateByPath[path].content);
      if (!saved) {
        return;
      }
    }

    navigateIfMounted(toWorkbenchModePath(pendingSwitch));
    setPendingSwitch(null);
  }, [draftStateByPath, navigateIfMounted, pendingSwitch, saveDocument]);

  const handleDiscardAndSwitch = useCallback(async () => {
    if (!pendingSwitch) return;

    setDraftStateByPath({});
    navigateIfMounted(toWorkbenchModePath(pendingSwitch));
    setPendingSwitch(null);
  }, [navigateIfMounted, pendingSwitch, setDraftStateByPath]);

  return {
    activeProjectId,
    activeProjectName,
    executeSwitch,
    handleDiscardAndSwitch,
    handleSaveAndSwitch,
    handleStartMode,
    isStarting,
    pendingSwitch,
    setActiveProjectId,
    setActiveProjectName,
    setPendingSwitch,
  };
}
