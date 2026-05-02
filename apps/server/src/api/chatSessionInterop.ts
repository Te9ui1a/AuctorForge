import {
  isGuideDiscussionSubstepId,
  type DiscussionNoteSnapshotEntry,
} from '../core/chat/discussionBuffer';
import {
  readProjectSession,
  type ProjectSessionInput,
  type ProjectSessionMessage,
  writeProjectSession,
} from '../core/chat/projectSessionStore';

type ChatSessionWriteTargetHint = {
  strictWorkflowWrites: string[];
  chatAllowedWrites: string[];
  activeDocumentPath: string | null;
  hasPendingProposal: boolean;
};

export function buildChatSessionResponse(
  messages: ProjectSessionMessage[],
  writeTargetHint: ChatSessionWriteTargetHint = {
    strictWorkflowWrites: [],
    chatAllowedWrites: [],
    activeDocumentPath: null,
    hasPendingProposal: false,
  },
) {
  return {
    messages,
    writeTargetHint,
  };
}

export function parseChatSessionBody(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload);

  if (keys.length !== 1 || keys[0] !== 'messages') {
    return null;
  }

  if (!Array.isArray(payload.messages)) {
    return null;
  }

  return {
    messages: payload.messages as ProjectSessionMessage[],
  };
}

export async function readProjectSessionWithGuideDiscussionNotes(projectRoot: string) {
  return readProjectSession(projectRoot);
}

export async function writeProjectSessionWithGuideDiscussionNotes(projectRoot: string, session: ProjectSessionInput) {
  return writeProjectSession(projectRoot, session);
}

export function normalizeGuideDiscussionNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeGuideDiscussionNote(entry))
    .filter((entry): entry is DiscussionNoteSnapshotEntry => entry !== null);
}

function normalizeGuideDiscussionNote(value: unknown): DiscussionNoteSnapshotEntry | null {
  const rawEntry = asRecord(value);
  const stepId = normalizeNonEmptyString(rawEntry?.stepId);
  const substepId = normalizeNonEmptyString(rawEntry?.substepId);
  const module = rawEntry?.module === 'guide' ? 'guide' : null;
  const notes = normalizeGuideDiscussionNoteTexts(rawEntry?.notes);

  if (stepId === null || substepId === null || module === null || !isGuideDiscussionSubstepId(substepId) || notes.length === 0) {
    return null;
  }

  return {
    stepId,
    substepId,
    module,
    notes,
  };
}

function normalizeGuideDiscussionNoteTexts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const notes: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalized = entry.replace(/\s+/g, ' ').trim();
    if (!normalized || notes.at(-1) === normalized) {
      continue;
    }

    notes.push(normalized);
  }

  return notes;
}

export function mergeDiscussionNoteSnapshots(
  persistedNotes: DiscussionNoteSnapshotEntry[],
  guideDiscussionNotes: DiscussionNoteSnapshotEntry[],
) {
  const merged = new Map<string, DiscussionNoteSnapshotEntry>();

  for (const entry of [...persistedNotes, ...guideDiscussionNotes]) {
    merged.set(`${entry.module}:${entry.stepId}:${entry.substepId}`, entry);
  }

  return Array.from(merged.values());
}

function asRecord(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}
