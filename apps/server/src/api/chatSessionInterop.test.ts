import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { describe, expect, it } from 'vitest';

import {
  buildChatSessionResponse,
  mergeDiscussionNoteSnapshots,
  normalizeGuideDiscussionNotes,
  parseChatSessionBody,
  writeProjectSessionWithGuideDiscussionNotes,
} from './chatSessionInterop';
import { readProjectSession } from '../core/chat/projectSessionStore';

const tempDirs: string[] = [];

async function makeProjectRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-chat-session-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('chatSessionInterop', () => {
  it('accepts only chat session payloads that contain a messages array and nothing else', () => {
    expect(parseChatSessionBody({ messages: [{ role: 'user', content: '继续讨论' }] })).toEqual({
      messages: [{ role: 'user', content: '继续讨论' }],
    });

    expect(parseChatSessionBody({ messages: [], workflow: {} })).toBeNull();
    expect(parseChatSessionBody('bad payload')).toBeNull();
  });

  it('normalizes and merges guide discussion snapshots by route identity', () => {
    const normalized = normalizeGuideDiscussionNotes([
      {
        stepId: 'guide-entry',
        substepId: 'character-first',
        module: 'guide',
        notes: [' 先补主角底层动机 ', '先补主角底层动机', '再补核心反派'],
      },
      {
        stepId: 'guide-entry',
        substepId: 'character-first',
        module: 'write',
        notes: ['should drop'],
      },
    ]);

    expect(normalized).toEqual([
      {
        stepId: 'guide-entry',
        substepId: 'character-first',
        module: 'guide',
        notes: ['先补主角底层动机', '再补核心反派'],
      },
    ]);

    expect(
      mergeDiscussionNoteSnapshots(
        [
          {
            stepId: 'guide-entry',
            substepId: 'character-first',
            module: 'guide',
            notes: ['旧备注'],
          },
        ],
        normalized,
      ),
    ).toEqual(normalized);
  });

  it('builds chat session responses with write-target hints intact', () => {
    expect(
      buildChatSessionResponse(
        [{ role: 'assistant', content: '这是已保存回复。' }],
        {
          strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
          chatAllowedWrites: ['4-正文/第001章_草稿.md'],
          activeDocumentPath: '4-正文/第001章_草稿.md',
          hasPendingProposal: true,
        },
      ),
    ).toEqual({
      messages: [{ role: 'assistant', content: '这是已保存回复。' }],
      writeTargetHint: {
        strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
        chatAllowedWrites: ['4-正文/第001章_草稿.md'],
        activeDocumentPath: '4-正文/第001章_草稿.md',
        hasPendingProposal: true,
      },
    });
  });

  it('preserves store-normalized guide discussion entries instead of collapsing duplicate route identities', async () => {
    const projectRoot = await makeProjectRoot();

    await writeProjectSessionWithGuideDiscussionNotes(projectRoot, {
      messages: [],
      discussionNotes: [
        {
          stepId: 'guide-entry',
          substepId: 'character-first',
          module: 'guide',
          notes: ['先补主角底层动机'],
        },
        {
          stepId: 'guide-entry',
          substepId: 'character-first',
          module: 'guide',
          notes: ['再补核心反派'],
        },
      ],
      workflow: null,
    });

    await expect(readProjectSession(projectRoot)).resolves.toMatchObject({
      discussionNotes: [
        {
          stepId: 'guide-entry',
          substepId: 'character-first',
          module: 'guide',
          notes: ['先补主角底层动机'],
        },
        {
          stepId: 'guide-entry',
          substepId: 'character-first',
          module: 'guide',
          notes: ['再补核心反派'],
        },
      ],
    });
  });
});
