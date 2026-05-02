import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkflowMode } from '../workflow/contracts/types';
import type { WorkflowReturnTarget } from '../workflow/stateMachine';
import { DEFAULT_VOLUME_NUMBER } from '../paths/volumeContext';
import type { DiscussionNoteSnapshotEntry } from './discussionBuffer';

const PROJECT_SESSION_VERSION = 1;

export const MAX_PERSISTED_CHAT_MESSAGES = 200;

export type ProjectSessionMessage = {
  role: 'assistant' | 'user';
  content: string;
  thinkingDuration?: number;
  attachments?: Array<{ name: string }>;
};

export type ProjectSessionWorkflowSnapshot = {
  initialized: boolean;
  currentMode: WorkflowMode;
  currentStepId: string;
  currentSubstepId: string;
  currentVolumeNumber: number;
  currentChapterNumber: number;
  returnTarget: WorkflowReturnTarget | null;
};

export type ProjectSessionInput = {
  messages: ProjectSessionMessage[];
  discussionNotes: DiscussionNoteSnapshotEntry[];
  workflow: ProjectSessionWorkflowSnapshot | null;
};

export type ProjectSessionStore = ProjectSessionInput & {
  version: typeof PROJECT_SESSION_VERSION;
  savedAt: string;
};

export class ProjectSessionStoreDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectSessionStoreDataError';
  }
}

export function resolveProjectSessionPath(projectRoot: string) {
  return path.join(projectRoot, '.novelflow', 'chat', 'session.json');
}

export async function readProjectSession(projectRoot: string): Promise<ProjectSessionStore | null> {
  const filePath = resolveProjectSessionPath(projectRoot);
  let content: string;

  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw new ProjectSessionStoreDataError(`Failed to read project session at ${filePath}.`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new ProjectSessionStoreDataError(`Project session at ${filePath} contains malformed JSON.`);
  }

  return normalizeStoredProjectSession(parsed);
}

export async function writeProjectSession(projectRoot: string, session: ProjectSessionInput) {
  const normalized = {
    version: PROJECT_SESSION_VERSION,
    savedAt: new Date().toISOString(),
    ...normalizeProjectSessionInput(session),
  } satisfies ProjectSessionStore;

  await writeJsonAtomically(resolveProjectSessionPath(projectRoot), JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizeStoredProjectSession(session: unknown): ProjectSessionStore {
  const rawSession = expectRecord(session, 'project session');

  return {
    version: parseProjectSessionVersion(rawSession.version),
    savedAt: parseIsoTimestamp(rawSession.savedAt, 'project session.savedAt'),
    messages: normalizeMessages(rawSession.messages),
    discussionNotes: normalizeDiscussionNotes(rawSession.discussionNotes),
    workflow: normalizeWorkflowSnapshot(rawSession.workflow),
  };
}

function normalizeProjectSessionInput(session: ProjectSessionInput): ProjectSessionInput {
  return {
    messages: normalizeMessages(session.messages),
    discussionNotes: normalizeDiscussionNotes(session.discussionNotes),
    workflow: normalizeWorkflowSnapshot(session.workflow),
  };
}

function normalizeMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeMessage(entry))
    .filter((entry): entry is ProjectSessionMessage => entry !== null)
    .slice(-MAX_PERSISTED_CHAT_MESSAGES);
}

function normalizeMessage(value: unknown): ProjectSessionMessage | null {
  const rawMessage = asRecord(value);
  if (rawMessage === null) {
    return null;
  }

  const role = rawMessage?.role;

  if (role !== 'assistant' && role !== 'user') {
    return null;
  }

  if (typeof rawMessage.content !== 'string') {
    return null;
  }

  const attachments = normalizeAttachments(rawMessage.attachments);
  const thinkingDuration = normalizeThinkingDuration(rawMessage.thinkingDuration);

  return {
    role,
    content: rawMessage.content,
    ...(thinkingDuration === undefined ? {} : { thinkingDuration }),
    ...(attachments.length === 0 ? {} : { attachments }),
  };
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const rawAttachment = asRecord(entry);
      const name = normalizeNonEmptyString(rawAttachment?.name);

      if (name === null) {
        return null;
      }

      return { name };
    })
    .filter((entry): entry is { name: string } => entry !== null);
}

function normalizeThinkingDuration(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
}

function normalizeDiscussionNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeDiscussionNote(entry))
    .filter((entry): entry is DiscussionNoteSnapshotEntry => entry !== null);
}

function normalizeDiscussionNote(value: unknown): DiscussionNoteSnapshotEntry | null {
  const rawNote = asRecord(value);
  const stepId = normalizeNonEmptyString(rawNote?.stepId);
  const substepId = normalizeNonEmptyString(rawNote?.substepId);
  const module = normalizeDiscussionModule(rawNote?.module);
  const notes = normalizeNotes(rawNote?.notes);

  if (stepId === null || substepId === null || module === null || notes.length === 0) {
    return null;
  }

  return {
    stepId,
    substepId,
    module,
    notes,
  };
}

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const notes: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalized = normalizeNote(entry);
    if (!normalized || notes.at(-1) === normalized) {
      continue;
    }

    notes.push(normalized);
  }

  return notes;
}

function normalizeWorkflowSnapshot(value: unknown): ProjectSessionWorkflowSnapshot | null {
  const rawWorkflow = asRecord(value);

  if (rawWorkflow === null || typeof rawWorkflow.initialized !== 'boolean') {
    return null;
  }

  const currentMode = normalizeWorkflowMode(rawWorkflow.currentMode);
  const currentStepId = normalizeNonEmptyString(rawWorkflow.currentStepId);
  const currentSubstepId = normalizeNonEmptyString(rawWorkflow.currentSubstepId);
  const currentVolumeNumber = normalizePositiveInteger(rawWorkflow.currentVolumeNumber) ?? DEFAULT_VOLUME_NUMBER;
  const currentChapterNumber = normalizePositiveInteger(rawWorkflow.currentChapterNumber);

  if (currentMode === null || currentStepId === null || currentSubstepId === null || currentChapterNumber === null) {
    return null;
  }

  return {
    initialized: rawWorkflow.initialized,
    currentMode,
    currentStepId,
    currentSubstepId,
    currentVolumeNumber,
    currentChapterNumber,
    returnTarget: normalizeReturnTarget(rawWorkflow.returnTarget),
  };
}

function normalizeReturnTarget(value: unknown): WorkflowReturnTarget | null {
  if (value === null || value === undefined) {
    return null;
  }

  const rawTarget = asRecord(value);
  const mode = normalizeWorkflowMode(rawTarget?.mode);
  const stepId = normalizeNonEmptyString(rawTarget?.stepId);
  const substepId = normalizeNonEmptyString(rawTarget?.substepId);
  const chapterNumber = normalizePositiveInteger(rawTarget?.chapterNumber);
  const volumeNumber = normalizePositiveInteger(rawTarget?.volumeNumber) ?? DEFAULT_VOLUME_NUMBER;

  if (mode === null || stepId === null || substepId === null || chapterNumber === null) {
    return null;
  }

  return {
    mode,
    stepId,
    substepId,
    chapterNumber,
    volumeNumber,
  };
}

function normalizeWorkflowMode(value: unknown): WorkflowMode | null {
  if (value === 'standard' || value === 'guide' || value === 'analyze') {
    return value;
  }

  return null;
}

function normalizeDiscussionModule(value: unknown): DiscussionNoteSnapshotEntry['module'] | null {
  if (value === 'define' || value === 'guide' || value === 'ideation' || value === 'outline') {
    return value;
  }

  return null;
}

function parseProjectSessionVersion(value: unknown): typeof PROJECT_SESSION_VERSION {
  if (value !== PROJECT_SESSION_VERSION) {
    throw new ProjectSessionStoreDataError(`project session.version must be ${PROJECT_SESSION_VERSION}.`);
  }

  return value;
}

function parseIsoTimestamp(value: unknown, label: string) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value;
  }

  throw new ProjectSessionStoreDataError(`${label} must be a valid timestamp string.`);
}

function normalizeNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizePositiveInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function normalizeNote(note: string) {
  return note.replace(/\s+/g, ' ').trim();
}

async function writeJsonAtomically(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );

  try {
    await writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function asRecord(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function expectRecord(value: unknown, label: string) {
  const record = asRecord(value);

  if (record === null) {
    throw new ProjectSessionStoreDataError(`${label} must be an object.`);
  }

  return record;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
