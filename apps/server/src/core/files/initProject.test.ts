import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from './initProject';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

const tempDirs: string[] = [];

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-webui-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('initProject', () => {
  it('creates the original project structure and copies the skill pack assets', async () => {
    const workspaceRoot = await makeWorkspace();

    await initProject({ projectRoot: workspaceRoot, skillPackPath });

    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '# PROJECT.md — 项目控制面板',
    );
    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '预期.md'), 'utf8'),
    ).resolves.toContain('# 新书预期');
    await expect(
      readFile(path.join(workspaceRoot, '.novelkit', 'constitution', 'MASTER.md'), 'utf8'),
    ).resolves.toContain('## 1. 核心原则');
    await expect(
      readFile(path.join(workspaceRoot, '.novelflow', 'skills', 'longformnovel', 'SKILL.md'), 'utf8'),
    ).resolves.toContain('## Steps');
    await expect(
      readFile(path.join(workspaceRoot, '长篇小说技能说明书.md'), 'utf8'),
    ).resolves.toContain('# Novel Writing Skills Pack');
    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '1.2_文风.md'), 'utf8'),
    ).resolves.toContain('# 文风指南');
    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '1.3_套路方向.md'), 'utf8'),
    ).resolves.toContain('# 套路方向与核心设定');
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.1_创意脑暴.md'), 'utf8'),
    ).resolves.toContain('# 创意脑暴');
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.2_新书设定案.md'), 'utf8'),
    ).resolves.toContain('# 新书设定案');
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.3_金手指设定.md'), 'utf8'),
    ).resolves.toContain('# 金手指设定');
    await expect(
      readFile(path.join(workspaceRoot, '2-设定', '2.4_主要角色设定表.md'), 'utf8'),
    ).resolves.toContain('# 主要角色设定表');
  });

  it('is idempotent and does not overwrite existing user files', async () => {
    const workspaceRoot = await makeWorkspace();

    await initProject({ projectRoot: workspaceRoot, skillPackPath });

    const customProject = '# custom project';
    const customExpectation = '# custom expectation';
    const customStyle = '# custom style';

    await writeFile(path.join(workspaceRoot, 'PROJECT.md'), customProject, 'utf8');
    await writeFile(path.join(workspaceRoot, '1-边界', '预期.md'), customExpectation, 'utf8');
    await writeFile(path.join(workspaceRoot, '1-边界', '1.2_文风.md'), customStyle, 'utf8');

    await initProject({ projectRoot: workspaceRoot, skillPackPath });

    await expect(readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8')).resolves.toBe(customProject);
    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '预期.md'), 'utf8'),
    ).resolves.toBe(customExpectation);
    await expect(
      readFile(path.join(workspaceRoot, '1-边界', '1.2_文风.md'), 'utf8'),
    ).resolves.toBe(customStyle);
  });
});
