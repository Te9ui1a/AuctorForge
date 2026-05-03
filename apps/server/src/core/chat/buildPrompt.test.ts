import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from '../files/initProject';
import { writeStructuredChapters, writeStructuredEntities, writeStructuredQuality } from '../memory/memoryStore';
import { buildStandardModeContract } from '../workflow/contracts/standardMode';
import { createWorkflowState, jumpToWorkflowStep } from '../workflow/stateMachine';
import { buildPrompt } from './buildPrompt';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

const tempDirs: string[] = [];

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-webui-'));
  tempDirs.push(directory);
  await initProject({ projectRoot: directory, skillPackPath });
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('buildPrompt', () => {
  it('injects the current workflow doc, project files, and user message into the prompt', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '我想先明确这本书的故事方向。',
      attachments: [
        {
          name: '样板设定.md',
          mimeType: 'text/markdown',
          size: 32,
          textContent: '# 样板设定\n\n主角来自旧王朝。',
        },
      ],
    });

    expect(prompt.systemPrompt).toContain('新书方向定义');
    expect(prompt.systemPrompt).toContain('Workflow: Define');
    expect(prompt.systemPrompt).toContain('1-边界/预期.md');
    expect(prompt.systemPrompt).toContain('# 新书预期');
    expect(prompt.systemPrompt).toContain('### 当前消息附件');
    expect(prompt.systemPrompt).toContain('样板设定.md');
    expect(prompt.systemPrompt).toContain('主角来自旧王朝');
    expect(prompt.systemPrompt).toContain('### 严格流程写入目标');
    expect(prompt.systemPrompt).toContain('### 聊天可写入范围');
    expect(prompt.systemPrompt).toContain('### 手动保存可写入范围');
    expect(prompt.userPrompt).toContain('我想先明确这本书的故事方向。');
    expect(prompt.userPrompt).not.toContain('### 最近讨论记录');
  });

  it('truncates oversized project file content with a visible summary', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);
    const leadingContent = 'PROJECT_FILE_LEADING_CONTEXT';
    const trailingContent = 'PROJECT_FILE_TRAILING_CONTEXT';
    const oversizedContent = `${leadingContent}\n${'a'.repeat(30_000)}\n${trailingContent}`;

    await writeFile(path.join(workspaceRoot, '1-边界', '预期.md'), oversizedContent, 'utf8');

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '请读取项目设定。',
    });

    expect(prompt.systemPrompt).toContain('### 1-边界/预期.md');
    expect(prompt.systemPrompt).toContain(leadingContent);
    expect(prompt.systemPrompt).toContain(trailingContent);
    expect(prompt.systemPrompt).toContain(
      `[content truncated: original ${oversizedContent.length} chars, retained 8000 chars]`,
    );
    expect(prompt.systemPrompt.length).toBeLessThan(25_000);
  });

  it('marks actual missing required project reads as null', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    await rm(path.join(workspaceRoot, '1-边界', '预期.md'));

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '请读取项目设定。',
    });

    expect(prompt.projectFiles).toContainEqual({
      path: '1-边界/预期.md',
      content: null,
    });
    expect(prompt.systemPrompt).toContain('### 1-边界/预期.md\n<missing>');
  });

  it('propagates missing project root errors instead of marking reads missing', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    await rm(workspaceRoot, { recursive: true, force: true });

    await expect(
      buildPrompt({
        projectRoot: workspaceRoot,
        skillPackPath,
        contract,
        state,
        userMessage: '请读取项目设定。',
      }),
    ).rejects.toMatchObject({ code: 'ENOENT', path: workspaceRoot });
  });

  it('propagates unsafe required project read errors instead of marking them missing', async () => {
    const workspaceRoot = await makeWorkspace();
    const outsideDirectory = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    await writeFile(path.join(outsideDirectory, 'escaped.md'), '# escaped', 'utf8');
    await rm(path.join(workspaceRoot, '1-边界', '预期.md'));
    await symlink(path.join(outsideDirectory, 'escaped.md'), path.join(workspaceRoot, '1-边界', '预期.md'));

    await expect(
      buildPrompt({
        projectRoot: workspaceRoot,
        skillPackPath,
        contract,
        state,
        userMessage: '请读取项目设定。',
      }),
    ).rejects.toThrow(/escapes project root through symlink/);
  });

  it('truncates oversized attachments while preserving metadata', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);
    const leadingContent = 'ATTACHMENT_LEADING_CONTEXT';
    const trailingContent = 'ATTACHMENT_TRAILING_CONTEXT';
    const attachmentContent = `${leadingContent}\n${'b'.repeat(50_000)}\n${trailingContent}`;

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '请结合附件。',
      attachments: [
        {
          name: 'huge-notes.md',
          mimeType: 'text/markdown',
          size: 50_000,
          textContent: attachmentContent,
        },
      ],
    });

    expect(prompt.systemPrompt).toContain('huge-notes.md (text/markdown, 50000 bytes)');
    expect(prompt.systemPrompt).toContain(leadingContent);
    expect(prompt.systemPrompt).toContain(trailingContent);
    expect(prompt.systemPrompt).toContain(
      `[attachment truncated: original ${attachmentContent.length} chars, retained 6000 chars]`,
    );
    expect(prompt.systemPrompt.length).toBeLessThan(25_000);
  });

  it('applies an aggregate prompt budget across many attachments without splitting emoji', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '请结合所有附件。',
      attachments: Array.from({ length: 6 }, (_, index) => ({
        name: `huge-${index}.md`,
        mimeType: 'text/markdown',
        size: 20_000,
        textContent: `ATTACHMENT_${index}_LEADING\n${'😀'.repeat(20_000)}\nATTACHMENT_${index}_TRAILING`,
      })),
    });

    const attachmentSection = prompt.systemPrompt.split('### 当前消息附件')[1]?.split('### 当前激活文档')[0] ?? '';

    expect(attachmentSection).toContain('[attachment truncated:');
    expect(attachmentSection).toContain('aggregate attachment budget');
    expect(attachmentSection.length).toBeLessThan(15_000);
    expect(attachmentSection).not.toContain('\uD83D\n');
    expect(attachmentSection).not.toContain('\n\uDE00');
  });

  it('keeps attachment metadata and omitted-item summaries inside the aggregate prompt budget', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '请结合大量附件。',
      attachments: Array.from({ length: 80 }, (_, index) => ({
        name: `${'超长附件名'.repeat(80)}-${index}.md`,
        mimeType: `text/${'markdown'.repeat(40)}`,
        size: 20_000,
        textContent: `ATTACHMENT_${index}_LEADING\n${'x'.repeat(20_000)}\nATTACHMENT_${index}_TRAILING`,
      })),
    });

    const attachmentSection = prompt.systemPrompt.split('### 当前消息附件')[1]?.split('### 严格流程写入目标')[0] ?? '';

    expect(attachmentSection).toContain('metadata truncated');
    expect(attachmentSection).toContain('attachments omitted: aggregate attachment budget exhausted');
    expect(attachmentSection.length).toBeLessThanOrEqual(12_000);
    expect(attachmentSection).toMatch(/\[attachment truncated: original \d+ chars, retained \d+ chars, aggregate attachment budget\]/);
  });

  it('injects buffered discussion notes into the user prompt when generating', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '生成一版创意脑暴草案',
      discussionNotes: ['主角要克制隐忍，但遇事反应要快', '前三章重点突出“先活下来”'],
    });

    expect(prompt.userPrompt).toContain('用户消息：生成一版创意脑暴草案');
    expect(prompt.userPrompt).toContain('### 最近讨论记录');
    expect(prompt.userPrompt).toContain('主角要克制隐忍，但遇事反应要快');
    expect(prompt.userPrompt).toContain('前三章重点突出“先活下来”');
  });

  it('includes the current chapter review report when revising a chapter draft', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = jumpToWorkflowStep(contract, createWorkflowState(contract), 'write-chapter', {
      substepId: 'chapter-draft',
      chapterNumber: 1,
    });

    await writeFile(
      path.join(workspaceRoot, '5-审查', '第001章_审查报告.md'),
      '# 第001章 审查报告\n\n## AI味专项检查\n- 局部改写任务 1：删除解释性总结句。',
      'utf8',
    );

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '继续修改当前章',
    });

    expect(prompt.systemPrompt).toContain('5-审查/第001章_审查报告.md');
    expect(prompt.systemPrompt).toContain('AI味专项检查');
    expect(prompt.systemPrompt).toContain('局部改写任务');
  });

  it('injects bounded long-term memory context when writing from structured memory', async () => {
    const workspaceRoot = await makeWorkspace();
    const contract = buildStandardModeContract(skillPackPath);
    const state = jumpToWorkflowStep(contract, createWorkflowState(contract), 'write-chapter', {
      substepId: 'chapter-draft',
      chapterNumber: 48,
    });

    await writeStructuredChapters(
      workspaceRoot,
      [45, 46, 47].map((chapterNumber) => ({
        chapterNumber,
        title: `阶段事件第${chapterNumber}夜`,
        summary: `角色甲在第${chapterNumber}章继续追查物件甲下落。`,
        time: null,
        location: null,
        activeCharacters: ['角色甲'],
        objects: chapterNumber === 47 ? [{ name: '物件甲', owner: '角色乙', state: '被带走' }] : [],
        hooksOpened: chapterNumber === 47 ? ['物件甲须在第050章前回收'] : [],
        hooksResolved: [],
        facts: chapterNumber === 47 ? ['物件甲目前在角色乙手里'] : [],
        evidence: [],
        contentHash: String(chapterNumber),
        updatedAt: '2026-04-27T00:00:00.000Z',
      })),
    );
    await writeStructuredEntities(workspaceRoot, {
      'character:角色甲': {
        id: 'character:角色甲',
        kind: 'character',
        name: '角色甲',
        aliases: [],
        status: 'active',
        firstSeenChapter: 1,
        lastSeenChapter: 47,
        evidence: [],
        updatedAt: '2026-04-27T00:00:00.000Z',
      },
    });
    await writeStructuredQuality(workspaceRoot, [
      {
        chapterNumber: 47,
        reviewGate: 'revise',
        narrativeChars: 3200,
        aiFlavorHits: ['结论式抒情'],
        continuityWarnings: ['物件甲伏笔临近回收'],
        evidence: [],
        updatedAt: '2026-04-27T00:00:00.000Z',
      },
    ]);

    const prompt = await buildPrompt({
      projectRoot: workspaceRoot,
      skillPackPath,
      contract,
      state,
      userMessage: '继续写第48章，角色甲要追查物件甲。',
    });

    expect(prompt.systemPrompt).toContain('### 长期记忆摘录');
    expect(prompt.systemPrompt).toContain('第047章');
    expect(prompt.systemPrompt).toContain('物件甲须在第050章前回收');
    expect(prompt.systemPrompt).toContain('角色甲');
    expect(prompt.systemPrompt).toContain('物件甲目前在角色乙手里');
  });
});
