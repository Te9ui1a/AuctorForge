import type { ComponentPropsWithoutRef, CSSProperties, Dispatch, FormEvent, ReactNode, RefObject, SetStateAction } from 'react';

import { ChatPanel } from '../chat/ChatPanel';
import type { ChatTurnStrategy } from '../chat/chatTurnStrategy';
import type { ChatGenerationProgress } from '../chat/useChatStream';
import { DocumentEditor } from '../editor/DocumentEditor';
import { EditorTabs } from '../editor/EditorTabs';
import { FileTree } from '../files/FileTree';
import { MAX_ASSISTANT_RATIO, MIN_ASSISTANT_RATIO } from '../layout/workbenchCreativeSplit';
import { TopBar } from '../layout/TopBar';
import { StartupScreen } from '../startup/StartupScreen';
import { WorkflowPanel } from '../workflow/WorkflowPanel';
import type {
  ChatAttachment,
  ChatMessage,
  FileTreeGroup,
  PendingProposal,
  ProgressResponse,
  SessionResponse,
  WriteTargetHint,
} from '../workflow/types';

type WorkbenchContextRail = 'files' | 'workflow' | null;
type WorkbenchMode = 'create' | 'analyze';
type WorkflowSummary = ComponentPropsWithoutRef<typeof WorkflowPanel>['workflowSummary'];
type ProgressSummary = ComponentPropsWithoutRef<typeof WorkflowPanel>['summary'];
type DraftStateByPath = Record<string, { content: string; dirty: boolean }>;
type ProjectShellViewModel = {
  activeContextRail: WorkbenchContextRail;
  activeProjectId: string;
  activeProjectName: string;
  fileNavigationButtonRef: RefObject<HTMLButtonElement | null>;
  modelStatus: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onToggleContextRail: (panel: Exclude<WorkbenchContextRail, null>) => void;
  routeProjectId?: string;
  session: SessionResponse;
  workbenchIntentLabel?: string;
  workflowStatusButtonRef: RefObject<HTMLButtonElement | null>;
};
type EditorPaneViewModel = {
  activeProposalPreview?: PendingProposal['proposedWrites'][number];
  assistantRatio: number;
  beginSplitDrag: ComponentPropsWithoutRef<'button'>['onPointerDown'];
  canSaveCurrentDocument: boolean;
  cancelSplitDrag: ComponentPropsWithoutRef<'button'>['onPointerCancel'];
  creativeWorkspaceRef: RefObject<HTMLDivElement | null>;
  creativeWorkspaceStyle: CSSProperties;
  documentContent: string;
  documentPath: string;
  draftStateByPath: DraftStateByPath;
  endSplitDrag: ComponentPropsWithoutRef<'button'>['onPointerUp'];
  handleClosePath: (path: string) => void | Promise<void>;
  handleOpenFile: (path: string) => void | Promise<void>;
  handleSaveDocument: () => void | Promise<void>;
  handleSplitKeyDown: ComponentPropsWithoutRef<'button'>['onKeyDown'];
  isCreativeSplitDragging: boolean;
  moveSplitDrag: ComponentPropsWithoutRef<'button'>['onPointerMove'];
  openPaths: string[];
  resetSplit: ComponentPropsWithoutRef<'button'>['onDoubleClick'];
  setDocumentContent: (value: string) => void;
  setDraftStateByPath: Dispatch<SetStateAction<DraftStateByPath>>;
};
type AssistantPaneViewModel = {
  assistantStatus: 'idle' | 'thinking' | 'streaming';
  canContinueDiscussion: boolean;
  chatAttachments: ChatAttachment[];
  chatError: string;
  generationProgress: ChatGenerationProgress;
  chatInput: string;
  composerTurnStrategy: ChatTurnStrategy | null;
  handleChatSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  handleContinueDiscussion: () => void;
  handleRemoveAttachment: (name: string) => void;
  handleRetryChat: () => void;
  isChatBusy: boolean;
  messages: ChatMessage[];
  onOpenSettings: () => void;
  onPickFiles: (files: FileList | null) => void | Promise<void>;
  progress: ProgressResponse | null;
  setChatInput: (value: string) => void;
  writeTargetHint: WriteTargetHint;
};
type ContextRailViewModel = {
  activeContextRail: WorkbenchContextRail;
  activeProjectId: string;
  activeProjectName: string;
  closeContextRail: (panel: Exclude<WorkbenchContextRail, null>) => void;
  documentPath: string;
  fileTree: FileTreeGroup[];
  fileTreeRailFocusTargetRef: RefObject<HTMLButtonElement | null>;
  handleCreateFile: (name: string) => void | Promise<void>;
  handleCreateFolder: (name: string) => void | Promise<void>;
  handleOpenFile: (path: string) => void | Promise<void>;
  isWorkflowCollapsed: boolean;
  manualWritablePaths: string[];
  onRefreshFiles: () => void | Promise<void>;
  progress: ProgressResponse | null;
  progressSummary: ProgressSummary;
  rootFiles: Array<{ path: string; label: string }>;
  routeProjectId?: string;
  session: SessionResponse;
  setIsWorkflowCollapsed: Dispatch<SetStateAction<boolean>>;
  shouldRenderWorkflowPanelHost: boolean;
  strictAllowedWrites: string[];
  workflowRailFocusTargetRef: RefObject<HTMLButtonElement | null>;
  workflowSummary: WorkflowSummary;
};
type WorkbenchOverlaysViewModel = {
  fileTreeError: string;
  modelSettingsPanel: ReactNode;
  projectSwitchDialog: ReactNode;
  unsavedCloseDialog: ReactNode;
  uiError: string;
};
type WorkbenchViewProps = {
  assistantPane: AssistantPaneViewModel;
  contextRail: ContextRailViewModel;
  editorPane: EditorPaneViewModel;
  overlays: WorkbenchOverlaysViewModel;
  projectShell: ProjectShellViewModel;
};

export function LoadingView({
  projectSwitchDialog,
}: {
  projectSwitchDialog: ReactNode;
}) {
  return (
    <>
      <div className="startup-shell startup-loading">正在读取工作区...</div>
      {projectSwitchDialog}
    </>
  );
}

export function LauncherView({
  isLauncherManagerOpen,
  isStarting,
  launcherProjectId,
  modelSettingsPanel,
  onManagerOpenChange,
  onOpenSettings,
  onSelectProjectId,
  onStart,
  projectSwitchDialog,
  uiError,
}: {
  isLauncherManagerOpen: boolean;
  isStarting: boolean;
  launcherProjectId?: string;
  modelSettingsPanel: ReactNode;
  onManagerOpenChange: (isOpen: boolean) => void;
  onOpenSettings: () => void;
  onSelectProjectId: (projectId?: string) => void;
  onStart: (mode: WorkbenchMode, projectId?: string) => void | Promise<void>;
  projectSwitchDialog: ReactNode;
  uiError: string;
}) {
  return (
    <>
      <StartupScreen
        onStart={onStart}
        onOpenSettings={onOpenSettings}
        isStarting={isStarting}
        selectedProjectId={launcherProjectId}
        onSelectProjectId={onSelectProjectId}
        isManagerOpen={isLauncherManagerOpen}
        onManagerOpenChange={onManagerOpenChange}
      />
      {uiError ? <div className="ui-error-banner">{uiError}</div> : null}
      {modelSettingsPanel}
      {projectSwitchDialog}
    </>
  );
}

export function WorkbenchView({
  assistantPane,
  contextRail,
  editorPane,
  overlays,
  projectShell,
}: WorkbenchViewProps) {
  const {
    activeContextRail,
    activeProjectName,
    fileNavigationButtonRef,
    modelStatus,
    onBack,
    onOpenSettings,
    onToggleContextRail: handleToggleContextRail,
    session,
    workbenchIntentLabel,
    workflowStatusButtonRef,
  } = projectShell;
  const {
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
  } = editorPane;
  const {
    assistantStatus,
    canContinueDiscussion,
    chatAttachments,
    chatError,
    generationProgress,
    chatInput,
    composerTurnStrategy,
    handleChatSubmit,
    handleContinueDiscussion,
    handleRemoveAttachment,
    handleRetryChat,
    isChatBusy,
    messages,
    onOpenSettings: onOpenAssistantSettings,
    onPickFiles,
    progress: assistantProgress,
    setChatInput,
    writeTargetHint,
  } = assistantPane;
  const {
    activeProjectId,
    activeProjectName: contextRailProjectName,
    closeContextRail,
    documentPath: contextRailDocumentPath,
    fileTree,
    fileTreeRailFocusTargetRef,
    handleCreateFile,
    handleCreateFolder,
    handleOpenFile: handleContextRailOpenFile,
    isWorkflowCollapsed,
    manualWritablePaths,
    onRefreshFiles,
    progress: contextRailProgress,
    progressSummary,
    rootFiles,
    routeProjectId,
    session: contextRailSession,
    setIsWorkflowCollapsed,
    shouldRenderWorkflowPanelHost,
    strictAllowedWrites,
    workflowRailFocusTargetRef,
    workflowSummary,
  } = contextRail;
  const {
    fileTreeError,
    modelSettingsPanel,
    projectSwitchDialog,
    unsavedCloseDialog,
    uiError,
  } = overlays;
  return (
    <>
      {uiError ? <div className="ui-error-banner">{uiError}</div> : null}
      {fileTreeError ? <div className="ui-error-banner ui-warning-banner">{fileTreeError}</div> : null}
      <div
        className="workbench-shell relative isolate flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-[32px] px-3 pb-3 pt-2 lg:gap-3.5 lg:px-4 lg:pb-4 lg:pt-3"
        data-ui-layer="shell"
        data-shell-region="workbench-shell"
        data-shell-structure="quiet-environment"
        data-ui-surface="workbench-shell"
        data-workbench-context="single-workspace"
      >
        <TopBar
          projectName={activeProjectName || 'AuctorForge'}
          intentLabel={workbenchIntentLabel}
          stepTitle={session.currentStepTitle}
          chapterLabel={session.currentChapterNumber ? `第${String(session.currentChapterNumber).padStart(3, '0')}章` : undefined}
          modelStatus={modelStatus}
          activeContextRail={activeContextRail}
          fileNavigationButtonRef={fileNavigationButtonRef}
          onBack={onBack}
          onOpenSettings={onOpenSettings}
          onToggleContextRail={handleToggleContextRail}
          workflowStatusButtonRef={workflowStatusButtonRef}
        />
        <div
          data-ui-surface="workbench-grid"
          data-shell-region="workbench-grid"
          data-shell-continuity="shared-environment"
          data-workbench-layout="editor-primary"
          data-shell-balance="creative-dominant"
          data-context-rail-state={activeContextRail ? 'open' : 'closed'}
          data-context-rail-panel={activeContextRail ?? 'none'}
          className="app-shell grid min-h-0 flex-1 gap-2.5 lg:gap-3 max-xl:grid-cols-1"
        >
          <section
            className="relative flex min-h-0 min-w-0 flex-col overflow-hidden text-[color:var(--ui-surface-foreground)]"
            data-shell-region="editor-primary"
            data-shell-role="primary-editor"
            data-ui-surface="editor-primary"
            data-shell-tone="manuscript-stage"
            data-shell-frame="single-canvas"
          >
            <EditorTabs
              paths={openPaths}
              activePath={documentPath}
              dirtyPaths={Object.entries(draftStateByPath).filter(([, value]) => value.dirty).map(([path]) => path)}
              onSelect={(path) => void handleOpenFile(path)}
              onClose={(path) => void handleClosePath(path)}
            />
            <div
              ref={creativeWorkspaceRef}
              style={creativeWorkspaceStyle}
              className="grid min-h-0 flex-1 gap-3 xl:gap-0"
              data-shell-region="creative-workspace"
              data-shell-balance="creative-dominant"
              data-shell-composition="maximized-writing-surface"
              data-workbench-split-state={isCreativeSplitDragging ? 'dragging' : 'idle'}
            >
              <DocumentEditor
                path={documentPath}
                content={documentContent}
                canSave={canSaveCurrentDocument}
                isDirty={Boolean(documentPath && draftStateByPath[documentPath]?.dirty)}
                readOnly={Boolean(activeProposalPreview)}
                onChange={(value) => {
                  if (!documentPath) {
                    return;
                  }

                  setDocumentContent(value);
                  setDraftStateByPath((current) => ({
                    ...current,
                    [documentPath]: {
                      content: value,
                      dirty: true,
                    },
                  }));
                }}
                onSave={() => void handleSaveDocument()}
              />

              <button
                type="button"
                aria-label="调整编辑区和创作助手宽度"
                aria-orientation="vertical"
                aria-valuemax={Math.round(MAX_ASSISTANT_RATIO * 100)}
                aria-valuemin={Math.round(MIN_ASSISTANT_RATIO * 100)}
                aria-valuenow={Math.round(assistantRatio * 100)}
                className="workbench-creative-split-handle"
                data-workbench-split-handle="editor-assistant"
                onDoubleClick={resetSplit}
                onKeyDown={handleSplitKeyDown}
                onPointerCancel={cancelSplitDrag}
                onPointerDown={beginSplitDrag}
                onPointerMove={moveSplitDrag}
                onPointerUp={endSplitDrag}
                role="separator"
              />

              <section
                className="flex min-h-0 min-w-0 max-xl:border-t max-xl:border-white/8 max-xl:pt-4 xl:pl-5"
                data-shell-region="assistant-dock"
                data-shell-role="supporting-rail"
                data-shell-tone="collaborator-dock"
                data-shell-balance="supporting"
                data-shell-cohesion="live-band"
                data-dock-relationship="attached"
                data-shell-continuity="manuscript-linked"
              >
                <ChatPanel
                  messages={messages}
                  chatInput={chatInput}
                  assistantStatus={assistantStatus}
                  isBusy={isChatBusy}
                  onChangeInput={setChatInput}
                  onSubmit={handleChatSubmit}
                  attachments={chatAttachments}
                  onPickFiles={(files) => void onPickFiles(files)}
                  onRemoveAttachment={handleRemoveAttachment}
                  turnStrategy={composerTurnStrategy}
                  generationProgress={generationProgress}
                  onContinueDiscussion={canContinueDiscussion ? handleContinueDiscussion : undefined}
                  chatError={chatError}
                  writeTargetHint={writeTargetHint}
                  proposalTargets={assistantProgress?.pendingProposal?.proposedWrites}
                  onRetryChat={handleRetryChat}
                  onOpenSettings={onOpenAssistantSettings}
                />
              </section>
            </div>
          </section>

          {activeContextRail === 'files' ? (
            <aside
              className="workbench-context-rail"
              data-shell-region="workbench-context-rail"
              data-context-rail-panel="files"
              id="workbench-context-rail"
            >
              <div
                className="workbench-context-rail-panel"
                data-shell-region="workbench-context-rail-panel"
              >
                <FileTree
                  rootFiles={rootFiles}
                  groups={fileTree}
                  activePath={contextRailDocumentPath}
                  collapsed={false}
                  closeButtonRef={fileTreeRailFocusTargetRef}
                  persistenceKey={activeProjectId || routeProjectId || contextRailProjectName || 'default'}
                  onOpenFile={(path) => void handleContextRailOpenFile(path)}
                  onToggleCollapse={() => closeContextRail('files')}
                  onCreateFile={(name) => void handleCreateFile(name)}
                  onCreateFolder={(name) => void handleCreateFolder(name)}
                  onRefresh={() => void onRefreshFiles()}
                />
              </div>
            </aside>
          ) : null}
          {shouldRenderWorkflowPanelHost ? (
            <aside
              className={activeContextRail === 'workflow' ? 'workbench-context-rail' : 'workbench-context-rail-state-cache'}
              data-shell-region={activeContextRail === 'workflow' ? 'workbench-context-rail' : undefined}
              data-context-rail-panel={activeContextRail === 'workflow' ? 'workflow' : undefined}
              hidden={activeContextRail !== 'workflow'}
              aria-hidden={activeContextRail === 'workflow' ? undefined : true}
              id={activeContextRail === 'workflow' ? 'workbench-context-rail' : undefined}
            >
              <div
                className={activeContextRail === 'workflow' ? 'workbench-context-rail-panel' : undefined}
                data-shell-region={activeContextRail === 'workflow' ? 'workbench-context-rail-panel' : undefined}
                hidden={activeContextRail !== 'workflow'}
              >
                <WorkflowPanel
                  session={contextRailSession}
                  summary={progressSummary}
                  workflowSummary={workflowSummary}
                  requiredProjectReads={contextRailProgress?.requiredProjectReads ?? []}
                  allowedWrites={strictAllowedWrites}
                  strictWorkflowWrites={contextRailProgress?.strictWorkflowWrites}
                  chatAllowedWrites={contextRailProgress?.chatAllowedWrites}
                  manualWritablePaths={manualWritablePaths}
                  pendingDecision={contextRailProgress?.pendingDecision}
                  pendingProposal={contextRailProgress?.pendingProposal}
                  hidden={activeContextRail !== 'workflow'}
                  collapsed={isWorkflowCollapsed}
                  closeButtonRef={workflowRailFocusTargetRef}
                  onClose={() => closeContextRail('workflow')}
                  onToggleCollapse={() => setIsWorkflowCollapsed((current) => !current)}
                />
              </div>
            </aside>
          ) : null}
        </div>
      </div>
      {modelSettingsPanel}
      {projectSwitchDialog}
      {unsavedCloseDialog}
    </>
  );
}
