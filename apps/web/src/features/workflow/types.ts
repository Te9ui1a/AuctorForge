import type { ProgressResponse } from 'shared';

export type {
  ChatAttachment,
  ChatErrorPayload,
  ChatMessage,
  ChatMode,
  ChatRequest,
  ChatResponse,
  ChatSessionRequest,
  ChatSessionResponse,
  FileResponse,
  FileTreeData,
  FileTreeEntry,
  FileTreeGroup,
  PendingDecision,
  PendingProposal,
  ProgressResponse,
  SessionResponse,
  WriteTargetHint,
} from 'shared';

export type WorkflowProgressSummary = NonNullable<ProgressResponse['progressSummary']>;
