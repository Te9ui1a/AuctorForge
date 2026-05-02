import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router-dom';

import { useChatController } from './features/chat/useChatController';
import { useSessionDocumentsController } from './features/editor/useSessionDocumentsController';
import { UnsavedCloseDialog } from './features/editor/UnsavedCloseDialog';
import { useWorkbenchDocuments } from './features/editor/useWorkbenchDocuments';
import { useProjectSwitcher, type ProjectScopedUiSnapshot } from './features/startup/useProjectSwitcher';
import { ModelSettingsPanel } from './features/settings/ModelSettingsPanel';
import { useModelSettings } from './features/settings/useModelSettings';
import { formatWriteTargetLabel, selectNextWriteTarget } from './features/workflow/writeTarget';
import { ProjectSwitchDialog } from './features/startup/ProjectSwitchDialog';
import { toLauncherPath } from './features/navigation/routeState';
import { useCanonicalRouteState } from './features/navigation/useCanonicalRouteState';
import { useWorkbenchRouteSync, type WorkbenchMode } from './features/navigation/useWorkbenchRouteSync';
import { useWorkbenchCreativeSplit } from './features/layout/useWorkbenchCreativeSplit';
import { LauncherView, LoadingView, WorkbenchView } from './features/workbench/AppViews';
import { buildProjectScopedHeaders } from './features/api/apiClient';
import type {
  ChatMessage,
  WriteTargetHint,
} from './features/workflow/types';


const DEFAULT_GREETING: ChatMessage = {
  role: 'assistant',
  content: '你好，我是你的创作助手。我们可以随时讨论想法，或者直接推进当前项目。',
};

const CREATE_MODE_STARTER: ChatMessage = {
  role: 'assistant',
  content: '我们先从统一创作入口开始。你可以直接告诉我：\n1. 从零开始\n2. 导入旧稿\n3. 灵感切入（先写人设/脑洞/样章）\n\n我会根据你的回答继续分流。',
};

type NavigationAdapter = {
  location: {
    pathname: string;
    search: string;
  };
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

type WorkbenchContextRail = 'files' | 'workflow' | null;

export function App() {
  return useInRouterContext() ? <RouterAwareApp /> : <WindowAwareApp />;
}

function RouterAwareApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useMemo<NavigationAdapter>(
    () => ({
      location: { pathname: location.pathname, search: location.search },
      navigate: (to, options) => {
        void navigate(to, options);
      },
    }),
    [location.pathname, location.search, navigate],
  );

  return <AppShell navigation={navigation} />;
}

function WindowAwareApp() {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => {
    const syncLocation = () => {
      setLocation({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };

    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const nextUrl = new URL(to, window.location.origin);

    if (options?.replace) {
      window.history.replaceState({}, '', nextUrl);
    } else {
      window.history.pushState({}, '', nextUrl);
    }

    setLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    });
  }, []);

  const navigation = useMemo<NavigationAdapter>(
    () => ({
      location,
      navigate,
    }),
    [location, navigate],
  );

  return <AppShell navigation={navigation} />;
}

function AppShell({ navigation }: { navigation: NavigationAdapter }) {
  const {
    openPaths,
    setOpenPaths,
    draftStateByPath,
    setDraftStateByPath,
    documentPath,
    setDocumentPath,
    documentContent,
    setDocumentContent,
    draftStateByPathRef,
    documentPathRef,
    resetDocuments,
    restoreDocuments,
    clearDocument,
    openDocument,
  } = useWorkbenchDocuments();
  const [hasBootstrapped, setHasBootstrapped] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uiError, setUiError] = useState('');
  const [pendingClosePath, setPendingClosePath] = useState<string | null>(null);
  const [activeContextRail, setActiveContextRail] = useState<WorkbenchContextRail>(null);
  const [isWorkflowCollapsed, setIsWorkflowCollapsed] = useState(false);
  const [hasOpenedWorkflowRail, setHasOpenedWorkflowRail] = useState(false);
  const fileNavigationButtonRef = useRef<HTMLButtonElement | null>(null);
  const workflowStatusButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileTreeRailFocusTargetRef = useRef<HTMLButtonElement | null>(null);
  const workflowRailFocusTargetRef = useRef<HTMLButtonElement | null>(null);
  const { navigateIfMounted, routeState } = useCanonicalRouteState(navigation);
  const routeProjectId = routeState.kind === 'workbench' ? routeState.projectId : undefined;
  const {
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
  } = useSessionDocumentsController({
    activeProjectId: routeProjectId,
    clearDocument,
    documentPathRef,
    draftStateByPath,
    draftStateByPathRef,
    openDocument,
    setHasBootstrapped,
    setUiError,
  });
  const modelSettings = useModelSettings();
  const currentWorkbenchMode: WorkbenchMode = session?.currentModule === 'analyze' ? 'analyze' : 'create';
  const workbenchIntentLabel = useMemo(() => {
    if (routeState.kind !== 'workbench') {
      return undefined;
    }

    return '当前意图 · 围绕当前稿件与上下文继续推进';
  }, [routeState]);
  const closeContextRail = useCallback((panel: Exclude<WorkbenchContextRail, null>) => {
    setActiveContextRail(null);
    const returnFocusTarget = panel === 'files' ? fileNavigationButtonRef : workflowStatusButtonRef;
    queueMicrotask(() => returnFocusTarget.current?.focus());
  }, []);
  const handleToggleContextRail = useCallback((panel: Exclude<WorkbenchContextRail, null>) => {
    setActiveContextRail((current) => (current === panel ? null : panel));
  }, []);
  const {
    assistantRatio,
    beginSplitDrag,
    cancelSplitDrag,
    endSplitDrag,
    handleSplitKeyDown,
    isDragging: isCreativeSplitDragging,
    moveSplitDrag,
    resetSplit,
    workspaceRef: creativeWorkspaceRef,
    workspaceStyle: creativeWorkspaceStyle,
  } = useWorkbenchCreativeSplit();

  useEffect(() => {
    if (activeContextRail === 'workflow') {
      setHasOpenedWorkflowRail(true);
    }

    const focusTarget = activeContextRail === 'files'
      ? fileTreeRailFocusTargetRef
      : activeContextRail === 'workflow'
        ? workflowRailFocusTargetRef
        : null;

    if (focusTarget) {
      queueMicrotask(() => focusTarget.current?.focus());
    }
  }, [activeContextRail]);

  useEffect(() => {
    if (!activeContextRail) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      closeContextRail(activeContextRail);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeContextRail, closeContextRail]);

  const writeTargetHint: WriteTargetHint = useMemo(() => ({
    strictWorkflowWrites: progress?.strictWorkflowWrites ?? [],
    chatAllowedWrites: progress?.chatAllowedWrites ?? [],
    activeDocumentPath: documentPath || null,
    hasPendingProposal: !!progress?.pendingProposal,
  }), [progress?.strictWorkflowWrites, progress?.chatAllowedWrites, documentPath, progress?.pendingProposal]);
  const {
    assistantStatus,
    canContinueDiscussion,
    chatAttachments,
    chatError,
    chatErrorPayload,
    chatInput,
    composerTurnStrategy,
    handleChatSubmit,
    handleContinueDiscussion,
    handlePickFiles,
    handleProposalAction,
    handleQuickMode,
    handleRemoveAttachment,
    handleRetryChat,
    isBusy: isChatBusy,
    messages,
    persistChatMessages,
    setChatAttachments,
    setChatError,
    setChatErrorPayload,
    setChatInput,
    setMessages,
  } = useChatController({
    activeProjectId: routeProjectId,
    defaultGreeting: DEFAULT_GREETING,
    documentPath,
    documentPathRef,
    progress,
    refreshSession,
    session,
    setUiError,
    streamEnabled: modelSettings.config.stream,
    writeTargetHint,
  });

  function resetProjectScopedUiState() {
    resetDocuments();
    setChatInput('');
    setChatAttachments([]);
    setMessages([DEFAULT_GREETING]);
    setUiError('');
    setFileTreeError('');
    setChatError('');
    setChatErrorPayload(null);
    setActiveContextRail(null);
    setIsWorkflowCollapsed(false);
    setHasOpenedWorkflowRail(false);
  }

  function restoreProjectScopedUiState(snapshot: ProjectScopedUiSnapshot) {
    restoreDocuments({
      openPaths: snapshot.openPaths,
      draftStateByPath: snapshot.draftStateByPath,
      documentPath: snapshot.documentPath,
      documentContent: snapshot.documentContent,
    });
    setChatInput(snapshot.chatInput);
    setChatAttachments(snapshot.chatAttachments);
    setMessages(snapshot.messages);
    setUiError(snapshot.uiError);
    setChatError(snapshot.chatError);
    setChatErrorPayload(snapshot.chatErrorPayload);
    setFileTreeError(snapshot.fileTreeError);
    setRootFiles(snapshot.rootFiles);
    setFileTree(snapshot.fileTree);
    setSession(snapshot.session);
    setProgress(snapshot.progress);
  }

  function getCurrentParentPath() {
    if (!documentPath) {
      return '';
    }

    const normalized = documentPath.split('/');
    if (normalized.length <= 1) {
      return '';
    }

    return normalized.slice(0, -1).join('/');
  }

  async function handleCreateFolder(name: string) {
    if (!name) {
      return;
    }

    try {
      const response = await fetch('/api/files/create-folder', {
        method: 'POST',
        headers: buildProjectScopedHeaders({ 'Content-Type': 'application/json' }, activeProjectId),
        body: JSON.stringify({ parentPath: getCurrentParentPath(), name }),
      });
      if (!response.ok) {
        setUiError('创建文件夹失败，请稍后重试。');
        return;
      }

      await refreshSession({ preserveDocument: true });
      persistChatMessages(messages).catch(() => {});
    } catch {
      setUiError('创建文件夹失败，请稍后重试。');
    }
  }

  async function handleCreateFile(name: string) {
    if (!name) {
      return;
    }

    try {
      const response = await fetch('/api/files/create-file', {
        method: 'POST',
        headers: buildProjectScopedHeaders({ 'Content-Type': 'application/json' }, activeProjectId),
        body: JSON.stringify({ parentPath: getCurrentParentPath(), name }),
      });
      if (!response.ok) {
        setUiError('创建文件失败，请稍后重试。');
        return;
      }

      const data = (await response.json()) as { path: string };
      await refreshSession({ preserveDocument: true });
      await handleOpenFile(data.path);
    } catch {
      setUiError('创建文件失败，请稍后重试。');
    }
  }

  const {
    activeProjectId,
    activeProjectName,
    executeSwitch,
    handleDiscardAndSwitch,
    handleSaveAndSwitch,
    handleStartMode,
    isStarting,
    pendingSwitch,
    setPendingSwitch,
  } = useProjectSwitcher({
    chatAttachments,
    chatError,
    chatErrorPayload,
    chatInput,
    currentWorkbenchMode,
    defaultGreeting: DEFAULT_GREETING,
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
    runQuickMode: handleQuickMode,
    saveDocument,
    session,
    setDraftStateByPath,
    setHasBootstrapped,
    setMessages,
    setUiError,
    starterMessage: CREATE_MODE_STARTER,
    uiError,
  });
  useWorkbenchRouteSync({
    activeProjectId,
    currentWorkbenchMode,
    documentPath,
    draftStateByPath,
    executeSwitch,
    handleOpenFile,
    handleQuickMode,
    isStarting,
    navigateIfMounted,
    navigationLocation: navigation.location,
    routeState,
    sessionCurrentModule: session?.currentModule,
    setPendingSwitch,
  });

  async function handleSaveDocument() {
    if (!progress || !documentPath) {
      return;
    }

    await saveDocument(documentPath, documentContent);
  }

  async function saveDocument(path: string, content: string) {
    if (!progress || !path) {
      return false;
    }

    try {
      const response = await fetch('/api/file', {
        method: 'PUT',
        headers: buildProjectScopedHeaders({ 'Content-Type': 'application/json' }, activeProjectId),
        body: JSON.stringify({
          path,
          content,
        }),
      });

      if (!response.ok) {
        setUiError('保存失败，请稍后重试。');
        return false;
      }

      setUiError('');
      setDraftStateByPath((current) => ({
        ...current,
        [path]: {
          content,
          dirty: false,
        },
      }));
      await refreshSession({ preserveDocument: true });
      return true;
    } catch {
      setUiError('保存失败，请稍后重试。');
      return false;
    }
  }

  async function closePath(path: string) {
    setOpenPaths((current) => current.filter((item) => item !== path));
    setDraftStateByPath((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });

    if (documentPath === path) {
      const fallback = openPaths.find((item) => item !== path) ?? '';
      if (!fallback) {
        clearDocument();
      } else {
        const fallbackDraft = draftStateByPath[fallback];
        if (fallbackDraft) {
          openDocument(fallback, fallbackDraft.content, { dirty: fallbackDraft.dirty });
        } else {
          await handleOpenFile(fallback);
        }
      }
    }
  }

  function handleClosePath(path: string) {
    const draft = draftStateByPath[path];
    if (draft?.dirty) {
      setPendingClosePath(path);
      return;
    }

    void closePath(path);
  }

  async function handleSaveAndClosePendingPath() {
    if (!pendingClosePath) {
      return;
    }

    const draft = draftStateByPath[pendingClosePath];
    if (draft?.dirty) {
      const saved = await saveDocument(pendingClosePath, draft.content);
      if (!saved) {
        return;
      }
    }

    const path = pendingClosePath;
    setPendingClosePath(null);
    await closePath(path);
  }

  function handleDiscardAndClosePendingPath() {
    if (!pendingClosePath) {
      return;
    }

    const path = pendingClosePath;
    setPendingClosePath(null);
    void closePath(path);
  }

  const progressSummary = useMemo(() => {
    if (progress?.progressSummary) {
      return progress.progressSummary;
    }

    return {
      phase: session?.currentStepTitle ?? '等待初始化',
      coreTask: '请继续当前流程',
      nextSuggestion: progress?.nextStepId ?? '当前步骤完成后进入人工决定',
      callableModules: session?.currentModule ? [session.currentModule] : [],
    };
  }, [progress?.progressSummary, progress?.nextStepId, session?.currentModule, session?.currentStepTitle]);
  const workflowSummary = useMemo(() => {
    const currentDocumentLabel = documentPath ? `当前文档：${documentPath}` : '当前文档：暂无';
    const continuityFlow = currentWorkbenchMode;
    const continuityFlowLabel = currentWorkbenchMode === 'analyze' ? '围绕参考分析继续推进' : '围绕正文继续推进';
    const pendingState = progress?.pendingProposal ? 'proposal' : progress?.pendingDecision ? 'decision' : 'ready';
    const pendingStateLabel = progress?.pendingProposal
      ? '等待确认提案'
      : progress?.pendingDecision
        ? '等待决定'
        : '等待下一步';
    const strictTargets = progress?.strictWorkflowWrites ?? progress?.allowedWrites ?? [];
    const flexibleTargets = Array.from(
      new Set([
        ...(progress?.chatAllowedWrites ?? []),
        ...(progress?.manualWritablePaths ?? progress?.allowedWrites ?? []),
      ]),
    ).filter((path) => !strictTargets.includes(path));
    const nextTargetPath = selectNextWriteTarget({
      proposalTarget: progress?.pendingProposal?.proposedWrites[0]?.path,
      strictTargets,
      flexibleTargets,
    });
    const nextTargetLabel = nextTargetPath ? formatWriteTargetLabel(nextTargetPath) : '暂无明确目标';

    return {
      currentDocumentLabel,
      continuityFlow,
      continuityFlowLabel,
      pendingState,
      pendingStateLabel,
      nextTargetLabel,
      nextSuggestion: progressSummary.nextSuggestion,
      nextTargetPath,
    };
  }, [currentWorkbenchMode, documentPath, progress?.allowedWrites, progress?.chatAllowedWrites, progress?.manualWritablePaths, progress?.pendingDecision, progress?.pendingProposal, progress?.strictWorkflowWrites, progressSummary.nextSuggestion]);
  const activeProposalPreview = progress?.pendingProposal?.proposedWrites.find(
    (item) => item.path === documentPath && item.content === documentContent,
  );
  const hasLoadedDocument = Boolean(documentPath);
  const canSaveCurrentDocument = hasLoadedDocument
    && !Boolean(activeProposalPreview);
  const launcherProjectId = routeState.kind === 'launcher' ? routeState.projectId : undefined;
  const isLauncherManagerOpen = routeState.kind === 'launcher' && routeState.panel === 'manage';
  const projectSwitchDialog = (
    <ProjectSwitchDialog
      isOpen={pendingSwitch !== null}
      dirtyCount={Object.keys(draftStateByPath).filter(path => draftStateByPath[path].dirty).length}
      onSaveAndSwitch={() => void handleSaveAndSwitch()}
      onDiscardAndSwitch={() => void handleDiscardAndSwitch()}
      onCancel={() => setPendingSwitch(null)}
    />
  );
  const unsavedCloseDialog = (
    <UnsavedCloseDialog
      isOpen={pendingClosePath !== null}
      path={pendingClosePath}
      onCancel={() => setPendingClosePath(null)}
      onDiscardAndClose={handleDiscardAndClosePendingPath}
      onSaveAndClose={() => void handleSaveAndClosePendingPath()}
    />
  );
  const modelSettingsPanel = (
    <ModelSettingsPanel
      isOpen={isSettingsOpen}
      settings={modelSettings.settings}
      isSaving={modelSettings.isSaving}
      isTesting={modelSettings.isTesting}
      statusMessage={modelSettings.message}
      onClose={() => setIsSettingsOpen(false)}
      onSave={modelSettings.save}
      onTestConnection={modelSettings.testConnection}
    />
  );

  if (!hasBootstrapped || (routeState.kind === 'workbench' && activeProjectId !== routeState.projectId)) {
    return <LoadingView projectSwitchDialog={projectSwitchDialog} />;
  }

  if (!session?.initialized || routeState.kind === 'launcher') {
    return (
      <LauncherView
        isLauncherManagerOpen={isLauncherManagerOpen}
        isStarting={isStarting}
        launcherProjectId={launcherProjectId}
        modelSettingsPanel={modelSettingsPanel}
        onManagerOpenChange={(isManagerOpen) =>
          navigateIfMounted(
            toLauncherPath({
              projectId: launcherProjectId,
              panel: isManagerOpen ? 'manage' : undefined,
            }),
          )
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSelectProjectId={(projectId) =>
          navigateIfMounted(
            toLauncherPath({
              projectId,
              panel: isLauncherManagerOpen ? 'manage' : undefined,
            }),
          )
        }
        onStart={handleStartMode}
        projectSwitchDialog={projectSwitchDialog}
        uiError={uiError}
      />
    );
  }

  const shouldRenderWorkflowPanelHost = activeContextRail === 'workflow' || hasOpenedWorkflowRail;
  const openSettings = () => setIsSettingsOpen(true);
  const workbenchProjectShell = {
    activeContextRail,
    activeProjectId,
    activeProjectName,
    fileNavigationButtonRef,
    modelStatus: modelSettings.config.apiKey ? '模型已配置' : '模型未配置',
    onBack: () => navigateIfMounted(toLauncherPath({ projectId: activeProjectId || undefined })),
    onOpenSettings: openSettings,
    onToggleContextRail: handleToggleContextRail,
    routeProjectId: routeState.kind === 'workbench' ? routeState.projectId : undefined,
    session,
    workbenchIntentLabel,
    workflowStatusButtonRef,
  };
  const workbenchEditorPane = {
    activeProposalPreview,
    assistantRatio,
    beginSplitDrag,
    canSaveCurrentDocument,
    cancelSplitDrag,
    creativeWorkspaceRef,
    creativeWorkspaceStyle,
    documentContent,
    documentPath,
    draftStateByPath,
    endSplitDrag,
    handleClosePath,
    handleOpenFile,
    handleSaveDocument,
    handleSplitKeyDown,
    isCreativeSplitDragging,
    moveSplitDrag,
    openPaths,
    resetSplit,
    setDocumentContent,
    setDraftStateByPath,
  };
  const workbenchAssistantPane = {
    assistantStatus,
    canContinueDiscussion,
    chatAttachments,
    chatError,
    chatInput,
    composerTurnStrategy,
    handleChatSubmit,
    handleContinueDiscussion,
    handleRemoveAttachment,
    handleProposalAction,
    handleRetryChat,
    isChatBusy,
    messages,
    onOpenSettings: openSettings,
    onPickFiles: handlePickFiles,
    progress,
    setChatInput,
    writeTargetHint,
  };
  const workbenchContextRail = {
    activeContextRail,
    activeProjectId,
    activeProjectName,
    closeContextRail,
    documentPath,
    fileTree,
    fileTreeRailFocusTargetRef,
    handleCreateFile,
    handleCreateFolder,
    handleOpenFile,
    isWorkflowCollapsed,
    manualWritablePaths: progress?.manualWritablePaths ?? [],
    onRefreshFiles: () => refreshSession({ preserveDocument: true }),
    progress,
    progressSummary,
    rootFiles,
    routeProjectId: routeState.kind === 'workbench' ? routeState.projectId : undefined,
    session,
    setIsWorkflowCollapsed,
    shouldRenderWorkflowPanelHost,
    strictAllowedWrites: progress?.allowedWrites ?? [],
    workflowRailFocusTargetRef,
    workflowSummary,
  };
  const workbenchOverlays = {
    fileTreeError,
    modelSettingsPanel,
    projectSwitchDialog,
    unsavedCloseDialog,
    uiError,
  };

  return (
    <WorkbenchView
      assistantPane={workbenchAssistantPane}
      contextRail={workbenchContextRail}
      editorPane={workbenchEditorPane}
      overlays={workbenchOverlays}
      projectShell={workbenchProjectShell}
    />
  );
}
