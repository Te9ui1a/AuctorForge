import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from '../files/initProject';
import { buildAnalyzeProposal } from './buildAnalyzeProposal';

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

describe('buildAnalyzeProposal', () => {
  it('asks the user to confirm the detected sample book before analysis starts', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'prepare-sample-book',
      userMessage: 'analyze',
    });

    expect(proposal.reply).toContain('样板书.txt');
    expect(proposal.reply).toContain('请先确认');
    expect(proposal.proposedWrites).toEqual([]);
    expect(proposal.nextTarget).toMatchObject({
      stepId: 'analyze-entry',
      substepId: 'choose-summary-mode',
      mode: 'analyze',
    });
  });

  it('requires explicit sample-book selection when multiple sample books exist', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '样板书A.txt'), '第一章 旧书开场', 'utf8');
    await writeFile(path.join(workspaceRoot, '样板书B.txt'), '第一章 新书开场', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const initial = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'prepare-sample-book',
      userMessage: 'analyze',
    });

    expect(initial.reply).toContain('样板书A.txt');
    expect(initial.reply).toContain('样板书B.txt');
    expect(initial.reply).toContain('请选择');
    expect(initial.proposedWrites).toEqual([]);

    const choose = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'prepare-sample-book',
      userMessage: '使用 样板书B.txt',
    });

    expect(choose.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '.novelkit/memory/analyze_selection.json' })]),
    );
    expect(choose.nextTarget).toMatchObject({ substepId: 'choose-summary-mode' });
  });

  it('does not move past prepare step when no sample book exists', async () => {
    const workspaceRoot = await makeWorkspace();

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'prepare-sample-book',
      userMessage: 'analyze',
    });

    expect(proposal.reply).toContain('未发现样板书文件');
    expect(proposal.nextTarget).toMatchObject({ substepId: 'prepare-sample-book' });
  });

  it('detects sample books placed under 1-边界 as described by the workflow', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '1-边界', '样板书.txt'), '第一章 开局事件', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'prepare-sample-book',
      userMessage: 'analyze',
    });

    expect(proposal.reply).toContain('1-边界/样板书.txt');
  });

  it('supports mode B and generates the reference assets step by step', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。\n第二章 初试差异化能力\n线索甲能预知短暂未来，让主角躲过外部压力。\n第三章 阶段反转\n主角借势阶段反转，建立第一轮期待。',
      'utf8',
    );

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');

    const synopsisProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-summary-mode',
      userMessage: '方式 B',
    });
    expect(synopsisProposal.reply).toContain('方式 B');
    expect(synopsisProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.1_全书故事梗概.md' })]),
    );
    expect(synopsisProposal.proposedWrites.find((item) => item.path === 'PROJECT.md')?.content).toContain(
      '- **核心任务**：完成 1.1 并继续拆解样板书',
    );
    expect(synopsisProposal.nextTarget).toMatchObject({ substepId: 'style-analysis' });

    const styleProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'style-analysis',
      userMessage: '继续',
    });
    expect(styleProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.2_文风.md' })]),
    );

    const tropeProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'trope-analysis',
      userMessage: '继续',
    });
    expect(
      tropeProposal.proposedWrites.find((item) => item.path === '1-边界/1.3_套路方向.md')?.content,
    ).toContain('线索甲');

    const frameworkProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'framework-analysis',
      userMessage: '继续',
    });
    expect(frameworkProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.4_全书框架.md' })]),
    );

    const microProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'micro-analysis',
      userMessage: '继续',
    });
    expect(
      microProposal.proposedWrites.find((item) => item.path === '1-边界/1.5_微观节奏拆解.md')?.content,
    ).toContain('第一章');

    const customProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'custom-analysis',
      userMessage: '不需要自定义拆解',
    });
    expect(customProposal.proposedWrites).toEqual([]);
    expect(customProposal.nextTarget).toMatchObject({
      stepId: 'ideation-build',
      substepId: 'setting-draft',
    });
  });

  it('uses the selected sample book in later analyze substeps', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '样板书A.txt'), '第一章 旧书开场\n主角捡到木剑。', 'utf8');
    await writeFile(path.join(workspaceRoot, '样板书B.txt'), '第一章 新书开场\n主角捡到线索甲。', 'utf8');
    await writeFile(
      path.join(workspaceRoot, '.novelkit', 'memory', 'analyze_selection.json'),
      JSON.stringify({ sampleBookPath: '样板书B.txt' }),
      'utf8',
    );

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const synopsisProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-summary-mode',
      userMessage: '方式 B',
    });

    expect(
      synopsisProposal.proposedWrites.find((item) => item.path === '1-边界/1.1_全书故事梗概.md')?.content,
    ).toContain('线索甲');
  });

  it('supports mode A env guidance before moving on to story summary', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(
      path.join(workspaceRoot, '样板书.txt'),
      '第一章 开局事件\n主角在场景甲避雨，捡到一枚线索甲。',
      'utf8',
    );

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');

    const envProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-summary-mode',
      userMessage: '方式 A',
    });

    expect(envProposal.reply).toContain('.env');
    expect(envProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '.env' })]),
    );
    expect(envProposal.nextTarget).toMatchObject({ substepId: 'await-env-confirmation' });

    await writeFile(path.join(workspaceRoot, '.env'), 'NOVEL_API_KEY=test\n', 'utf8');

    const readyProposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'await-env-confirmation',
      userMessage: '已填写',
    });

    expect(readyProposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '1-边界/1.1_全书故事梗概.md' })]),
    );
    expect(readyProposal.nextTarget).toMatchObject({ substepId: 'style-analysis' });
    await expect(access(path.join(workspaceRoot, '.env'))).resolves.toBeUndefined();
  });

  it('does not accept an empty env template as a valid A-path configuration', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '样板书.txt'), '第一章 开局事件', 'utf8');
    await writeFile(path.join(workspaceRoot, '.env'), 'NOVEL_API_KEY=\n', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'await-env-confirmation',
      userMessage: '已填写',
    });

    expect(proposal.reply).toContain('NOVEL_API_KEY');
    expect(proposal.proposedWrites).toEqual([]);
  });

  it('asks again when the user gives an ambiguous A/B response', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '样板书.txt'), '第一章 开局事件', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'choose-summary-mode',
      userMessage: '继续',
    });

    expect(proposal.reply).toContain('方式 A');
    expect(proposal.reply).toContain('方式 B');
    expect(proposal.proposedWrites).toEqual([]);
  });

  it('treats custom analyze requests as requests instead of skipping when they contain continue language', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '样板书.txt'), '第一章 开局事件', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'custom-analysis',
      userMessage: '继续，帮我拆一下人物关系和爽点设计',
    });

    expect(proposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '1-边界/自定义_样板书拆解.md' })]),
    );
  });

  it('honors a user-specified output path for custom analyze', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '样板书.txt'), '第一章 开局事件', 'utf8');

    const projectContent = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const proposal = await buildAnalyzeProposal({
      projectRoot: workspaceRoot,
      projectContent,
      currentSubstepId: 'custom-analysis',
      userMessage: '帮我拆一下反派线，输出到 1-边界/反派线拆解.md',
    });

    expect(proposal.proposedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '1-边界/反派线拆解.md' })]),
    );
  });
});
