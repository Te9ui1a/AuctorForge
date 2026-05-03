import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { cp } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import Fastify, { type FastifyReply } from 'fastify';
import type { SessionResponse } from 'shared';

import { buildPrompt } from '../core/chat/buildPrompt';
import { isAssistantGenerationError } from '../core/chat/assistantErrors';
import {
  createDiscussionBuffer,
  isGuideDiscussionSubstepId,
} from '../core/chat/discussionBuffer';
import { isDiscussionGenerationError } from '../core/chat/discussionErrors';
import { generateAssistantReply } from '../core/chat/generateAssistantReply';
import { generateDiscussionReply } from '../core/chat/generateDiscussionReply';
import { planChatTurn } from '../core/chat/planChatTurn';
import {
  ProjectSessionStoreDataError,
  type ProjectSessionWorkflowSnapshot,
} from '../core/chat/projectSessionStore';
import { normalizeProjectPath } from '../core/compat/rules';
import { createProjectFile, createProjectFolder, ProjectEntryNameError } from '../core/files/createProjectEntry';
import { readProjectFile, readProjectFileIfExists, writeWorkflowFile } from '../core/files/fileGateway';
import { listProjectFiles } from '../core/files/listProjectFiles';
import { parseProjectProgress } from '../core/files/readProjectProgress';
import { VOLUME_CHAPTER_OUTLINE_PATH, chapterDraftPath, chapterLabel } from '../core/paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER } from '../core/paths/volumeContext';
import { extractReviewGate } from '../core/review/reviewGate';
import { augmentChapterReviewProposal } from '../core/review/reviewReportAugment';
import { defaultModelSettings, ModelSettingsValidationError, readActiveModelConfig, readModelSettings, testModelConfigConnection, type ModelConfig, type ModelSettingsStore, writeModelSettings } from '../core/settings/modelConfig';
import { buildAnalyzeProposal } from '../core/analyze/buildAnalyzeProposal';
import { initProject } from '../core/files/initProject';
import { syncWorkflowFiles } from '../core/files/syncWorkflowFiles';
import { readStructuredSummary } from '../core/memory/memoryStore';
import { buildGuideProposal } from '../core/guide/buildGuideProposal';
import { createActiveProjectContext } from '../core/projects/activeProjectContext';
import {
  createProject,
  importProject,
  openProject,
  repairProject,
} from '../core/projects/projectLifecycle';
import {
  archiveProject,
  defaultProjectRegistryStore,
  normalizeProjectRootPath,
  readProjectRegistry,
  removeProject,
  updateProjectMetadata,
} from '../core/projects/projectRegistry';
import { readProjectSummary } from '../core/projects/projectSummary';
import { createNativeFolderPicker, type FolderPicker } from '../core/system/folderPicker';
import {
  isProjectMode,
  type ProjectRegistryEntry,
  type ProjectRegistryStore,
} from '../core/projects/projectTypes';
import type { WorkflowTransitionTarget } from '../core/workflow/contracts/types';
import { buildStandardModeContract } from '../core/workflow/contracts/standardMode';
import { buildSoftFlowPolicy, isSoftWritablePath, shouldAutoAdvanceWorkflowAfterApproval } from '../core/workflow/softFlowPolicy';
import { advanceWorkflowState, createWorkflowState, getCurrentWorkflowStep, jumpToWorkflowStep, jumpToWorkflowTarget, type WorkflowReturnTarget } from '../core/workflow/stateMachine';
import { lintAiFlavor } from '../core/write/aiFlavorLint';
import { getMaxOutlinedChapterNumber, validateChapterDraftProposal } from '../core/write/chapterContract';
import {
  buildChatSessionResponse,
  parseChatSessionBody,
  readProjectSessionWithGuideDiscussionNotes,
  writeProjectSessionWithGuideDiscussionNotes,
} from './chatSessionInterop';
import { sendFolderPickerError, sendLifecycleError } from './apiErrors';
import {
  buildProjectRequestHeaders,
  resolveProjectRequestContext,
} from './projectRequestContext';
import {
  createChatTurnRegistry,
  createProjectRuntimeStateStore,
  normalizeRuntimeProjectKey,
  type RuntimeProjectKey,
} from './runtimeStateStore';
import {
  buildChatGenerationErrorResponse,
  normalizeChatMode,
  normalizeRequestId,
  type ChatMode,
  type ChatTurnBody,
} from './chatRouteHelpers';
import { createChatTurnService, type ChatTurnServiceHandler } from './chatTurnService';
import { createProposalApprovalService } from './proposalApprovalService';

type CreateAppOptions = {
  projectRoot?: string;
  skillPackPath: string;
  userConfigDir?: string;
  folderPicker?: FolderPicker;
};

const projectSessionWriteQueues = new Map<string, Promise<void>>();

type PendingProposal = {
  reply: string;
  sourceReads: Array<{
    path: string;
    baseHash: string | null;
  }>;
  proposedWrites: Array<{
    path: string;
    content: string;
    baseHash: string | null;
  }>;
  nextTarget?: WorkflowTransitionTarget | null;
  returnTarget?: WorkflowReturnTarget | null;
};

type PendingDecision = {
  reply: string;
  decisionType: 'substep_confirmation';
  nextTarget?: WorkflowTransitionTarget | null;
  returnTarget?: WorkflowReturnTarget | null;
};

type AssistantReply = Awaited<ReturnType<typeof generateAssistantReply>>;

type WriteTargetHint = {
  strictWorkflowWrites: string[];
  chatAllowedWrites: string[];
  activeDocumentPath: string | null;
  hasPendingProposal: boolean;
};

type ProjectRuntimeState = {
  projectRoot: string;
  initialized: boolean;
  workflowState: ReturnType<typeof createWorkflowState>;
  pendingProposal: PendingProposal | null;
  pendingDecision: PendingDecision | null;
  discussionBuffer: ReturnType<typeof createDiscussionBuffer>;
};

type ChatAttachment = NonNullable<ChatTurnBody['attachments']>[number];

type ChatTurnContext = {
  message: string;
  approved: boolean;
  chatMode: ChatMode;
  isAutoMode: boolean;
  isPlanMode: boolean;
  activeDocumentPath: string | null;
  attachments: ChatAttachment[];
  routeReply: FastifyReply;
};

const FALSE_WRITE_CLAIM_PATTERN =
  /(已经?.{0,24}(写入|保存|落盘|同步)|已为你.{0,16}(写好|保存)|后台保存|后台已保存|已经提交写入|已生成并写入|已将.{0,20}写入)/u;

export function createApp({
  projectRoot: initialProjectRoot,
  skillPackPath,
  userConfigDir = process.env.VITEST ? initialProjectRoot ?? homedir() : homedir(),
  folderPicker = createNativeFolderPicker(),
}: CreateAppOptions) {
  const app = Fastify();
  app.setErrorHandler((error, request, reply) => {
    if (
      request.method === 'PUT'
      && request.url === '/api/file'
      && (error as { code?: string }).code === 'FST_ERR_CTP_INVALID_JSON_BODY'
    ) {
      return reply.code(400).send({
        error: {
          code: 'invalid-file-save-payload',
          message: '保存文件请求必须包含字符串 path 和 content。',
        },
      });
    }

    return reply.send(error);
  });

  const contract = buildStandardModeContract(skillPackPath);
  const activeProjectContext = createActiveProjectContext(
    initialProjectRoot
      ? {
          projectId: null,
          rootPath: normalizeProjectRootPath(initialProjectRoot),
          displayName: null,
        }
      : null,
  );
  let runtimeState = createProjectRuntimeState(activeProjectContext.get()?.rootPath ?? '');
  const runtimeStateScope = new AsyncLocalStorage<{ state: ProjectRuntimeState; projectKey: RuntimeProjectKey | null }>();
  const liveMemoryStore = createProjectRuntimeStateStore<ProjectRuntimeState>();
  const chatTurnRegistry = createChatTurnRegistry<unknown>();
  const proposalApprovalService = createProposalApprovalService<PendingProposal, PendingDecision, ProjectRuntimeState['workflowState']>({
    buildSessionResponse,
    hashContent,
    readProjectFileIfExists,
    getCurrentStep,
    advanceWorkflowState: (workflowState, event) => advanceWorkflowState(contract, workflowState, event),
    jumpToWorkflowTarget: (workflowState, nextTarget, options) => jumpToWorkflowTarget(contract, workflowState, nextTarget, options),
    syncWorkflowFiles,
  });
  const workflowSnapshotsBeforeTurn = new WeakMap<ChatTurnContext, string | null>();
  const commandHandlers: Array<ChatTurnServiceHandler<ChatTurnContext, unknown>> = [
    { name: 'approval', handle: handleApprovalCommand },
    { name: 'progress-summary', handle: handleProgressSummaryCommand },
    { name: 'chapter-finalization', handle: handleChapterFinalizationCommand },
    { name: 'explicit-chapter-write', handle: handleExplicitChapterWriteCommand },
    { name: 'continue-next-chapter-from-review', handle: handleContinueNextChapterFromReviewCommand },
    { name: 'plan-mode', handle: handlePlanModeCommand },
    { name: 'pending-state-interruption', handle: handlePendingStateInterruptionCommand },
    { name: 'enter-guide', handle: handleEnterGuideCommand },
    { name: 'guide-step', handle: handleGuideStepCommand },
    { name: 'enter-define', handle: handleEnterDefineCommand },
    { name: 'enter-analyze', handle: handleEnterAnalyzeCommand },
    { name: 'analyze-exit', handle: handleAnalyzeExitCommand },
    { name: 'analyze-step', handle: handleAnalyzeStepCommand },
    { name: 'chapter-pause', handle: handleChapterPauseCommand },
    { name: 'review', handle: handleReviewCommand },
    { name: 'outline-to-chapter-write', handle: handleOutlineToChapterWriteCommand },
    { name: 'auto-planner', handle: handleAutoPlannerCommand },
    { name: 'discussion-hold', handle: handleDiscussionHoldCommand },
  ];
  const chatTurnService = createChatTurnService<ProjectRuntimeState, RuntimeProjectKey | null, ChatTurnBody, FastifyReply, ChatTurnContext, unknown>({
    runInScope: ({ state, projectKey }, run) => runtimeStateScope.run({ state, projectKey }, run),
    getRequestId: (body) => normalizeRequestId(body.requestId),
    getActiveProjectKey: () => getRequestProjectKey(),
    readCompleted: (projectKey, requestId) => chatTurnRegistry.readCompleted(projectKey, requestId),
    buildContext: ({ body, routeReply }) => {
      const {
        message,
        approved = false,
        chatMode: rawChatMode,
        activeDocumentPath = null,
        attachments = [],
      } = body;
      const chatMode = normalizeChatMode(rawChatMode);

      return {
        message,
        approved,
        chatMode,
        isAutoMode: chatMode === 'auto',
        isPlanMode: chatMode === 'plan',
        activeDocumentPath,
        attachments,
        routeReply,
      };
    },
    handlers: commandHandlers,
    fallback: ({ message: userMessage, attachments, activeDocumentPath, routeReply }) => generateAssistantProposalTurn({
      userMessage,
      attachments,
      activeDocumentPath,
      routeReply,
    }),
    beforeRun: ({ context }) => {
      if (context.isPlanMode) {
        getRuntimeState().pendingProposal = null;
        getRuntimeState().pendingDecision = null;
      }

      workflowSnapshotsBeforeTurn.set(
        context,
        getRuntimeState().initialized ? JSON.stringify(buildWorkflowSnapshot()) : null,
      );
    },
    afterRun: async ({ context }) => {
      const workflowSnapshotBeforeTurn = workflowSnapshotsBeforeTurn.get(context) ?? null;
      const workflowSnapshotAfterTurn = getRuntimeState().initialized
        ? JSON.stringify(buildWorkflowSnapshot())
        : null;
      if (workflowSnapshotBeforeTurn !== workflowSnapshotAfterTurn) {
        await persistRuntimeSessionSnapshot();
      }
      workflowSnapshotsBeforeTurn.delete(context);
    },
  });
  const chatRequestProjectKeys = new WeakMap<object, RuntimeProjectKey | null>();

  function createProjectRuntimeState(projectRoot: string): ProjectRuntimeState {
    return {
      projectRoot,
      initialized: false,
      workflowState: createWorkflowState(contract),
      pendingProposal: null,
      pendingDecision: null,
      discussionBuffer: createDiscussionBuffer(),
    };
  }

  function getRuntimeState() {
    return runtimeStateScope.getStore()?.state ?? runtimeState;
  }

  function getRequestProjectKey() {
    return runtimeStateScope.getStore()?.projectKey ?? getActiveProjectKey();
  }

  function getChatRequestProjectKey(request: object) {
    return chatRequestProjectKeys.get(request) ?? getRequestProjectKey();
  }

  function getActiveProjectKey() {
    const activeProject = activeProjectContext.get();

    if (activeProject === null) {
      return normalizeRuntimeProjectKey(getRuntimeState().projectRoot ? { projectId: null, rootPath: getRuntimeState().projectRoot } : null);
    }

    return normalizeRuntimeProjectKey({
      projectId: activeProject.projectId,
      rootPath: activeProject.rootPath,
    });
  }

  function getProjectKeyForActiveProject(activeProject: NonNullable<ReturnType<typeof activeProjectContext.get>>) {
    return normalizeRuntimeProjectKey({
      projectId: activeProject.projectId,
      rootPath: activeProject.rootPath,
    });
  }

  function saveLiveMemoryState(key = getActiveProjectKey()) {
    if (key === null) {
      return;
    }

    liveMemoryStore.save(key, runtimeState);
  }

  function resetLiveMemoryState() {
    runtimeState = createProjectRuntimeState(getRuntimeState().projectRoot);
  }

  async function restoreProjectSessionState(rootPath: string) {
    resetLiveMemoryState();

    const savedSession = await readRecoverableProjectSession(rootPath);
    if (savedSession === null) {
      return;
    }

    getRuntimeState().discussionBuffer.restore(savedSession.discussionNotes);

    const restoredWorkflow = restoreWorkflowState(savedSession.workflow);
    if (restoredWorkflow === null) {
      return;
    }

    getRuntimeState().initialized = restoredWorkflow.initialized;
    getRuntimeState().workflowState = restoredWorkflow.state;
  }

  async function syncActiveProject(entry: ProjectRegistryEntry, displayName = entry.displayName) {
    const previousProjectKey = getActiveProjectKey();
    saveLiveMemoryState(previousProjectKey);

    const switched = activeProjectContext.switchActiveProject({
      projectId: entry.id,
      rootPath: entry.rootPath,
      displayName,
    });
    const nextProjectRoot = switched.current.rootPath;

    if (switched.changed) {
      const nextProjectKey = getActiveProjectKey();
      const savedLiveMemory = liveMemoryStore.read(nextProjectKey);

      if (savedLiveMemory) {
        runtimeState = savedLiveMemory;
      } else {
        runtimeState = createProjectRuntimeState(nextProjectRoot);
        await restoreProjectSessionState(nextProjectRoot);
        saveLiveMemoryState(nextProjectKey);
      }
    } else {
      getRuntimeState().projectRoot = nextProjectRoot;
    }
  }

  function clearActiveProject() {
    saveLiveMemoryState();
    const cleared = activeProjectContext.clear();

    if (cleared.changed) {
      runtimeState = createProjectRuntimeState('');
    }
  }

  function requireActiveProject(reply: FastifyReply) {
    const activeProject = activeProjectContext.get();

    if (activeProject === null) {
      reply.code(409).send({
        error: {
          code: 'no-active-project',
          message: '当前没有活动项目，请先创建、导入或打开项目。',
        },
      });
      return null;
    }

    getRuntimeState().projectRoot = activeProject.rootPath;
    return activeProject;
  }

  function requireActiveRuntimeState(reply: FastifyReply) {
    const activeProject = requireActiveProject(reply);
    if (activeProject === null) {
      return null;
    }

    return selectRuntimeStateForActiveProject(activeProject);
  }

  async function resolveRuntimeStateForRequest(
    headers: Parameters<typeof resolveProjectRequestContext>[0],
    reply: FastifyReply,
    options: { requireActiveProject?: boolean } = { requireActiveProject: true },
  ) {
    const projectContext = resolveProjectRequestContext(headers, await readRegistryStore());

    if (projectContext.kind === 'error') {
      reply.code(projectContext.statusCode).send(projectContext.payload);
      return null;
    }

    if (projectContext.kind === 'project') {
      await syncActiveProject(projectContext.entry);
      return requireActiveRuntimeState(reply);
    }

    return options.requireActiveProject === false
      ? resolveOptionalActiveRuntimeState()
      : requireActiveRuntimeState(reply);
  }

  function selectRuntimeStateForActiveProject(activeProject: NonNullable<ReturnType<typeof activeProjectContext.get>>) {
    const activeProjectKey = getProjectKeyForActiveProject(activeProject);
    const savedRuntimeState = liveMemoryStore.read(activeProjectKey);
    if (savedRuntimeState) {
      runtimeState = savedRuntimeState;
      return savedRuntimeState;
    }

    const nextRuntimeState = getRuntimeState().projectRoot === activeProject.rootPath
      ? runtimeState
      : createProjectRuntimeState(activeProject.rootPath);
    liveMemoryStore.save(activeProjectKey, nextRuntimeState);
    runtimeState = nextRuntimeState;
    return nextRuntimeState;
  }

  function resolveOptionalActiveRuntimeState() {
    const activeProject = activeProjectContext.get();
    return activeProject === null ? runtimeState : selectRuntimeStateForActiveProject(activeProject);
  }

  function sendDiscussionError(reply: FastifyReply, error: unknown) {
    if (!isDiscussionGenerationError(error)) {
      throw error;
    }

    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    return reply.code(error.statusCode).send({
      ...buildChatGenerationErrorResponse({
        code: error.code,
        message: error.message,
        details: error.details,
        session: buildSessionResponse(),
      }),
      pendingDecision: null,
    });
  }

  function sendAssistantError(reply: FastifyReply, error: unknown) {
    if (!isAssistantGenerationError(error)) {
      throw error;
    }

    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    return reply.code(error.statusCode).send({
      ...buildChatGenerationErrorResponse({
        code: error.code,
        message: error.message,
        details: error.details,
        session: buildSessionResponse(),
      }),
      pendingDecision: null,
    });
  }

  async function readRegistryStore() {
    return (await readProjectRegistry(userConfigDir)) ?? defaultProjectRegistryStore();
  }

  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      return;
    }

    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return;
    }
    chatRequestProjectKeys.set(request, getActiveProjectKey());

    const requestBody = request.body as Partial<ChatTurnBody> | undefined;
    const requestId = normalizeRequestId(requestBody?.requestId);
    const activeProjectKey = getChatRequestProjectKey(request);

    if (!requestId || !activeProjectKey) {
      return;
    }

    const completedTurn = chatTurnRegistry.readCompleted(activeProjectKey, requestId);
    if (completedTurn !== undefined) {
      if (isCachedChatErrorPayload(completedTurn)) {
        return reply.code(502).send(completedTurn);
      }

      return reply.send(completedTurn);
    }

    const turn = chatTurnRegistry.start(activeProjectKey, requestId);
    if (turn.status === 'in-flight') {
      try {
        const completedTurn = await turn.promise;
        if (isCachedChatErrorPayload(completedTurn)) {
          return reply.code(502).send(completedTurn);
        }

        return reply.send(completedTurn);
      } catch {
        return reply.code(502).send({
          error: {
            code: 'chat-turn-failed',
            message: '聊天请求未完成，请重试。',
          },
        });
      }
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      return payload;
    }

    const requestBody = request.body as Partial<ChatTurnBody> | undefined;
    const requestId = normalizeRequestId(requestBody?.requestId);
    const activeProjectKey = getChatRequestProjectKey(request);

    if (!requestId || !activeProjectKey || typeof payload !== 'string') {
      return payload;
    }

    try {
      const parsedPayload = JSON.parse(payload) as unknown;
      chatTurnRegistry.complete(activeProjectKey, requestId, parsedPayload);
    } catch {
      if (reply.statusCode !== 200) {
        chatTurnRegistry.reject(activeProjectKey, requestId, new Error(`Chat turn failed with status ${reply.statusCode}`));
      }
    }

    return payload;
  });

  app.addHook('onError', async (request, _reply, error) => {
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      return;
    }

    const requestBody = request.body as Partial<ChatTurnBody> | undefined;
    const requestId = normalizeRequestId(requestBody?.requestId);
    const activeProjectKey = getChatRequestProjectKey(request);

    if (!requestId || !activeProjectKey) {
      return;
    }

    chatTurnRegistry.reject(activeProjectKey, requestId, error);
  });

  async function buildDiscussionTurnResponse(
    routeReply: FastifyReply,
    userMessage: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
    options: {
      preservePendingState?: boolean;
    } = {},
  ) {
    try {
      const reply = await generateDiscussionTurn(userMessage, attachments, activeDocumentPath);

      return {
        reply,
        session: buildSessionResponse(),
        pendingDecision: options.preservePendingState ? getRuntimeState().pendingDecision : null,
        pendingProposal: options.preservePendingState ? getRuntimeState().pendingProposal : null,
      };
    } catch (error) {
      return sendDiscussionError(routeReply, error);
    }
  }

  function resolveActiveEntry(store: ProjectRegistryStore) {
    if (store.activeProjectId === null) {
      return null;
    }

    return store.projects.find((entry) => entry.id === store.activeProjectId) ?? null;
  }

  async function reconcileActiveProjectWithStore(
    store: ProjectRegistryStore,
    options: {
      allowLegacyFallback?: boolean;
    } = {},
  ) {
    const activeEntry = resolveActiveEntry(store);

    if (activeEntry !== null) {
      await syncActiveProject(activeEntry);
      return activeEntry;
    }

    const allowLegacyFallback = options.allowLegacyFallback ?? false;
    const contextProject = activeProjectContext.get();
    const keepLegacyFallback =
      allowLegacyFallback
      && store.activeProjectId === null
      && store.projects.length === 0
      && contextProject !== null
      && contextProject.projectId === null;

    if (!keepLegacyFallback) {
      clearActiveProject();
    }

    return null;
  }

  async function readProjectCard(entry: ProjectRegistryEntry) {
    const summary = await readProjectSummary({ rootPath: entry.rootPath, registryEntry: entry });

    return {
      ...entry,
      displayName: summary.displayName,
      status: summary.status,
      phase: summary.phase,
      coreTask: summary.coreTask,
      nextSuggestion: summary.nextSuggestion,
      currentChapterNumber: summary.currentChapterNumber,
      manifest: summary.manifest,
    };
  }

  async function readProjectListResponse(store: ProjectRegistryStore) {
    const projects = await Promise.all(store.projects.map((entry) => readProjectCard(entry)));

    return {
      activeProjectId: store.activeProjectId,
      projects,
    };
  }

  app.addHook('onReady', async () => {
    const store = await readRegistryStore();
    await reconcileActiveProjectWithStore(store, { allowLegacyFallback: true });
  });

  app.get<{ Headers: { 'x-active-document-path'?: string } }>('/api/session', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply, { requireActiveProject: false });
    if (state === null) {
      return reply;
    }

    const activeDocumentPath = readActiveDocumentPathHeader(request.headers['x-active-document-path']);
    return buildSessionResponseFor(state, activeDocumentPath);
  });

  app.get<{ Headers: { 'x-active-document-path'?: string } }>('/api/chat/session', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    const activeDocumentPath = readActiveDocumentPathHeader(request.headers['x-active-document-path']);
    const savedSession = await readRecoverableProjectSession(state.projectRoot);
    return buildChatSessionResponse(savedSession?.messages ?? [], buildWriteTargetHintFor(state, { activeDocumentPath }));
  });

  app.put<{ Body: Record<string, unknown>; Headers: { 'x-active-document-path'?: string } }>('/api/chat/session', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    const activeDocumentPath = readActiveDocumentPathHeader(request.headers['x-active-document-path']);
    const requestBody = parseChatSessionBody(request.body);
    if (requestBody === null) {
      return reply.code(400).send({
        error: {
          code: 'invalid-chat-session-payload',
          message: '聊天会话只接受 messages 字段，且 workflow / discussion / approval 状态由服务端维护。',
        },
      });
    }

    const savedSession = await writeQueuedProjectSession(state.projectRoot, {
      messages: requestBody.messages,
      discussionNotes: state.discussionBuffer.snapshot(),
      workflow: buildWorkflowSnapshotFor(state),
    });

    return buildChatSessionResponse(savedSession.messages, buildWriteTargetHintFor(state, { activeDocumentPath }));
  });

  app.get('/api/settings/model', async () => (await readModelSettings(userConfigDir)) ?? defaultModelSettings());

  app.post<{ Body: ModelSettingsStore }>('/api/settings/model', async (request, reply) => {
    try {
      return await writeModelSettings(userConfigDir, request.body);
    } catch (error) {
      if (error instanceof ModelSettingsValidationError) {
        return reply.code(400).send({
          error: {
            code: 'invalid-model-settings',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.post<{ Body: ModelConfig }>('/api/settings/model/test', async (request, reply) => {
    try {
      return await testModelConfigConnection(request.body);
    } catch (error) {
      if (error instanceof ModelSettingsValidationError) {
        return reply.code(400).send({
          error: {
            code: 'invalid-model-settings',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.get('/api/projects', async () => {
    const store = await readRegistryStore();
    await reconcileActiveProjectWithStore(store, { allowLegacyFallback: true });
    return readProjectListResponse(store);
  });

  app.get('/api/projects/active', async () => {
    const store = await readRegistryStore();
    const activeEntry = await reconcileActiveProjectWithStore(store, { allowLegacyFallback: true });

    if (store.activeProjectId === null || activeEntry === null) {
      return {
        activeProjectId: null,
        project: null,
      };
    }

    return {
      activeProjectId: store.activeProjectId,
      project: await readProjectCard(activeEntry),
    };
  });

  app.post<{ Body: { purpose?: 'create' | 'import'; defaultPath?: string } }>('/api/projects/pick-folder', async (request, reply) => {
    try {
      const path = await folderPicker.pickFolder({
        prompt: request.body.purpose === 'import' ? '选择已有项目文件夹' : '选择项目文件夹或新建文件夹',
        defaultPath: request.body.defaultPath,
      });

      return { path };
    } catch (error) {
      return sendFolderPickerError(reply, error);
    }
  });

  app.post<{ Body: { displayName: string; rootPath: string; entryMode?: string } }>('/api/projects', async (request, reply) => {
    const entryMode = isProjectMode(request.body.entryMode) ? request.body.entryMode : 'create';

    try {
      const result = await createProject({
        userConfigDir,
        rootPath: request.body.rootPath,
        displayName: request.body.displayName,
        entryMode,
        skillPackPath,
      });

      await reconcileActiveProjectWithStore(result.store);

      return {
        activeProjectId: result.store.activeProjectId,
        project: await readProjectCard(result.entry),
        session: buildSessionResponse(),
      };
    } catch (error) {
      return sendLifecycleError(reply, error);
    }
  });

  app.post('/api/projects/sample', async (_request, reply) => {
    const sampleRoot = path.join(userConfigDir, '.auctorforge', 'samples', 'workflow-sample');

    try {
      const result = await createProject({
        userConfigDir,
        rootPath: sampleRoot,
        displayName: 'Workflow Sample',
        entryMode: 'create',
        skillPackPath,
        createProjectId: () => 'sample_workflow',
      });

      await copySampleProjectFiles(sampleRoot, skillPackPath);
      await reconcileActiveProjectWithStore(result.store);

      return {
        activeProjectId: result.store.activeProjectId,
        project: await readProjectCard(result.entry),
        session: buildSessionResponse(),
      };
    } catch (error) {
      return sendLifecycleError(reply, error);
    }
  });

  app.post<{ Body: { rootPath: string; displayName?: string; entryMode?: string } }>('/api/projects/import', async (request, reply) => {
    const entryMode = isProjectMode(request.body.entryMode) ? request.body.entryMode : 'reference';

    try {
      const result = await importProject({
        userConfigDir,
        rootPath: request.body.rootPath,
        displayName: request.body.displayName,
        entryMode,
        skillPackPath,
      });

      await reconcileActiveProjectWithStore(result.store);

      return {
        activeProjectId: result.store.activeProjectId,
        project: await readProjectCard(result.entry),
        session: buildSessionResponse(),
      };
    } catch (error) {
      return sendLifecycleError(reply, error);
    }
  });

  app.post<{ Body: { projectId: string; entryMode?: string } }>('/api/projects/open', async (request, reply) => {
    const entryMode = isProjectMode(request.body.entryMode) ? request.body.entryMode : undefined;

    try {
      const result = await openProject({
        userConfigDir,
        projectId: request.body.projectId,
        entryMode,
      });

      await reconcileActiveProjectWithStore(result.store);

      return {
        activeProjectId: result.store.activeProjectId,
        project: await readProjectCard(result.entry),
        session: buildSessionResponse(),
      };
    } catch (error) {
      return sendLifecycleError(reply, error);
    }
  });

  app.post<{ Body: { projectId: string; entryMode?: string } }>('/api/projects/repair', async (request, reply) => {
    const entryMode = isProjectMode(request.body.entryMode) ? request.body.entryMode : undefined;

    try {
      const result = await repairProject({
        userConfigDir,
        projectId: request.body.projectId,
        entryMode,
        skillPackPath,
      });

      await reconcileActiveProjectWithStore(result.store);

      return {
        activeProjectId: result.store.activeProjectId,
        project: await readProjectCard(result.entry),
        session: buildSessionResponse(),
      };
    } catch (error) {
      return sendLifecycleError(reply, error);
    }
  });

  app.post<{ Body: { projectId: string; archived?: boolean } }>('/api/projects/archive', async (request, reply) => {
    const existingStore = await readRegistryStore();
    const existingEntry = existingStore.projects.find((entry) => entry.id === request.body.projectId) ?? null;

    if (existingEntry === null) {
      return reply.code(404).send({
        error: {
          code: 'not-found',
          message: `Project "${request.body.projectId}" is not registered.`,
          details: {
            projectId: request.body.projectId,
          },
        },
      });
    }

    const shouldArchive = request.body.archived ?? true;
    const nextStore = shouldArchive
      ? await archiveProject(userConfigDir, request.body.projectId)
      : await updateProjectMetadata(userConfigDir, request.body.projectId, {
          archived: false,
          updatedAt: new Date().toISOString(),
        });
    await reconcileActiveProjectWithStore(nextStore);

    const nextEntry = nextStore.projects.find((entry) => entry.id === request.body.projectId) ?? null;

    return {
      activeProjectId: nextStore.activeProjectId,
      project: nextEntry ? await readProjectCard(nextEntry) : null,
    };
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const existingStore = await readRegistryStore();
    const existingEntry = existingStore.projects.find((entry) => entry.id === request.params.id) ?? null;

    if (existingEntry === null) {
      return reply.code(404).send({
        error: {
          code: 'not-found',
          message: `Project "${request.params.id}" is not registered.`,
          details: {
            projectId: request.params.id,
          },
        },
      });
    }

    const nextStore = await removeProject(userConfigDir, request.params.id);
    await reconcileActiveProjectWithStore(nextStore);

    return {
      activeProjectId: nextStore.activeProjectId,
      removedProjectId: request.params.id,
    };
  });

  app.post('/api/workspace/init', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    await initProject({ projectRoot: state.projectRoot, skillPackPath });
    state.initialized = true;
    state.workflowState = createWorkflowState(contract);
    state.pendingProposal = null;
    state.pendingDecision = null;
    state.discussionBuffer.clear();

    return buildSessionResponseFor(state);
  });

  app.get<{ Headers: { 'x-active-document-path'?: string } }>('/api/progress', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    const rawActiveDocumentPath = request.headers['x-active-document-path'];
    const activeDocumentPath = readActiveDocumentPathHeader(rawActiveDocumentPath);

    if (!state.initialized) {
      return {
        session: buildSessionResponseFor(state, activeDocumentPath),
        writeTargetHint: buildWriteTargetHintFor(state, { activeDocumentPath }),
        requiredProjectReads: [],
        allowedWrites: [],
        strictWorkflowWrites: [],
        chatAllowedWrites: [],
        manualWritablePaths: [],
        nextStepId: null,
        nextSubstepId: null,
        progressSummary: await readProgressSummaryFor(state),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    const currentStep = getCurrentStepFor(state);
    const writePolicy = getCurrentWritePolicyFor(state, activeDocumentPath);
    const progressSummary = await readProgressSummaryFor(state);

    return {
      session: buildSessionResponseFor(state, activeDocumentPath),
      writeTargetHint: buildWriteTargetHintFor(state, { activeDocumentPath, writePolicy }),
      requiredProjectReads: currentStep.requiredProjectReads,
      allowedWrites: currentStep.allowedWrites,
      strictWorkflowWrites: writePolicy.strictWorkflowWrites,
      chatAllowedWrites: writePolicy.chatAllowedWrites,
      manualWritablePaths: writePolicy.manualWritablePaths,
      nextStepId: currentStep.nextStepId,
      nextSubstepId: currentStep.nextSubstepId,
      progressSummary,
      pendingDecision: state.pendingDecision,
      pendingProposal: state.pendingProposal,
    };
  });

  app.get<{ Querystring: { path: string } }>('/api/file', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    return {
      path: request.query.path,
      content: await readProjectFile(state.projectRoot, request.query.path),
    };
  });

  app.get('/api/files/tree', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    return listProjectFiles(state.projectRoot);
  });

  app.post<{ Body: { parentPath: string; name: string } }>('/api/files/create-folder', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    if (state.pendingProposal !== null) {
      return reply.code(409).send({ message: '当前存在待确认提案，暂时不能创建目录。' });
    }

    try {
      const body = readProjectEntryRequestBody(request.body);
      return await createProjectFolder(state.projectRoot, body.parentPath, body.name);
    } catch (error) {
      if (error instanceof ProjectEntryNameError) {
        return reply.code(400).send({
          error: {
            code: 'invalid-project-entry-name',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.post<{ Body: { parentPath: string; name: string } }>('/api/files/create-file', async (request, reply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    if (state.pendingProposal !== null) {
      return reply.code(409).send({ message: '当前存在待确认提案，暂时不能创建文件。' });
    }

    try {
      const body = readProjectEntryRequestBody(request.body);
      return await createProjectFile(state.projectRoot, body.parentPath, body.name);
    } catch (error) {
      if (error instanceof ProjectEntryNameError) {
        return reply.code(400).send({
          error: {
            code: 'invalid-project-entry-name',
            message: error.message,
          },
        });
      }

      throw error;
    }
  });

  app.put<{ Body: unknown }>('/api/file', async (request, reply) => {
    const body = readFileSaveRequestBody(request.body);
    if (body === null) {
      return reply.code(400).send({
        error: {
          code: 'invalid-file-save-payload',
          message: '保存文件请求必须包含字符串 path 和 content。',
        },
      });
    }

    const state = await resolveRuntimeStateForRequest(request.headers, reply);
    if (state === null) {
      return reply;
    }

    const currentStep = getCurrentStepFor(state);
    const writePolicy = getCurrentWritePolicyFor(state);
    const normalizedWritePath = normalizeProjectPath(body.path);
    const strictWritePathSet = new Set(writePolicy.strictWorkflowWrites.map(normalizeProjectPath));
    const writesStrictWorkflowTarget = strictWritePathSet.has(normalizedWritePath);
    const writesSoftOffStagePath = !writesStrictWorkflowTarget && isSoftWritablePath(normalizedWritePath);

    if (state.pendingProposal !== null) {
      if (!writesSoftOffStagePath) {
        return reply.code(409).send({
          ok: false,
          message: '当前存在待确认提案，请先确认或重新生成提案后再保存文件。',
          session: buildSessionResponseFor(state),
          pendingDecision: state.pendingDecision,
          pendingProposal: state.pendingProposal,
        });
      }

      if (proposalTouchesPath(state.pendingProposal, normalizedWritePath)) {
        state.pendingProposal = null;
        state.pendingDecision = null;
      }
    }

    const manualAllowedWrites = writesSoftOffStagePath
      ? [...writePolicy.manualWritablePaths, normalizedWritePath]
      : writePolicy.manualWritablePaths;

    await writeWorkflowFile({
      projectRoot: state.projectRoot,
      relativePath: body.path,
      content: body.content,
      allowedWrites: manualAllowedWrites,
    });
    await syncWorkflowFiles({
      projectRoot: state.projectRoot,
      stepId: currentStep.id,
      substepId: currentStep.substepId,
      volumeNumber: state.workflowState.volumeNumber,
      chapterNumber: state.workflowState.chapterNumber,
    });

    return {
      ok: true,
      session: buildSessionResponseFor(state),
      pendingDecision: state.pendingDecision,
      pendingProposal: state.pendingProposal,
    };
  });

  app.post<{ Body: ChatTurnBody }>('/api/chat', async (request, routeReply) => {
    const state = await resolveRuntimeStateForRequest(request.headers, routeReply);
    if (state === null) {
      return routeReply;
    }
    chatRequestProjectKeys.set(request, getActiveProjectKey());

    return chatTurnService.run(state, getChatRequestProjectKey(request), request.body, routeReply);
  });

  function handleApprovalCommand({ message, approved, isPlanMode }: ChatTurnContext) {
    const treatAsApproval =
      !isPlanMode
      && (approved || ((getRuntimeState().pendingProposal !== null || getRuntimeState().pendingDecision !== null) && isExplicitApprovalMessage(message)));

    return treatAsApproval ? handleApprovalTurn({ message, approved }) : null;
  }

  function handleProgressSummaryCommand({ message }: ChatTurnContext) {
    return message.includes('检查进度') || message.includes('下一步做什么')
      ? handleProgressSummaryTurn()
      : null;
  }

  function handleContinueNextChapterFromReviewCommand({ message }: ChatTurnContext) {
    const requestedChapterNumber = extractRequestedChapterNumber(message);
    if (
      requestedChapterNumber !== null
      && requestedChapterNumber !== getRuntimeState().workflowState.chapterNumber + 1
    ) {
      return null;
    }

    return shouldContinueNextChapterFromReview(getCurrentStep(), message)
      ? handleContinueNextChapterFromReviewTurn()
      : null;
  }

  function handlePlanModeCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
    isPlanMode,
  }: ChatTurnContext) {
    return isPlanMode && !isReviewTrigger(message) && !shouldBypassPlanModeForWorkflowAction(getCurrentStep(), message)
      ? handlePlanModeTurn(message, attachments, activeDocumentPath, routeReply)
      : null;
  }

  async function handlePendingStateInterruptionCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    if (!getRuntimeState().pendingProposal && !getRuntimeState().pendingDecision) {
      return null;
    }

    return handlePendingStateInterruptionTurn(message, attachments, activeDocumentPath, routeReply);
  }

  function handleEnterGuideCommand({ message }: ChatTurnContext) {
    return isGuideTrigger(message) ? enterGuideMode() : null;
  }

  function handleGuideStepCommand({ message }: ChatTurnContext) {
    return getCurrentStep().module === 'guide' && !isGuideFreeformSubstep(getCurrentStep())
      ? handleGuideTurn(message)
      : null;
  }

  function handleEnterDefineCommand({ message }: ChatTurnContext) {
    return isDefineTrigger(message) ? enterDefineMode() : null;
  }

  function handleEnterAnalyzeCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    return isAnalyzeTrigger(message)
      ? enterAnalyzeMode(message, attachments, activeDocumentPath, routeReply)
      : null;
  }

  function handleAnalyzeExitCommand({ message, chatMode }: ChatTurnContext) {
    if (!shouldExitAnalyzeForExplicitWrite(getCurrentStep(), chatMode, message)) {
      return null;
    }

    const returnTarget = getRuntimeState().workflowState.returnTarget;

    getRuntimeState().workflowState = returnTarget && returnTarget.mode === 'standard'
      ? jumpToWorkflowTarget(contract, getRuntimeState().workflowState, returnTarget, { returnTarget: null })
      : jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'define-direction', {
          mode: 'standard',
          chapterNumber: Math.max(getRuntimeState().workflowState.chapterNumber, 1),
          volumeNumber: Math.max(getRuntimeState().workflowState.volumeNumber, DEFAULT_VOLUME_NUMBER),
          returnTarget: null,
        });

    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;
    return null;
  }

  function handleAnalyzeStepCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    return getCurrentStep().module === 'analyze'
      ? handleAnalyzeTurn(message, attachments, activeDocumentPath, routeReply)
      : null;
  }

  async function handleChapterPauseCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    if (getCurrentStep().module !== 'write' || getCurrentStep().substepId !== 'chapter-pause') {
      return null;
    }

    if (isReviewTrigger(message)) {
      return null;
    }

    return handleChapterPauseTurn(message, attachments, activeDocumentPath, routeReply);
  }

  async function handleChapterFinalizationCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    const current = getCurrentStep();
    const canFinalizeFromCurrentStep =
      (current.module === 'write' && ['chapter-draft', 'chapter-pause'].includes(current.substepId))
      || (current.module === 'review' && current.substepId === 'chapter-review');

    if (!canFinalizeFromCurrentStep || !isChapterFinalizationIntent(message)) {
      return null;
    }

    return enterChapterFinalizationTurn(message, attachments, activeDocumentPath, routeReply);
  }

  async function handleExplicitChapterWriteCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    const current = getCurrentStep();
    const requestedChapterNumber = extractRequestedChapterNumber(message);
    const targetsCurrentChapter =
      requestedChapterNumber === null
      || requestedChapterNumber === getRuntimeState().workflowState.chapterNumber;
    const isSameChapterReviewRestart =
      requestedChapterNumber === getRuntimeState().workflowState.chapterNumber
      && current.module === 'review'
      && current.substepId === 'chapter-review';

    if (
      isReviewTrigger(message)
      || shouldTreatAsWriteRevision(current, message)
      ||
      (requestedChapterNumber === getRuntimeState().workflowState.chapterNumber && !isSameChapterReviewRestart && current.substepId !== 'chapter-draft')
      || (current.module !== 'write' && current.module !== 'review')
      || (!isChapterWriteStartIntent(message) && !isExplicitChapterWriteRepairIntent(message))
    ) {
      return null;
    }

    if (requestedChapterNumber !== null && requestedChapterNumber < getRuntimeState().workflowState.chapterNumber) {
      const existingDraft = await readProjectFileIfExists(getRuntimeState().projectRoot, chapterDraftPath(requestedChapterNumber));
      if (existingDraft !== null) {
        return {
          reply: `${chapterLabel(requestedChapterNumber)}草稿已存在：${chapterDraftPath(requestedChapterNumber)}。为避免覆盖旧章，请先在文件树中打开该草稿并明确要求“重写覆盖”，或手动备份后再操作。`,
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }
    }

    getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'write-chapter', {
      mode: 'standard',
      substepId: 'chapter-draft',
      chapterNumber: targetsCurrentChapter ? getRuntimeState().workflowState.chapterNumber : requestedChapterNumber,
    });
    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    const writeStep = getCurrentStep();
    await syncWorkflowFiles({
      projectRoot: getRuntimeState().projectRoot,
      stepId: writeStep.id,
      substepId: writeStep.substepId,
      volumeNumber: getRuntimeState().workflowState.volumeNumber,
      chapterNumber: getRuntimeState().workflowState.chapterNumber,
    });

    return generateAssistantProposalTurn({
      userMessage: message,
      attachments,
      activeDocumentPath,
      routeReply,
      stepTitle: writeStep.substepTitle,
    });
  }

  async function handleReviewCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    if (!isReviewTrigger(message) || shouldTreatAsWriteRevision(getCurrentStep(), message)) {
      return null;
    }

    return handleReviewTurn(message, attachments, activeDocumentPath, routeReply);
  }

  async function handleAutoPlannerCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
    isAutoMode,
  }: ChatTurnContext) {
    if (!isAutoMode) {
      return null;
    }

    const currentStep = getCurrentStep();
    const writePolicy = getCurrentWritePolicy(activeDocumentPath);
    const decision = await planChatTurn({
      activeDocumentPath,
      chatAllowedWrites: writePolicy.chatAllowedWrites,
      currentModule: currentStep.module,
      currentStepTitle: currentStep.title,
      currentSubstepTitle: currentStep.substepTitle,
      discussionNotes: getRuntimeState().discussionBuffer.getNotes(currentStep),
      hasPendingDecision: getRuntimeState().pendingDecision !== null,
      hasPendingProposal: getRuntimeState().pendingProposal !== null,
      modelConfig: (await readActiveModelConfig(userConfigDir)) ?? undefined,
      userMessage: message,
    });

    if (decision.intent === 'proposal') {
      return generateAssistantProposalTurn({
        userMessage: message,
        attachments,
        activeDocumentPath,
        routeReply,
      });
    }

    return handleDiscussionHoldTurn(message, attachments, activeDocumentPath, routeReply);
  }

  function handleDiscussionHoldCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    return shouldStayInDiscussion(getCurrentStep(), message)
      ? handleDiscussionHoldTurn(message, attachments, activeDocumentPath, routeReply)
      : null;
  }

  async function handleProgressSummaryTurn() {
    const progress = await readProgressSummary();
    return {
      reply: [
        `当前阶段：${progress.phase}`,
        `当前任务：${progress.coreTask}`,
        `下一步建议：${progress.nextSuggestion}`,
        `可调用模块：${progress.callableModules.join(' / ')}`,
      ].join('\n'),
      session: buildSessionResponse(),
      pendingDecision: getRuntimeState().pendingDecision,
      pendingProposal: getRuntimeState().pendingProposal,
    };
  }

  async function handleContinueNextChapterFromReviewTurn() {
    const maxOutlinedChapterNumber = await readMaxOutlinedChapterNumber();

    if (maxOutlinedChapterNumber !== null && getRuntimeState().workflowState.chapterNumber >= maxOutlinedChapterNumber) {
      return {
        reply: '当前章纲已经到最后一章，不能继续进入下一章。请先做终章修订、总体验收，或结束本卷。',
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    const previousChapterNumber = getRuntimeState().workflowState.chapterNumber;
    getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'write-chapter', {
      substepId: 'chapter-draft',
      chapterNumber: getRuntimeState().workflowState.chapterNumber + 1,
    });
    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    const nextStep = getCurrentStep();
    await syncWorkflowFiles({
      projectRoot: getRuntimeState().projectRoot,
      stepId: nextStep.id,
      substepId: nextStep.substepId,
      volumeNumber: getRuntimeState().workflowState.volumeNumber,
      chapterNumber: getRuntimeState().workflowState.chapterNumber,
    });

    return {
      reply: `已按你的决定跳过${formatChapterLabel(previousChapterNumber)}修订，进入${formatChapterLabel(getRuntimeState().workflowState.chapterNumber)}写作。`,
      session: buildSessionResponse(),
      pendingDecision: null,
      pendingProposal: null,
    };
  }

  async function handlePlanModeTurn(
    message: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
    routeReply: FastifyReply,
  ) {
    if (isGuideTrigger(message)) {
      return enterGuideMode();
    }

    if (isDefineTrigger(message)) {
      return enterDefineMode();
    }

    if (isAnalyzeTrigger(message)) {
      return enterAnalyzeMode(message, attachments, activeDocumentPath, routeReply);
    }

    return buildDiscussionTurnResponse(routeReply, message, attachments, activeDocumentPath);
  }

  async function handlePendingStateInterruptionTurn(
    message: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
    routeReply: FastifyReply,
  ) {
    const currentStep = getCurrentStep();

    if (isRegenerateIntent(message)) {
      getRuntimeState().discussionBuffer.remember(currentStep, message);
      getRuntimeState().pendingProposal = null;
      getRuntimeState().pendingDecision = null;
      return null;
    }

    if (shouldHoldPendingInDiscussion(currentStep, message)) {
      getRuntimeState().discussionBuffer.remember(currentStep, message);

      return buildDiscussionTurnResponse(routeReply, message, attachments, activeDocumentPath, {
        preservePendingState: true,
      });
    }

    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;
    return null;
  }

  function enterGuideMode() {
    getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'guide-entry', {
      mode: 'guide',
      returnTarget:
        getRuntimeState().workflowState.mode === 'standard'
          ? {
              mode: getRuntimeState().workflowState.mode,
              stepId: getRuntimeState().workflowState.currentStepId,
              substepId: getRuntimeState().workflowState.currentSubstepId,
              volumeNumber: getRuntimeState().workflowState.volumeNumber,
              chapterNumber: getRuntimeState().workflowState.chapterNumber,
            }
          : getRuntimeState().workflowState.returnTarget,
    });
    getRuntimeState().pendingDecision = null;
    getRuntimeState().pendingProposal = null;

    return {
      reply: '已进入 Guide 模式。请先告诉我：带资进组、灵感切入，还是常规流程。',
      session: buildSessionResponse(),
      pendingDecision: null,
      pendingProposal: null,
    };
  }

  async function handleGuideTurn(message: string) {
    const projectContent = await readProjectFile(getRuntimeState().projectRoot, 'PROJECT.md');
    const initialProposal = await buildGuideProposal({
      projectRoot: getRuntimeState().projectRoot,
      projectContent,
      currentSubstepId: getCurrentStep().substepId as
        | 'choose-guide-mode'
        | 'scan-assets'
        | 'choose-entry-focus'
        | 'character-first'
        | 'idea-first'
        | 'draft-first',
      userMessage: message,
      returnTarget: getRuntimeState().workflowState.returnTarget,
    });

    let proposal = initialProposal;

    if (proposal.proposedWrites.length === 0 && proposal.nextTarget) {
      getRuntimeState().workflowState = jumpToWorkflowTarget(contract, getRuntimeState().workflowState, proposal.nextTarget, {
        returnTarget: getRuntimeState().workflowState.returnTarget,
      });

      if (getCurrentStep().module === 'guide') {
        proposal = await buildGuideProposal({
          projectRoot: getRuntimeState().projectRoot,
          projectContent,
          currentSubstepId: getCurrentStep().substepId as
            | 'choose-guide-mode'
            | 'scan-assets'
            | 'choose-entry-focus'
            | 'character-first'
            | 'idea-first'
            | 'draft-first',
          userMessage: message,
          returnTarget: getRuntimeState().workflowState.returnTarget,
        });
      }
    }

    if (proposal.proposedWrites.length === 0 && proposal.nextTarget === null) {
      getRuntimeState().pendingProposal = null;
      getRuntimeState().pendingDecision = null;
      return {
        reply: proposal.reply,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    if (proposal.proposedWrites.length === 0 && getCurrentStep().module !== 'guide') {
      getRuntimeState().pendingProposal = null;
      getRuntimeState().pendingDecision = null;
      return {
        reply: proposal.reply,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    const state = getRuntimeState();
    state.pendingDecision = null;
    state.pendingProposal = await snapshotProposal(state.projectRoot, proposal.sourceReadPaths, proposal);
    const pendingProposal = state.pendingProposal;

    return {
      reply: pendingProposal.reply,
      session: buildSessionResponse(),
      pendingDecision: null,
      pendingProposal,
    };
  }

  function enterDefineMode() {
    getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'define-direction', { chapterNumber: 1, volumeNumber: DEFAULT_VOLUME_NUMBER });
    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    return {
      reply: '已切回标准模式，请先定义套路方向和文风。',
      session: buildSessionResponse(),
      pendingDecision: null,
      pendingProposal: null,
    };
  }

  function enterAnalyzeMode(
    message: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
    routeReply: FastifyReply,
  ) {
    getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'analyze-entry');
    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    return handleAnalyzeTurn(message, attachments, activeDocumentPath, routeReply);
  }

  async function handleChapterPauseTurn(
    message: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }> = [],
    activeDocumentPath: string | null = null,
    routeReply?: FastifyReply,
  ) {
    if (isChapterFinalizationIntent(message)) {
      return enterChapterFinalizationTurn(message, attachments, activeDocumentPath, routeReply);
    }

    if (isContinueNextChapterTrigger(message)) {
      const maxOutlinedChapterNumber = await readMaxOutlinedChapterNumber();

      if (maxOutlinedChapterNumber !== null && getRuntimeState().workflowState.chapterNumber >= maxOutlinedChapterNumber) {
        return {
          reply: '当前章纲已经到最后一章，不能继续进入下一章。请先做终章修订、总体验收，或结束本卷。',
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }

      getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'write-chapter', {
        substepId: 'chapter-draft',
        chapterNumber: getRuntimeState().workflowState.chapterNumber + 1,
      });
      const nextStep = getCurrentStep();
      await syncWorkflowFiles({
        projectRoot: getRuntimeState().projectRoot,
        stepId: nextStep.id,
        substepId: nextStep.substepId,
        volumeNumber: getRuntimeState().workflowState.volumeNumber,
        chapterNumber: getRuntimeState().workflowState.chapterNumber,
      });

      return {
        reply: `已进入${formatChapterLabel(getRuntimeState().workflowState.chapterNumber)}写作。`,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    if (isContinueCurrentChapterTrigger(message)) {
      getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'write-chapter', {
        substepId: 'chapter-draft',
        chapterNumber: getRuntimeState().workflowState.chapterNumber,
      });

      const currentWriteStep = getCurrentStep();
      await syncWorkflowFiles({
        projectRoot: getRuntimeState().projectRoot,
        stepId: currentWriteStep.id,
        substepId: currentWriteStep.substepId,
        volumeNumber: getRuntimeState().workflowState.volumeNumber,
        chapterNumber: getRuntimeState().workflowState.chapterNumber,
        revisionMode: true,
      });

      return {
        reply: `已返回${formatChapterLabel(getRuntimeState().workflowState.chapterNumber)}草稿继续修改。`,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    return null;
  }

  async function handleReviewTurn(
    message: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
    routeReply: FastifyReply,
  ) {
    const current = getCurrentStep();
    const reviewSubstepId = resolveReviewSubstepId(message, current.module);
    const requestedChapterNumber = extractRequestedChapterNumber(message);

    if (!reviewSubstepId) {
      return null;
    }

    const reviewChapterNumber = requestedChapterNumber ?? getRuntimeState().workflowState.chapterNumber;
    const reviewState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'review-chapter', {
      mode: 'standard',
      substepId: reviewSubstepId,
      chapterNumber: reviewChapterNumber,
      returnTarget:
        current.module === 'review'
          ? getRuntimeState().workflowState.returnTarget
          : {
              mode: getRuntimeState().workflowState.mode,
              stepId: getRuntimeState().workflowState.currentStepId,
              substepId: getRuntimeState().workflowState.currentSubstepId,
              volumeNumber: getRuntimeState().workflowState.volumeNumber,
              chapterNumber: getRuntimeState().workflowState.chapterNumber,
            },
    });

    const reviewStep = getCurrentWorkflowStep(contract, reviewState);
    const missingInputs = await findMissingProjectFiles(getRuntimeState().projectRoot, reviewStep.requiredProjectReads);

    if (missingInputs.length > 0) {
      return {
        reply: `当前还缺少必要文件，暂时不能进入审查：${missingInputs.join('、')}`,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    getRuntimeState().workflowState = reviewState;
    return generateAssistantProposalTurn({
      userMessage: message,
      attachments,
      activeDocumentPath,
      routeReply,
      stepTitle: getCurrentStep().substepTitle,
      returnTarget: getRuntimeState().workflowState.returnTarget,
    });
  }

  async function handleOutlineToChapterWriteCommand({
    message,
    attachments,
    activeDocumentPath,
    routeReply,
  }: ChatTurnContext) {
    const current = getCurrentStep();
    if (current.module !== 'outline' || !isChapterWriteStartIntent(message)) {
      return null;
    }

    getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'write-chapter', {
      mode: 'standard',
      substepId: 'chapter-draft',
      chapterNumber: extractRequestedChapterNumber(message) ?? getRuntimeState().workflowState.chapterNumber,
    });
    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    const writeStep = getCurrentStep();
    await syncWorkflowFiles({
      projectRoot: getRuntimeState().projectRoot,
      stepId: writeStep.id,
      substepId: writeStep.substepId,
      volumeNumber: getRuntimeState().workflowState.volumeNumber,
      chapterNumber: getRuntimeState().workflowState.chapterNumber,
    });

    return generateAssistantProposalTurn({
      userMessage: message,
      attachments,
      activeDocumentPath,
      routeReply,
      stepTitle: writeStep.substepTitle,
    });
  }

  async function enterChapterFinalizationTurn(
    message: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }> = [],
    activeDocumentPath: string | null = null,
    routeReply?: FastifyReply,
  ) {
    getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'write-chapter', {
      substepId: 'chapter-finalize',
      chapterNumber: getRuntimeState().workflowState.chapterNumber,
    });
    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    const currentWriteStep = getCurrentStep();
    await syncWorkflowFiles({
      projectRoot: getRuntimeState().projectRoot,
      stepId: currentWriteStep.id,
      substepId: currentWriteStep.substepId,
      volumeNumber: getRuntimeState().workflowState.volumeNumber,
      chapterNumber: getRuntimeState().workflowState.chapterNumber,
      revisionMode: true,
    });

    return routeReply
      ? generateAssistantProposalTurn({
          userMessage: message,
          attachments,
          activeDocumentPath,
          routeReply,
          stepTitle: currentWriteStep.substepTitle,
        })
      : {
          reply: `已进入${formatChapterLabel(getRuntimeState().workflowState.chapterNumber)}定稿修订。`,
          session: buildSessionResponse(activeDocumentPath),
          pendingDecision: null,
          pendingProposal: null,
        };
  }

  function handleDiscussionHoldTurn(
    message: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
    routeReply: FastifyReply,
  ) {
    getRuntimeState().discussionBuffer.remember(getCurrentStep(), message);
    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;
    return buildDiscussionTurnResponse(routeReply, message, attachments, activeDocumentPath);
  }


  async function handleApprovalTurn({
    message,
    approved,
  }: {
    message: string;
    approved: boolean;
  }) {
      if (approved && !isExplicitApprovalMessage(message)) {
        return {
          reply: '检测到确认请求，但消息不属于显式批准词。请直接发送“确认”或“同意”后再写入。',
          session: buildSessionResponse(),
          pendingDecision: getRuntimeState().pendingDecision,
          pendingProposal: getRuntimeState().pendingProposal,
        };
      }

      const noPendingApprovalResponse = proposalApprovalService.handleNoPendingApproval(getRuntimeState());
      if (noPendingApprovalResponse !== null) {
        return noPendingApprovalResponse;
      }

      const approvedDecisionResponse = await proposalApprovalService.handlePendingDecisionApproval(getRuntimeState());
      if (approvedDecisionResponse !== null) {
        return approvedDecisionResponse;
      }

      const approvedProposal = getRuntimeState().pendingProposal;

      if (!approvedProposal) {
        return {
          reply: '当前没有待确认的写入提案。请重新描述你的需求，我会重新生成。',
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }

      const currentStep = getCurrentStep();
      const writePolicy = getCurrentWritePolicy();

      if (approvedProposal.proposedWrites.length === 0 && currentStep.pendingDecisionType !== 'substep_confirmation') {
        getRuntimeState().pendingProposal = null;
        getRuntimeState().pendingDecision = null;
        return {
          reply: '当前提案没有合法写入内容，已阻止推进。请重新描述你的需求。',
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }

      const staleProposalResponse = await proposalApprovalService.validatePendingProposalHashes(
        getRuntimeState(),
        approvedProposal,
      );
      if (staleProposalResponse !== null) {
        return staleProposalResponse;
      }

      for (const proposedWrite of approvedProposal.proposedWrites) {
        await writeWorkflowFile({
          projectRoot: getRuntimeState().projectRoot,
          relativePath: proposedWrite.path,
          content: proposedWrite.content,
          allowedWrites: writePolicy.chatAllowedWrites,
        });
      }

      getRuntimeState().pendingProposal = null;
      getRuntimeState().pendingDecision = null;

      const reviewGate = currentStep.module === 'review'
        ? extractReviewGateFromProposalWrites(approvedProposal.proposedWrites)
        : 'pass';

      if (currentStep.module === 'review' && reviewGate !== 'pass') {
        getRuntimeState().workflowState = jumpToWorkflowStep(contract, getRuntimeState().workflowState, 'write-chapter', {
          substepId: 'chapter-draft',
          chapterNumber: getRuntimeState().workflowState.chapterNumber,
        });

        const revisionStep = getCurrentStep();
        await syncWorkflowFiles({
          projectRoot: getRuntimeState().projectRoot,
          stepId: revisionStep.id,
          substepId: revisionStep.substepId,
          volumeNumber: getRuntimeState().workflowState.volumeNumber,
          chapterNumber: getRuntimeState().workflowState.chapterNumber,
          revisionMode: true,
        });

        const gateAction = reviewGate === 'block' ? '必须先回修当前章' : '建议先回修当前章';

        return {
          reply: `已写入审查报告，${gateAction}，已返回${formatChapterLabel(getRuntimeState().workflowState.chapterNumber)}草稿继续修改。`,
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }

      await syncWorkflowFiles({
        projectRoot: getRuntimeState().projectRoot,
        stepId: currentStep.id,
        substepId: currentStep.substepId,
        volumeNumber: getRuntimeState().workflowState.volumeNumber,
        chapterNumber: getRuntimeState().workflowState.chapterNumber,
      });
      const shouldAutoAdvance = shouldAutoAdvanceWorkflowAfterApproval({
        strictWorkflowWrites: writePolicy.strictWorkflowWrites,
        approvedWritePaths: approvedProposal.proposedWrites.map((item) => item.path),
      });

      if (!shouldAutoAdvance) {
        const currentStepLabel = currentStep.module === 'review' ? currentStep.substepTitle : currentStep.title;

        return {
          reply: `已写入提案文件，当前保持在【${currentStepLabel}】。`,
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }

      const returnsToContext = approvedProposal.returnTarget !== undefined && approvedProposal.returnTarget !== null;
      getRuntimeState().workflowState = approvedProposal.nextTarget
        ? jumpToWorkflowTarget(contract, getRuntimeState().workflowState, approvedProposal.nextTarget, {
            returnTarget: approvedProposal.returnTarget ?? null,
          })
        : advanceWorkflowState(contract, getRuntimeState().workflowState, { approved: true });
      const nextStep = getCurrentStep();

      if (!approvedProposal.nextTarget && currentStep.nextStepId === null) {
        if (returnsToContext) {
          await syncWorkflowFiles({
            projectRoot: getRuntimeState().projectRoot,
            stepId: nextStep.id,
            substepId: nextStep.substepId,
            volumeNumber: getRuntimeState().workflowState.volumeNumber,
            chapterNumber: getRuntimeState().workflowState.chapterNumber,
          });

          return {
            reply: `已写入提案文件，并返回【${nextStep.title}】。`,
            session: buildSessionResponse(),
            pendingDecision: null,
            pendingProposal: null,
          };
        }

        return {
          reply: '已写入提案文件，并完成当前流程节点。',
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }

      await syncWorkflowFiles({
        projectRoot: getRuntimeState().projectRoot,
        stepId: nextStep.id,
        substepId: nextStep.substepId,
        volumeNumber: getRuntimeState().workflowState.volumeNumber,
        chapterNumber: getRuntimeState().workflowState.chapterNumber,
      });

      const nextStepLabel = nextStep.substepId === 'chapter-pause' ? nextStep.substepTitle : nextStep.title;

      return {
        reply: `已写入提案文件，并进入【${nextStepLabel}】。`,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
  }

  // Compatibility SSE endpoint: the chat turn is still produced by /api/chat,
  // then emitted as proposal_item + done events. Keep frontend timeouts aligned
  // with backend generation timeout until this becomes true token streaming.
  app.post<{ Body: ChatTurnBody }>('/api/chat/stream', async (request, reply) => {
    const emitError = (statusCode: number, error: { code: string; message: string; details?: Record<string, unknown> }) => {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ statusCode, error })}\n\n`);
      reply.raw.end();
    };
    const parseJsonBody = (body: string) => {
      try {
        return JSON.parse(body) as unknown;
      } catch {
        return null;
      }
    };
    const genericError = {
      code: 'chat-stream-turn-failed',
      message: '聊天流响应生成失败，请稍后重试。',
    };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ transport: 'completed-turn-sse' })}\n\n`);

    try {
      const injected = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: buildProjectRequestHeaders(request.headers),
        payload: request.body,
      });

      if (injected.statusCode !== 200) {
        const data = parseJsonBody(injected.body) as {
          error?: {
            code?: string;
            message?: string;
            details?: Record<string, unknown>;
          };
          message?: string;
        } | null;
        const error = data?.error?.message
          ? {
              code: data.error.code ?? genericError.code,
              message: data.error.message,
              details: data.error.details,
            }
          : {
              code: data?.error?.code ?? genericError.code,
              message: data?.message ?? genericError.message,
              details: data?.error?.details,
            };
        emitError(injected.statusCode, error);
        return reply;
      }

      const data = parseJsonBody(injected.body) as {
        reply: string;
        pendingProposal?: { proposedWrites?: Array<{ path: string }> } | null;
        session: unknown;
      } | null;

      if (data === null) {
        emitError(500, genericError);
        return reply;
      }

      for (const item of data.pendingProposal?.proposedWrites ?? []) {
        reply.raw.write(`event: proposal_item\ndata: ${JSON.stringify(item)}\n\n`);
      }

      reply.raw.write(`event: done\ndata: ${JSON.stringify(data)}\n\n`);
      reply.raw.end();
      return reply;
    } catch {
      emitError(500, genericError);
      return reply;
    }
  });

  async function handleAnalyzeTurn(
    userMessage: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
    routeReply: FastifyReply,
  ) {
    const analyzeStep = getCurrentStep();

    if (analyzeStep.module !== 'analyze') {
      return {
        reply: '当前不在 Analyze 模式。',
        session: buildSessionResponse(),
        pendingDecision: getRuntimeState().pendingDecision,
        pendingProposal: getRuntimeState().pendingProposal,
      };
    }

    if (shouldStayInAnalyzeDiscussion(analyzeStep, userMessage)) {
      getRuntimeState().pendingProposal = null;
      getRuntimeState().pendingDecision = null;
      getRuntimeState().discussionBuffer.remember(analyzeStep, userMessage);

      return buildDiscussionTurnResponse(routeReply, userMessage, attachments, activeDocumentPath);
    }

    const projectContent = await readProjectFile(getRuntimeState().projectRoot, 'PROJECT.md');
    const proposal = await buildAnalyzeProposal({
      projectRoot: getRuntimeState().projectRoot,
      projectContent,
      currentSubstepId: analyzeStep.substepId as
        | 'prepare-sample-book'
        | 'choose-summary-mode'
        | 'await-env-confirmation'
        | 'style-analysis'
        | 'trope-analysis'
        | 'framework-analysis'
        | 'micro-analysis'
        | 'custom-analysis',
      userMessage,
    });

    if (proposal.proposedWrites.length > 0) {
      const state = getRuntimeState();
      state.pendingDecision = null;
      state.pendingProposal = await snapshotProposal(state.projectRoot, proposal.sourceReadPaths, proposal);
      const pendingProposal = state.pendingProposal;

      return {
        reply: pendingProposal.reply,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal,
      };
    }

    if (shouldQueueAnalyzeDecision(analyzeStep, proposal.nextTarget, userMessage)) {
      const state = getRuntimeState();
      state.pendingProposal = null;
      state.pendingDecision = {
        reply: proposal.reply,
        decisionType: 'substep_confirmation',
        nextTarget: proposal.nextTarget,
        returnTarget: state.workflowState.returnTarget,
      };
      const pendingDecision = state.pendingDecision;

      return {
        reply: pendingDecision.reply,
        session: buildSessionResponse(),
        pendingDecision,
        pendingProposal: null,
      };
    }

    getRuntimeState().pendingProposal = null;
    getRuntimeState().pendingDecision = null;

    return {
      reply: proposal.reply,
      session: buildSessionResponse(),
      pendingDecision: null,
      pendingProposal: null,
    };
  }

  async function generateDiscussionTurn(
    userMessage: string,
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>,
    activeDocumentPath: string | null,
  ) {
    const writePolicy = getCurrentWritePolicy(activeDocumentPath);

    const prompt = await buildPrompt({
      projectRoot: getRuntimeState().projectRoot,
      skillPackPath,
      contract,
      state: getRuntimeState().workflowState,
      userMessage,
      strictWorkflowWrites: writePolicy.strictWorkflowWrites,
      chatAllowedWrites: writePolicy.chatAllowedWrites,
      manualWritablePaths: writePolicy.manualWritablePaths,
      activeDocumentPath,
      attachments,
      discussionNotes: getRuntimeState().discussionBuffer.getNotes(getCurrentStep()),
    });

    return generateDiscussionReply({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      stepTitle: prompt.step.substepTitle,
      module: prompt.step.module,
      userMessage,
      modelConfig: (await readActiveModelConfig(userConfigDir)) ?? undefined,
    });
  }

  async function generateAssistantProposalTurn({
    userMessage,
    attachments,
    activeDocumentPath,
    routeReply,
    stepTitle,
    requiredProjectReads,
    returnTarget,
  }: {
    userMessage: string;
    attachments: Array<{ name: string; mimeType: string; size: number; textContent: string }>;
    activeDocumentPath: string | null;
    routeReply: FastifyReply;
    stepTitle?: string;
    requiredProjectReads?: string[];
    returnTarget?: WorkflowReturnTarget | null;
  }) {
    const writePolicy = getCurrentWritePolicy(activeDocumentPath);
    const prompt = await buildPrompt({
      projectRoot: getRuntimeState().projectRoot,
      skillPackPath,
      contract,
      state: getRuntimeState().workflowState,
      userMessage,
      strictWorkflowWrites: writePolicy.strictWorkflowWrites,
      chatAllowedWrites: writePolicy.chatAllowedWrites,
      manualWritablePaths: writePolicy.manualWritablePaths,
      activeDocumentPath,
      attachments,
      discussionNotes: getRuntimeState().discussionBuffer.getNotes(getCurrentStep()),
    });
    let reply: AssistantReply;

    try {
      reply = await generateAssistantReply({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        stepTitle: stepTitle ?? (prompt.step.module === 'review' ? prompt.step.substepTitle : prompt.step.title),
        module: prompt.step.module,
        allowedWrites: writePolicy.strictWorkflowWrites,
        strictWorkflowWrites: writePolicy.strictWorkflowWrites,
        chatAllowedWrites: writePolicy.chatAllowedWrites,
        activeDocumentPath,
        projectFiles: prompt.projectFiles,
        workflowDocs: prompt.workflowDocs,
        modelConfig: (await readActiveModelConfig(userConfigDir)) ?? undefined,
      });
    } catch (error) {
      return sendAssistantError(routeReply, error);
    }

    reply = augmentAssistantReplyForCurrentStep(reply, prompt.projectFiles);
    const replyValidation = validateAssistantReplyForCurrentStep(reply, prompt.projectFiles);
    if (replyValidation !== null) {
      getRuntimeState().pendingProposal = null;
      getRuntimeState().pendingDecision = null;

      return {
        reply: replyValidation.message,
        validation: {
          code: replyValidation.code,
        },
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    }

    const state = getRuntimeState();
    state.pendingProposal = await snapshotProposal(state.projectRoot, requiredProjectReads ?? prompt.step.requiredProjectReads, {
      ...reply,
      ...(returnTarget !== undefined ? { returnTarget } : {}),
    });
    state.pendingDecision = null;
    const pendingProposal = state.pendingProposal;

    return {
      reply: pendingProposal.reply,
      session: buildSessionResponse(),
      pendingDecision: null,
      pendingProposal,
    };
  }

  function getCurrentStep() {
    return getCurrentStepFor(getRuntimeState());
  }

  function getCurrentStepFor(state: ProjectRuntimeState) {
    return getCurrentWorkflowStep(contract, state.workflowState);
  }

  function getCurrentWritePolicy(activeDocumentPath: string | null = null) {
    return getCurrentWritePolicyFor(getRuntimeState(), activeDocumentPath);
  }

  function getCurrentWritePolicyFor(state: ProjectRuntimeState, activeDocumentPath: string | null = null) {
    return buildSoftFlowPolicy({
      strictWorkflowWrites: getCurrentStepFor(state).allowedWrites,
      chapterNumber: state.workflowState.chapterNumber,
      activeDocumentPath,
    });
  }

  function buildWriteTargetHint({
    activeDocumentPath = null,
    writePolicy = getRuntimeState().initialized ? getCurrentWritePolicy(activeDocumentPath) : null,
  }: {
    activeDocumentPath?: string | null;
    writePolicy?: ReturnType<typeof getCurrentWritePolicy> | null;
  } = {}): WriteTargetHint {
    return buildWriteTargetHintFor(getRuntimeState(), { activeDocumentPath, writePolicy });
  }

  function buildWriteTargetHintFor(
    state: ProjectRuntimeState,
    {
      activeDocumentPath = null,
      writePolicy = state.initialized ? getCurrentWritePolicyFor(state, activeDocumentPath) : null,
    }: {
      activeDocumentPath?: string | null;
      writePolicy?: ReturnType<typeof getCurrentWritePolicy> | null;
    } = {},
  ): WriteTargetHint {
    return {
      strictWorkflowWrites: writePolicy?.strictWorkflowWrites ?? [],
      chatAllowedWrites: writePolicy?.chatAllowedWrites ?? [],
      activeDocumentPath,
      hasPendingProposal: state.pendingProposal !== null,
    };
  }

  function buildSessionResponse(activeDocumentPath: string | null = null): SessionResponse {
    return buildSessionResponseFor(getRuntimeState(), activeDocumentPath);
  }

  function buildSessionResponseFor(state: ProjectRuntimeState, activeDocumentPath: string | null = null): SessionResponse {
    const currentStep = getCurrentStepFor(state);
    const hasPendingProposal = state.pendingProposal !== null;
    const hasPendingDecision = state.pendingDecision !== null;
    const interactionMode = hasPendingProposal ? 'proposal' : hasPendingDecision ? 'decision' : 'discussion';

    return {
      initialized: state.initialized,
      currentMode: state.workflowState.mode,
      currentStepId: state.workflowState.currentStepId,
      currentModule: currentStep.module,
      currentStepTitle: currentStep.module === 'review' ? currentStep.substepTitle : currentStep.title,
      currentSubstepId: state.workflowState.currentSubstepId,
      currentSubstepTitle: currentStep.substepTitle,
      currentVolumeNumber: state.workflowState.volumeNumber,
      currentChapterNumber: state.workflowState.chapterNumber,
      requiresApproval: state.workflowState.waitingForApproval,
      pendingDecisionType: state.workflowState.pendingDecisionType,
      returnTarget: state.workflowState.returnTarget,
      waitingForApproval: hasPendingProposal || hasPendingDecision,
      hasPendingDecision,
      hasPendingProposal,
      interactionMode,
      writeTargetHint: buildWriteTargetHintFor(state, { activeDocumentPath }),
    };
  }

  function buildWorkflowSnapshot(): ProjectSessionWorkflowSnapshot {
    return buildWorkflowSnapshotFor(getRuntimeState());
  }

  async function persistRuntimeSessionSnapshot() {
    if (!getRuntimeState().initialized) {
      return;
    }

    const savedSession = await readRecoverableProjectSession(getRuntimeState().projectRoot);
    await writeQueuedProjectSession(getRuntimeState().projectRoot, {
      messages: savedSession?.messages ?? [],
      discussionNotes: getRuntimeState().discussionBuffer.snapshot(),
      workflow: buildWorkflowSnapshot(),
    });
  }

  async function writeQueuedProjectSession(
    projectRoot: string,
    session: Parameters<typeof writeProjectSessionWithGuideDiscussionNotes>[1],
  ) {
    const queueKey = normalizeProjectRootPath(projectRoot);
    const previousWrite = projectSessionWriteQueues.get(queueKey) ?? Promise.resolve();
    let savedSession: Awaited<ReturnType<typeof writeProjectSessionWithGuideDiscussionNotes>> | undefined;

    const currentWrite = previousWrite.catch(() => undefined).then(async () => {
      savedSession = await writeProjectSessionWithGuideDiscussionNotes(projectRoot, session);
    });

    let trackedWrite: Promise<void>;
    trackedWrite = currentWrite.finally(() => {
      if (projectSessionWriteQueues.get(queueKey) === trackedWrite) {
        projectSessionWriteQueues.delete(queueKey);
      }
    }).catch(() => undefined);

    projectSessionWriteQueues.set(queueKey, trackedWrite);

    await currentWrite;
    if (savedSession === undefined) {
      throw new Error('Project session write did not complete.');
    }

    return savedSession;
  }

  function buildWorkflowSnapshotFor(state: ProjectRuntimeState): ProjectSessionWorkflowSnapshot {
    return {
      initialized: state.initialized,
      currentMode: state.workflowState.mode,
      currentStepId: state.workflowState.currentStepId,
      currentSubstepId: state.workflowState.currentSubstepId,
      currentVolumeNumber: state.workflowState.volumeNumber,
      currentChapterNumber: state.workflowState.chapterNumber,
      returnTarget: state.workflowState.returnTarget,
    };
  }

  function restoreWorkflowState(snapshot: ProjectSessionWorkflowSnapshot | null) {
    if (snapshot === null) {
      return null;
    }

    const restoredReturnTarget = restoreWorkflowReturnTarget(snapshot.returnTarget);

    try {
      return {
        initialized: snapshot.initialized,
        state: jumpToWorkflowStep(contract, createWorkflowState(contract), snapshot.currentStepId, {
          mode: snapshot.currentMode,
          substepId: snapshot.currentSubstepId,
          volumeNumber: snapshot.currentVolumeNumber,
          chapterNumber: snapshot.currentChapterNumber,
          returnTarget: restoredReturnTarget,
        }),
      };
    } catch {
      return null;
    }
  }

  function restoreWorkflowReturnTarget(target: WorkflowReturnTarget | null) {
    if (target === null) {
      return null;
    }

    try {
      const restoredTarget = jumpToWorkflowStep(contract, createWorkflowState(contract), target.stepId, {
        mode: target.mode,
        substepId: target.substepId,
        volumeNumber: target.volumeNumber,
        chapterNumber: target.chapterNumber,
      });

      return {
        mode: restoredTarget.mode,
        stepId: restoredTarget.currentStepId,
        substepId: restoredTarget.currentSubstepId,
        volumeNumber: restoredTarget.volumeNumber,
        chapterNumber: restoredTarget.chapterNumber,
      } satisfies WorkflowReturnTarget;
    } catch {
      return null;
    }
  }

  async function readRecoverableProjectSession(rootPath: string) {
    try {
      return await readProjectSessionWithGuideDiscussionNotes(rootPath);
    } catch (error) {
      if (error instanceof ProjectSessionStoreDataError) {
        return null;
      }

      throw error;
    }
  }

  async function readProgressSummary() {
    return readProgressSummaryFor(getRuntimeState());
  }

  async function readProgressSummaryFor(state: ProjectRuntimeState) {
    const projectContent = await readProjectFileIfExists(state.projectRoot, 'PROJECT.md');
    const memorySummary = await readStructuredSummary(state.projectRoot);

    if (projectContent === null) {
      return {
        phase: '未初始化',
        coreTask: '先初始化项目，再开始写作流程。',
        todoItems: [],
        nextSuggestion: '初始化项目',
        callableModules: ['define', 'guide', 'analyze'],
        memorySummary,
      };
    }

    return {
      ...parseProjectProgress(projectContent),
      memorySummary,
    };
  }

  async function readMaxOutlinedChapterNumber() {
    const chapterOutline = await readProjectFileIfExists(getRuntimeState().projectRoot, VOLUME_CHAPTER_OUTLINE_PATH(getRuntimeState().workflowState.volumeNumber));

    if (chapterOutline === null) {
      return null;
    }

    return getMaxOutlinedChapterNumber(chapterOutline);
  }

  function validateAssistantReplyForCurrentStep(
    reply: AssistantReply,
    projectFiles: Array<{ path: string; content: string | null }>,
  ) {
    const currentStep = getCurrentStep();

    if (currentStep.module !== 'write' || currentStep.substepId !== 'chapter-draft') {
      return null;
    }

    const validation = validateChapterDraftProposal({
      currentChapterNumber: getRuntimeState().workflowState.chapterNumber,
      projectFiles,
      proposedWrites: reply.proposedWrites,
    });

    if (!validation.ok) {
      return {
        code: validation.code,
        message: validation.message,
      };
    }

    return null;
  }

  function augmentAssistantReplyForCurrentStep(
    reply: AssistantReply,
    projectFiles: Array<{ path: string; content: string | null }>,
  ) {
    const currentStep = getCurrentStep();

    if (currentStep.module === 'review' && currentStep.substepId === 'chapter-review') {
      const augmented = augmentChapterReviewProposal({
        chapterNumber: getRuntimeState().workflowState.chapterNumber,
        projectFiles,
        proposedWrites: reply.proposedWrites,
      });

      return {
        ...reply,
        proposedWrites: augmented.proposedWrites,
      };
    }

    if (currentStep.module === 'write' && currentStep.substepId === 'chapter-draft') {
      const draftWrite = reply.proposedWrites.find(
        (item) =>
          normalizeProjectPath(item.path)
          === normalizeProjectPath(`4-正文/${formatChapterLabel(getRuntimeState().workflowState.chapterNumber)}_草稿.md`),
      );

      if (!draftWrite) {
        return reply;
      }

      const lint = lintAiFlavor(draftWrite.content);
      if (!lint.blocked) {
        return reply;
      }

      return {
        ...reply,
        reply: [
          `已生成待确认提案：${formatChapterLabel(getRuntimeState().workflowState.chapterNumber)}草稿已产出。`,
          `检测到本稿AI味偏重，命中问题：${lint.hits.map((hit) => hit.label).join('、')}。`,
          '这次先保留正文产出，建议你确认写入后进入审查或执行局部改写任务：只修命中片段，非目标段落保持原样，不要整章重写。',
        ].join('\n'),
      };
    }

    return reply;
  }

  return app;
}

function proposalTouchesPath(proposal: PendingProposal, normalizedPath: string) {
  return [
    ...proposal.sourceReads.map((item) => item.path),
    ...proposal.proposedWrites.map((item) => item.path),
  ].some((path) => normalizeProjectPath(path) === normalizedPath);
}

function uniqueNormalizedPaths(paths: string[]) {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    const normalizedPath = normalizeProjectPath(path);
    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    unique.push(normalizedPath);
  }

  return unique;
}

function readActiveDocumentPathHeader(value: string | undefined) {
  return value ? decodeHeaderPath(value) : null;
}

function readProjectEntryRequestBody(body: unknown) {
  if (body === null || typeof body !== 'object') {
    return {
      parentPath: undefined,
      name: undefined,
    };
  }

  return body as {
    parentPath?: unknown;
    name?: unknown;
  };
}

function readFileSaveRequestBody(body: unknown) {
  if (body === null || typeof body !== 'object') {
    return null;
  }

  const candidate = body as {
    path?: unknown;
    content?: unknown;
  };

  if (typeof candidate.path !== 'string' || typeof candidate.content !== 'string') {
    return null;
  }

  return {
    path: candidate.path,
    content: candidate.content,
  };
}

async function snapshotProposal(
  projectRoot: string,
  requiredProjectReads: string[],
  proposal: Awaited<ReturnType<typeof generateAssistantReply>> & { nextTarget?: WorkflowTransitionTarget | null; returnTarget?: WorkflowReturnTarget | null },
): Promise<PendingProposal> {
  const sourceReads = await Promise.all(
    requiredProjectReads.map(async (relativePath) => {
      const currentContent = await readProjectFileIfExists(projectRoot, relativePath);

      return {
        path: relativePath,
        baseHash: currentContent === null ? null : hashContent(currentContent),
      };
    }),
  );

  const proposedWrites = await Promise.all(
    proposal.proposedWrites.map(async (proposedWrite) => {
      const currentContent = await readProjectFileIfExists(projectRoot, proposedWrite.path);

      return {
        ...proposedWrite,
        baseHash: currentContent === null ? null : hashContent(currentContent),
      };
    }),
  );

  return {
    reply: sanitizePendingProposalReply(proposal.reply),
    sourceReads,
    proposedWrites,
    nextTarget: proposal.nextTarget,
    returnTarget: proposal.returnTarget,
  };
}

function hashContent(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function sanitizePendingProposalReply(content: string) {
  if (!FALSE_WRITE_CLAIM_PATTERN.test(content)) {
    return content;
  }

  const cleanedSegments = content
    .split(/(?<=[。！？!?]|\n)/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !FALSE_WRITE_CLAIM_PATTERN.test(segment));

  const safetyNotice = '当前仅生成了待确认提案，尚未写入任何文件；确认后才会正式写入。';

  if (cleanedSegments.length === 0) {
    return safetyNotice;
  }

  return [safetyNotice, cleanedSegments.join('\n')].join('\n\n');
}

function extractReviewGateFromProposalWrites(proposedWrites: Array<{ path: string; content: string }>) {
  const reviewWrite = proposedWrites.find((item) => normalizeProjectPath(item.path).includes(normalizeProjectPath('5-审查/')));
  return reviewWrite ? extractReviewGate(reviewWrite.content) : 'pass';
}

function isCachedChatErrorPayload(value: unknown) {
  return typeof value === 'object'
    && value !== null
    && 'error' in value
    && typeof (value as { error?: { code?: unknown } }).error?.code === 'string';
}

function isExplicitApprovalMessage(message: string) {
  return /^\s*(确认|同意|批准|写入)(?=$|[\s，。,！!])/u.test(message);
}

function isGuideTrigger(message: string) {
  return /^(guide|整理项目|导入旧稿|灵活开始)$/u.test(message.trim());
}

function isDefineTrigger(message: string) {
  return /(define|标准模式|从零开始写一本书|切回标准模式)/u.test(message.trim());
}

function isAnalyzeTrigger(message: string) {
  return /(analyze|参考模式|样板书分析|分析样板书)/u.test(message.trim());
}

function shouldStayInDiscussion(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  message: string,
) {
  if (!['define', 'ideation', 'outline'].includes(step.module) && !isGuideFreeformSubstep(step)) {
    return false;
  }

  if (isDiscussionHoldIntent(message)) {
    return true;
  }

  return !isProposalIntent(message);
}

function shouldStayInAnalyzeDiscussion(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  message: string,
) {
  if (step.module !== 'analyze') {
    return false;
  }

  const discussableSubsteps = new Set([
    'prepare-sample-book',
    'choose-summary-mode',
    'await-env-confirmation',
    'style-analysis',
    'trope-analysis',
    'framework-analysis',
    'micro-analysis',
    'custom-analysis',
  ]);

  if (!discussableSubsteps.has(step.substepId)) {
    return false;
  }

  if (isDiscussionHoldIntent(message)) {
    return true;
  }

  return !isAnalyzeActionIntent(message);
}

function shouldExitAnalyzeForExplicitWrite(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  chatMode: ChatMode,
  message: string,
) {
  if (chatMode !== 'write' || step.module !== 'analyze') {
    return false;
  }

  if (isDiscussionHoldIntent(message) || isAnalyzeActionIntent(message)) {
    return false;
  }

  return isProposalIntent(message);
}

function shouldHoldPendingInDiscussion(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  message: string,
) {
  if (step.module === 'analyze') {
    return shouldStayInAnalyzeDiscussion(step, message);
  }

  if (['define', 'ideation', 'outline'].includes(step.module) || isGuideFreeformSubstep(step)) {
    return shouldStayInDiscussion(step, message);
  }

  return isDiscussionHoldIntent(message);
}

function isRegenerateIntent(message: string) {
  return /(重新生成|重生成|重来一版|再来一版|重新起草|重新产出|重新输出|重做一版|重新写|重写|替换当前|上一版作废|作废上一版)/u.test(message.trim());
}

function isChapterWriteStartIntent(message: string) {
  const normalized = message.trim();

  if (!/(正文|草稿|写作|写第\s*\d+\s*章|第\s*\d+\s*章)/u.test(normalized)) {
    return false;
  }

  return /(进入正文|开始写|开始正文|写第\s*\d+\s*章|从第\s*\d+\s*章开始|继续正文|正文创作|章节正文)/u.test(normalized);
}

function isExplicitChapterWriteRepairIntent(message: string) {
  const normalized = message.trim();

  if (!/(正文|草稿|写作|写第\s*\d+\s*章|第\s*\d+\s*章)/u.test(normalized)) {
    return false;
  }

  return /(回到|返回|重回|漏了|漏掉|补写|补第\s*\d+\s*章|只生成第\s*\d+\s*章|重新写第\s*\d+\s*章)/u.test(normalized);
}

function extractRequestedChapterNumber(message: string) {
  const targetPathMatch = normalizeProjectPath(message).match(/4-正文\/第0*(\d+)章_草稿\.md/u);
  if (targetPathMatch) {
    const chapterNumber = Number.parseInt(targetPathMatch[1] ?? '', 10);
    return Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : null;
  }

  const directedMatch = message.match(
    /(?:回到|返回|重回|漏了|漏掉|补写|补第|只生成|重新写|开始写|写第|进入第|继续生成第)\s*0*(\d+)\s*章/u,
  );
  if (directedMatch) {
    const chapterNumber = Number.parseInt(directedMatch[1] ?? '', 10);
    return Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : null;
  }

  const match = message.match(/第\s*0*(\d+)\s*章/u);
  if (!match) {
    return null;
  }

  const chapterNumber = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : null;
}

function shouldQueueAnalyzeDecision(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  nextTarget: WorkflowTransitionTarget | null,
  message: string,
) {
  if (step.module !== 'analyze') {
    return false;
  }

  if (step.pendingDecisionType !== 'substep_confirmation' || !nextTarget) {
    return false;
  }

  const targetSubstepId = nextTarget.substepId ?? step.substepId;
  const pointsToCurrentSubstep = nextTarget.stepId === step.id && targetSubstepId === step.substepId;

  if (pointsToCurrentSubstep) {
    return false;
  }

  return isAnalyzeActionIntent(message);
}

function isAnalyzeActionIntent(message: string) {
  const normalized = message.trim();
  const compact = normalized.replace(/\s+/g, '');

  if (/^(A|B|方式A|方式B|脚本|脚本模式|agent|agent模式|开篇|开篇梗概|已填写|不需要|跳过|不用)$/iu.test(compact)) {
    return true;
  }

  if (/^(不需要|跳过|不用)/u.test(normalized)) {
    return true;
  }

  return /^(继续|下一步|开始|进入|生成|产出|写入|确认|同意|批准|选择|选用|改用方式\s*B|切换到方式\s*B|使用\s+[^\s]+\.txt)/iu.test(
    normalized,
  );
}

function isProposalIntent(message: string) {
  const normalized = message.trim();

  if (/(生成|草案|起草|写入|落盘|创建|产出|给我一版|给我一份|输出|写第\s*\d+\s*章|写下一章)/u.test(normalized)) {
    return true;
  }

  return /^(请|帮我|先|开始|继续|直接)?(补全|完善|规划|细化|开始写|继续写|开始补全|继续补全|开始规划|继续规划)/u.test(
    normalized.replace(/\s+/g, ''),
  );
}

function isDiscussionHoldIntent(message: string) {
  const normalized = message.trim();
  const compact = normalized.replace(/\s+/g, '');

  if (hasNegatedDiscussionIntent(compact)) {
    return false;
  }

  if (/先讨论|继续讨论|先聊|聊聊|还在想|想一想|为什么|怎么|区别|差别|差异|比较|对比|解释|是否/u.test(normalized)) {
    return true;
  }

  if (/[？?]\s*$/u.test(normalized) || /吗\s*$/u.test(normalized)) {
    return true;
  }

  return /(?:先别|先不要|暂不|先不|别|不要)(?:直接)?(?:落盘|写入|生成|起草|输出|创建|产出)/u.test(compact);
}

function hasNegatedDiscussionIntent(compactMessage: string) {
  return /(?:不用|不要|无需|不必|别|先不|暂不|不再)(?:再|继续)?(?:讨论|聊聊|聊)/u.test(compactMessage);
}

function isContinueNextChapterTrigger(message: string) {
  const normalized = message.trim();
  const compact = normalized.replace(/\s+/g, '');

  if (/(讨论|聊聊|想一想|先别写|先不要写|不要写)/u.test(compact)) {
    return false;
  }

  return /^(继续|进入|开始|写).{0,12}(下一章|第\d+章)(?:正文|草稿|写作)?/u.test(compact);
}

function shouldBypassPlanModeForWorkflowAction(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  message: string,
) {
  if (step.module !== 'write' && step.module !== 'review') {
    return false;
  }

  if (shouldContinueNextChapterFromReview(step, message)) {
    return true;
  }

  if (step.module === 'write' && step.substepId === 'chapter-pause' && isContinueNextChapterTrigger(message)) {
    return true;
  }

  return isProposalIntent(message);
}

function shouldContinueNextChapterFromReview(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  message: string,
) {
  if (step.module !== 'review' || step.substepId !== 'chapter-review') {
    return false;
  }

  const normalized = message.trim();
  const compact = normalized.replace(/\s+/g, '');

  if (isContinueNextChapterTrigger(normalized)) {
    return true;
  }

  return /(先不修|不修|暂不修|不用修|不要修|跳过修订|跳过修改|先跳过).{0,16}(继续下一章|进入下一章|开始下一章|下一章)/u.test(
    compact,
  );
}

function isContinueCurrentChapterTrigger(message: string) {
  return /(继续修改当前章|重写当前章|回到当前章)/u.test(message.trim());
}

function isChapterFinalizationIntent(message: string) {
  const normalized = message.trim();
  const compact = normalized.replace(/\s+/g, '');

  return /(_定稿\.md|定稿)/u.test(compact)
    || /(?:按|根据).{0,12}(审查报告|审查意见).{0,24}(生成|输出|写入|形成|产出|做成).{0,8}定稿/u.test(normalized)
    || /(?:生成|输出|写入|形成|产出).{0,12}(最终稿|定稿版)/u.test(normalized);
}

function shouldTreatAsWriteRevision(
  step: ReturnType<typeof getCurrentWorkflowStep>,
  message: string,
) {
  if (step.module !== 'write') {
    return false;
  }

  return /局部改写任务|按审查报告.*修改|根据审查报告.*修改/u.test(message.trim());
}

function formatChapterLabel(chapterNumber: number) {
  return `第${String(chapterNumber).padStart(3, '0')}章`;
}

function decodeHeaderPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isReviewTrigger(message: string) {
  const normalized = message.trim();
  const compact = normalized.replace(/\s+/g, '');

  if (/(后面|之后|后续|以后|回头|稍后|待会|将来).{0,8}(审查|质检|review)|逐章审查|逐章质检/u.test(normalized)) {
    return false;
  }

  return /^(请|帮我|开始|继续|先|直接|立即|立刻|马上)?(?:审查|质检|review)/iu.test(compact)
    || /(?:请|帮我).*(审查|质检|review)/iu.test(normalized);
}

function isGuideFreeformSubstep(step: ReturnType<typeof getCurrentWorkflowStep>) {
  return step.module === 'guide' && isGuideDiscussionSubstepId(step.substepId);
}

function resolveReviewSubstepId(message: string, module: string) {
  if (/设定|人设|金手指|核心能力|差异化能力/u.test(message)) {
    return 'setting-review' as const;
  }

  if (/正文|章节|草稿|第[零一二三四五六七八九十百\d]+章(?!纲)/u.test(message)) {
    return 'chapter-review' as const;
  }

  if (/大纲|章纲|卷纲/u.test(message)) {
    return 'outline-review' as const;
  }

  if (module === 'define' || module === 'ideation') {
    return 'setting-review' as const;
  }

  if (module === 'outline') {
    return 'outline-review' as const;
  }

  if (module === 'write') {
    return 'chapter-review' as const;
  }

  return null;
}

async function copySampleProjectFiles(projectRoot: string, skillPackPath: string) {
  const sampleAssetRoot = path.join(skillPackPath, 'extension/assets/longformnovel/examples/workflow-sample');
  await cp(sampleAssetRoot, projectRoot, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

async function findMissingProjectFiles(projectRoot: string, filePaths: string[]) {
  const missing: string[] = [];

  for (const filePath of filePaths) {
    const content = await readProjectFileIfExists(projectRoot, filePath);
    if (content === null) {
      missing.push(filePath);
    }
  }

  return missing;
}
