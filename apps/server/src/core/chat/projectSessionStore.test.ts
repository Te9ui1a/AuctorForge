import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_PERSISTED_CHAT_MESSAGES,
  ProjectSessionStoreDataError,
  readProjectSession,
  resolveProjectSessionPath,
  writeProjectSession,
} from './projectSessionStore';

const tempDirs: string[] = [];

async function makeProjectRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-project-session-'));
  tempDirs.push(directory);
  return directory;
}

async function writeSessionContents(projectRoot: string, content: string) {
  const filePath = resolveProjectSessionPath(projectRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('projectSessionStore', () => {
  it('returns null when no session file exists', async () => {
    const projectRoot = await makeProjectRoot();

    expect(resolveProjectSessionPath(projectRoot)).toBe(path.join(projectRoot, '.novelflow', 'chat', 'session.json'));
    await expect(readProjectSession(projectRoot)).resolves.toBeNull();
  });

  it('writes and reads the saved project session without persisting legacy preferred chat mode', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T12:00:00.000Z'));

    const projectRoot = await makeProjectRoot();
    const legacySession = {
      messages: [
        {
          role: 'assistant' as const,
          content: '你好，我是你的创作助手。',
          thinkingDuration: 1200,
          attachments: [{ name: '设定.md' }],
        },
        {
          role: 'user' as const,
          content: '我们先确定故事方向。',
        },
      ],
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'brainstorm',
          module: 'define' as const,
          notes: ['主角先走组织线，再转朝堂线'],
        },
      ],
      workflow: {
        initialized: true,
        currentMode: 'standard' as const,
        currentStepId: 'define-direction',
        currentSubstepId: 'brainstorm',
        currentVolumeNumber: 1,
        currentChapterNumber: 1,
        returnTarget: null,
      },
      preferredChatMode: 'plan' as const,
    };

    await writeProjectSession(projectRoot, legacySession);

    await expect(readProjectSession(projectRoot)).resolves.toEqual({
      version: 1,
      savedAt: '2026-04-05T12:00:00.000Z',
      messages: legacySession.messages,
      discussionNotes: legacySession.discussionNotes,
      workflow: legacySession.workflow,
    });
    await expect(readFile(resolveProjectSessionPath(projectRoot), 'utf8')).resolves.toContain('主角先走组织线，再转朝堂线');
    await expect(readFile(resolveProjectSessionPath(projectRoot), 'utf8')).resolves.not.toContain('preferredChatMode');
  });

  it('throws on malformed session JSON and preserves the corrupt file', async () => {
    const projectRoot = await makeProjectRoot();
    const corruptJson = '{"version":';

    await writeSessionContents(projectRoot, corruptJson);

    await expect(readProjectSession(projectRoot)).rejects.toThrow(ProjectSessionStoreDataError);
    await expect(readFile(resolveProjectSessionPath(projectRoot), 'utf8')).resolves.toBe(corruptJson);
  });

  it('throws when a parsed session payload is missing savedAt', async () => {
    const projectRoot = await makeProjectRoot();

    await writeSessionContents(
      projectRoot,
      JSON.stringify({
        version: 1,
        messages: [],
        discussionNotes: [],
        workflow: null,
      }),
    );

    await expect(readProjectSession(projectRoot)).rejects.toThrow(ProjectSessionStoreDataError);
  });

  it('throws when a parsed session payload has an invalid savedAt timestamp', async () => {
    const projectRoot = await makeProjectRoot();

    await writeSessionContents(
      projectRoot,
      JSON.stringify({
        version: 1,
        savedAt: 'not-a-date',
        messages: [],
        discussionNotes: [],
        workflow: null,
      }),
    );

    await expect(readProjectSession(projectRoot)).rejects.toThrow(ProjectSessionStoreDataError);
  });

  it('throws when a parsed session payload has an unsupported version', async () => {
    const projectRoot = await makeProjectRoot();

    await writeSessionContents(
      projectRoot,
      JSON.stringify({
        version: 2,
        savedAt: '2026-04-05T15:30:00.000Z',
        messages: [],
        discussionNotes: [],
        workflow: null,
      }),
    );

    await expect(readProjectSession(projectRoot)).rejects.toThrow(ProjectSessionStoreDataError);
  });

  it('throws when a parsed session payload has a malformed version field', async () => {
    const projectRoot = await makeProjectRoot();

    await writeSessionContents(
      projectRoot,
      JSON.stringify({
        version: 'broken',
        savedAt: '2026-04-05T15:30:00.000Z',
        messages: [],
        discussionNotes: [],
        workflow: null,
      }),
    );

    await expect(readProjectSession(projectRoot)).rejects.toThrow(ProjectSessionStoreDataError);
  });

  it('recovers from parsed but invalid payloads by normalizing safe fields', async () => {
    const projectRoot = await makeProjectRoot();

    await writeSessionContents(
      projectRoot,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-05T15:30:00.000Z',
        messages: [
          {
            role: 'assistant',
            content: '已保存的回复',
            thinkingDuration: 300,
            attachments: [{ name: '设定.md', ignored: true }, { name: '   ' }],
          },
          {
            role: 'system',
            content: 'should be ignored',
          },
          {
            role: 'user',
            content: 42,
          },
        ],
        discussionNotes: [
          {
            stepId: 'define-direction',
            substepId: 'brainstorm',
            module: 'define',
            notes: ['  先定世界观  ', '', '主角先活下来', 1],
          },
          {
            stepId: '',
            substepId: 'brainstorm',
            module: 'define',
            notes: ['should be ignored'],
          },
          {
            stepId: 'guide-step',
            substepId: 'guide',
            module: 'guide',
            notes: ['这条 guide 讨论现在应该被保留'],
          },
        ],
        workflow: {
          initialized: 'yes',
          currentMode: 'sideways',
          currentStepId: '',
          currentSubstepId: 'brainstorm',
          currentChapterNumber: 0,
          returnTarget: {
            mode: 'standard',
            stepId: '',
            substepId: 'brainstorm',
            chapterNumber: 0,
          },
        },
        preferredChatMode: 'invalid-mode',
      }),
    );

    await expect(readProjectSession(projectRoot)).resolves.toEqual({
      version: 1,
      savedAt: '2026-04-05T15:30:00.000Z',
      messages: [
        {
          role: 'assistant',
          content: '已保存的回复',
          thinkingDuration: 300,
          attachments: [{ name: '设定.md' }],
        },
      ],
      discussionNotes: [
        {
          stepId: 'define-direction',
          substepId: 'brainstorm',
          module: 'define',
          notes: ['先定世界观', '主角先活下来'],
        },
        {
          stepId: 'guide-step',
          substepId: 'guide',
          module: 'guide',
          notes: ['这条 guide 讨论现在应该被保留'],
        },
      ],
      workflow: null,
    });
  });

  it('drops legacy preferred chat mode when reading older session files', async () => {
    const projectRoot = await makeProjectRoot();

    await writeSessionContents(
      projectRoot,
      JSON.stringify({
        version: 1,
        savedAt: '2026-04-05T16:00:00.000Z',
        messages: [],
        discussionNotes: [],
        workflow: null,
        preferredChatMode: 'write',
      }),
    );

    await expect(readProjectSession(projectRoot)).resolves.toEqual({
      version: 1,
      savedAt: '2026-04-05T16:00:00.000Z',
      messages: [],
      discussionNotes: [],
      workflow: null,
    });
  });

  it('trims persisted messages to the newest entries', async () => {
    const projectRoot = await makeProjectRoot();
    const messages = Array.from({ length: MAX_PERSISTED_CHAT_MESSAGES + 3 }, (_, index) => ({
      role: index % 2 === 0 ? ('assistant' as const) : ('user' as const),
      content: `消息 ${index + 1}`,
    }));

    await writeProjectSession(projectRoot, {
      messages,
      discussionNotes: [],
      workflow: null,
    });

    await expect(readProjectSession(projectRoot)).resolves.toMatchObject({
      messages: messages.slice(-MAX_PERSISTED_CHAT_MESSAGES),
      discussionNotes: [],
      workflow: null,
    });
  });
});
