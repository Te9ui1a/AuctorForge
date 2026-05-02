import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readSkillPackArchive } from '../vsix/readSkillPackArchive';

type InitProjectOptions = {
  projectRoot: string;
  skillPackPath: string;
};

const SKILL_BASE_PATH = 'extension/assets/longformnovel/';
const README_ENTRY = `${SKILL_BASE_PATH}长篇小说技能说明书.md`;

const rootDirectoryEntries = [
  '.novelkit/constitution',
  '.novelkit/memory',
  '1-边界',
  '2-设定',
  '3-大纲',
  '4-正文',
  '5-审查',
];

const rootFileEntries: Array<{ archivePath: string; projectPath: string }> = [
  {
    archivePath: `${SKILL_BASE_PATH}docs/PROJECT.md`,
    projectPath: 'PROJECT.md',
  },
  {
    archivePath: `${SKILL_BASE_PATH}docs/TEMPLATE_CHARACTER_STATE.md`,
    projectPath: '.novelkit/memory/character_state.md',
  },
  {
    archivePath: `${SKILL_BASE_PATH}docs/TEMPLATE_FORESHADOWING.md`,
    projectPath: '.novelkit/memory/foreshadowing.md',
  },
  {
    archivePath: `${SKILL_BASE_PATH}docs/MASTER.md`,
    projectPath: '.novelkit/constitution/MASTER.md',
  },
  {
    archivePath: `${SKILL_BASE_PATH}docs/expectation_template.md`,
    projectPath: '1-边界/预期.md',
  },
  {
    archivePath: README_ENTRY,
    projectPath: '长篇小说技能说明书.md',
  },
];

const placeholderEntries: Array<{ projectPath: string; content: string }> = [
  {
    projectPath: '1-边界/1.2_文风.md',
    content: ['# 文风指南', '', '> 占位模板：待后续流程生成或覆盖。'].join('\n'),
  },
  {
    projectPath: '1-边界/1.3_套路方向.md',
    content: ['# 套路方向与核心设定', '', '> 占位模板：待后续流程生成或覆盖。'].join('\n'),
  },
  {
    projectPath: '2-设定/2.1_创意脑暴.md',
    content: ['# 创意脑暴', '', '> 占位模板：待后续流程生成或覆盖。'].join('\n'),
  },
  {
    projectPath: '2-设定/2.2_新书设定案.md',
    content: ['# 新书设定案', '', '> 占位模板：待后续流程生成或覆盖。'].join('\n'),
  },
  {
    projectPath: '2-设定/2.3_金手指设定.md',
    content: ['# 金手指设定', '', '> 占位模板：待后续流程生成或覆盖。'].join('\n'),
  },
  {
    projectPath: '2-设定/2.4_主要角色设定表.md',
    content: ['# 主要角色设定表', '', '> 占位模板：待后续流程生成或覆盖。'].join('\n'),
  },
];

export async function initProject({ projectRoot, skillPackPath }: InitProjectOptions) {
  const archive = readSkillPackArchive(skillPackPath);

  for (const relativeDirectory of rootDirectoryEntries) {
    await mkdir(path.join(projectRoot, relativeDirectory), { recursive: true });
  }

  for (const fileEntry of rootFileEntries) {
    await writeFileIfMissing(
      path.join(projectRoot, fileEntry.projectPath),
      archive.readText(fileEntry.archivePath),
    );
  }

  for (const placeholderEntry of placeholderEntries) {
    await writeFileIfMissing(
      path.join(projectRoot, placeholderEntry.projectPath),
      placeholderEntry.content,
    );
  }

  for (const entryName of archive.entries) {
    if (!entryName.startsWith(SKILL_BASE_PATH)) {
      continue;
    }

    const relativeSkillPath = entryName.slice(SKILL_BASE_PATH.length);
    const targetPath = path.join(
      projectRoot,
      '.novelflow',
      'skills',
      'longformnovel',
      relativeSkillPath,
    );

    await writeFileIfMissing(targetPath, archive.readText(entryName));
  }
}

async function writeFileIfMissing(targetPath: string, content: string) {
  if (await pathExists(targetPath)) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
