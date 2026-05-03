import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from '../files/initProject';
import { buildGuideProposal } from './buildGuideProposal';

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

describe('buildGuideProposal', () => {
  it('asks the user to choose between asset import, inspiration-first, and normal flow', async () => {
    const workspaceRoot = await makeWorkspace();
    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');

    const proposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-guide-mode',
      userMessage: 'guide',
    });

    expect(proposal.reply).toContain('带资进组');
    expect(proposal.reply).toContain('灵感切入');
    expect(proposal.reply).toContain('常规流程');
    expect(proposal.proposedWrites).toEqual([]);
    expect(proposal.nextTarget).toBeNull();
  });

  it('scans legacy files, proposes migration into the standard paths, and recommends the next module', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '旧设定.md'), '# 旧设定\n\n世界观：组织体系甲。', 'utf8');
    await writeFile(
      path.join(workspaceRoot, '旧章纲.md'),
      '第1章：旧章纲开篇\n\n**章节梗概**：先活下来。\n\n**场景拆解**：\n- 场景1：旧势力逼近',
      'utf8',
    );

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-guide-mode',
      userMessage: '带资进组',
    });

    expect(proposal.proposedWrites).toEqual([]);
    expect(proposal.nextTarget).toMatchObject({ substepId: 'scan-assets', mode: 'guide' });

    const importProposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'scan-assets',
      userMessage: '带资进组',
    });

    expect(importProposal.reply).toContain('旧设定.md');
    expect(importProposal.reply).toContain('旧章纲.md');
    expect(importProposal.reply).toContain('推荐下一步：write');
    expect(importProposal.nextTarget).toMatchObject({
      stepId: 'write-chapter',
      substepId: 'chapter-draft',
      chapterNumber: 1,
    });
    expect(importProposal.proposedWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '2-设定/2.2_新书设定案.md' }),
        expect.objectContaining({ path: '3-大纲/第01卷_章纲.md' }),
        expect.objectContaining({ path: 'PROJECT.md' }),
      ]),
    );
  });

  it('asks for explicit mapping when multiple candidate files match the same asset type', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '旧设定A.md'), '# 旧设定A\n\n世界观：组织体系甲。', 'utf8');
    await writeFile(path.join(workspaceRoot, '旧设定B.md'), '# 旧设定B\n\n世界观：仙朝治世。', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'scan-assets',
      userMessage: '带资进组',
    });

    expect(proposal.reply).toContain('发现多个可映射到同一资产类型的文件');
    expect(proposal.reply).toContain('旧设定A.md');
    expect(proposal.reply).toContain('旧设定B.md');
    expect(proposal.proposedWrites).toEqual([]);
    expect(proposal.nextTarget).toBeNull();

    const resolved = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'scan-assets',
      userMessage: '使用 旧设定B.md 作为设定文件',
    });

    expect(resolved.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.2_新书设定案.md', content: expect.stringContaining('仙朝治世') })]),
    );
  });

  it('recognizes docx assets by filename and registers imported role/draft pointers in PROJECT', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '角色资料.docx'), '', 'utf8');
    await writeFile(path.join(workspaceRoot, '第一章存稿.docx'), '', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'scan-assets',
      userMessage: '带资进组',
    });

    expect(proposal.proposedWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '2-设定/2.4_主要角色设定表.md' }),
        expect.objectContaining({ path: '4-正文/第001章_草稿.md' }),
      ]),
    );
    expect(proposal.proposedWrites.find((item) => item.path === 'PROJECT.md')?.content).toContain('导入角色');
    expect(proposal.proposedWrites.find((item) => item.path === 'PROJECT.md')?.content).toContain('第001章草稿');
  });

  it('supports character-first entry and routes back into ideation', async () => {
    const workspaceRoot = await makeWorkspace();
    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');

    const chooseProposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-guide-mode',
      userMessage: '灵感切入',
    });

    expect(chooseProposal.proposedWrites).toEqual([]);
    expect(chooseProposal.nextTarget).toMatchObject({ substepId: 'choose-entry-focus', mode: 'guide' });

    const branchProposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-entry-focus',
      userMessage: '我只想先写人设',
    });

    expect(branchProposal.proposedWrites).toEqual([]);
    expect(branchProposal.nextTarget).toMatchObject({ substepId: 'character-first', mode: 'guide' });

    const characterProposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'character-first',
      userMessage: '我只想先写人设',
    });

    expect(characterProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '2-设定/2.4_主要角色设定表.md' })]),
    );
    expect(characterProposal.nextTarget).toMatchObject({
      stepId: 'ideation-build',
      substepId: 'setting-draft',
      mode: 'standard',
    });
  });

  it('supports draft-first entry by creating a trial sample draft', async () => {
    const workspaceRoot = await makeWorkspace();
    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');

    const proposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-entry-focus',
      userMessage: '我想直接写个开头试试',
    });

    expect(proposal.proposedWrites).toEqual([]);
    expect(proposal.nextTarget).toMatchObject({ substepId: 'draft-first', mode: 'guide' });

    const draftProposal = await buildGuideProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'draft-first',
      userMessage: '我想直接写个开头试试',
    });

    expect(draftProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '4-正文/试读样章.md' })]),
    );
    expect(draftProposal.nextTarget).toMatchObject({
      stepId: 'outline-plan',
      substepId: 'master-outline',
      mode: 'standard',
    });
  });
});
