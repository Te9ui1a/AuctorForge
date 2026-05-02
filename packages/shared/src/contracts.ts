export type ChatMode = 'auto' | 'plan' | 'write';

export type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
  thinkingDuration?: number;
  attachments?: Array<{ name: string }>;
};

export type WriteTargetHint = {
  strictWorkflowWrites: string[];
  chatAllowedWrites: string[];
  activeDocumentPath: string | null;
  hasPendingProposal: boolean;
};

export type ChatSessionResponse = {
  messages: ChatMessage[];
  writeTargetHint: WriteTargetHint;
};

export type ChatSessionRequest = {
  messages?: ChatMessage[];
};

export type ChatAttachment = {
  name: string;
  mimeType: string;
  size: number;
  textContent: string;
};

export type ChatRequest = {
  message: string;
  approved: boolean;
  requestId?: string;
  activeDocumentPath?: string;
  attachments?: ChatAttachment[];
  chatMode?: ChatMode;
};

export type ChatErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type SessionResponse = {
  initialized: boolean;
  currentMode?: string;
  currentStepId: string;
  currentModule: string;
  currentStepTitle: string;
  currentSubstepId?: string;
  currentSubstepTitle?: string;
  currentVolumeNumber?: number;
  currentChapterNumber?: number;
  requiresApproval?: boolean;
  pendingDecisionType?: string | null;
  returnTarget?: unknown;
  waitingForApproval: boolean;
  hasPendingDecision?: boolean;
  hasPendingProposal?: boolean;
  interactionMode?: 'discussion' | 'decision' | 'proposal';
  writeTargetHint?: WriteTargetHint;
};

export type PendingDecision = {
  decisionType: string;
  reply: string;
  options?: string[];
};

export type PendingProposal = {
  reply?: string;
  proposedWrites: Array<{
    path: string;
    content?: string;
  }>;
};

export type WorkflowProgressSummary = {
  phase: string;
  coreTask: string;
  nextSuggestion: string;
  callableModules: string[];
  assetPointers?: Array<{
    section: string;
    label: string;
    path: string;
  }>;
  memorySummary?: {
    chapterCount: number;
    latestChapter: number | null;
    unresolvedHookCount: number;
    latestWarningCount: number;
    lastRebuildAt: string | null;
  };
};

export type ProgressResponse = {
  session: SessionResponse;
  requiredProjectReads: string[];
  allowedWrites: string[];
  strictWorkflowWrites?: string[];
  chatAllowedWrites?: string[];
  manualWritablePaths?: string[];
  nextStepId: string | null;
  progressSummary?: WorkflowProgressSummary;
  pendingDecision?: PendingDecision | null;
  pendingProposal?: PendingProposal | null;
};

export type ChatResponse = {
  reply: string;
  session: SessionResponse;
  requestId?: string;
  pendingProposal?: PendingProposal | null;
  error?: ChatErrorPayload;
};

export type FileResponse = {
  path: string;
  content: string;
};

export type FileTreeEntry = {
  path: string;
  label: string;
  type?: 'file' | 'folder';
};

export type FileTreeGroup = {
  title: string;
  files: FileTreeEntry[];
};

export type FileTreeData = {
  rootFiles: FileTreeEntry[];
  groups: FileTreeGroup[];
};

export type BackendProjectStatus = 'missing-path' | 'needs-repair' | 'archived' | 'ready' | 'uninitialized';

export type BackendProjectSummary = {
  id?: string | null;
  projectId: string | null;
  displayName: string;
  rootPath: string;
  status: BackendProjectStatus;
  phase: string | null;
  coreTask: string | null;
  nextSuggestion: string | null;
  currentChapterNumber: number | null;
  lastOpenedAt: string | null;
  lastOpenedDocument: string | null;
};

export type BackendProjectsResponse = {
  activeProjectId: string | null;
  projects: BackendProjectSummary[];
};

export type CreateProjectInput = {
  displayName: string;
  rootPath: string;
  entryMode?: 'create' | 'analyze';
};

export type ProjectMode = 'create' | 'reference';

export const PROJECT_MODES: ProjectMode[] = ['create', 'reference'];

export type ModelProvider = 'openai-compatible' | 'gemini-native';

export type ModelConfig = {
  provider: ModelProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  stream: boolean;
};

export type ModelSettingsStore = {
  activeModelId: 'primary' | 'secondary';
  models: {
    primary: ModelConfig;
    secondary: ModelConfig;
  };
};
