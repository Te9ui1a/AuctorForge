import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type ClassifiedAsset = {
  path: string;
  kind: 'brainstorm' | 'setting' | 'outline' | 'draft' | 'character';
  content: string;
};

const IMPORTABLE_EXTENSIONS = new Set(['.md', '.txt', '.doc', '.docx']);
const IGNORED_ROOTS = new Set([
  '.git',
  '.novelkit',
  '.novelflow',
  '1-边界',
  '2-设定',
  '3-大纲',
  '4-正文',
  '5-审查',
  'apps',
  'packages',
  'tests',
  'node_modules',
  'dist',
]);
const IGNORED_FILES = new Set(['长篇小说技能说明书.md']);

export async function scanWorkspace(projectRoot: string, relativeDir = ''): Promise<string[]> {
  const directoryPath = path.join(projectRoot, relativeDir);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    const normalizedRelativePath = relativePath.split(path.sep).join('/');
    const topLevel = normalizedRelativePath.split('/')[0];

    if (IGNORED_ROOTS.has(topLevel)) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...(await scanWorkspace(projectRoot, relativePath)));
      continue;
    }

    if (!IMPORTABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    if (/^PROJECT\.md$/i.test(entry.name) || IGNORED_FILES.has(entry.name)) {
      continue;
    }

    results.push(normalizedRelativePath);
  }

  return results.sort();
}

export async function classifyAssets(projectRoot: string, relativePaths: string[]): Promise<ClassifiedAsset[]> {
  const assets: ClassifiedAsset[] = [];

  for (const relativePath of relativePaths) {
    const extension = path.extname(relativePath).toLowerCase();
    const content = extension === '.md' || extension === '.txt'
      ? await readFile(path.join(projectRoot, relativePath), 'utf8')
      : '';
    const fileName = path.basename(relativePath);

    assets.push({
      path: relativePath,
      content,
      kind: classifyAsset(fileName, content),
    });
  }

  return assets;
}

function classifyAsset(fileName: string, content: string): ClassifiedAsset['kind'] {
  if (/章纲|卷纲|总纲|outline/.test(fileName) || /章节梗概|场景拆解/.test(content)) {
    return 'outline';
  }

  if (/第\d+章|正文|草稿|存稿|样章/.test(fileName) || /^#\s*第\d+章/m.test(content)) {
    return 'draft';
  }

  if (/人设|角色/.test(fileName) || /核心反派|关系网/.test(content)) {
    return 'character';
  }

  if (/脑暴|梗概|创意/.test(fileName) || /核心梗|题材方向/.test(content)) {
    return 'brainstorm';
  }

  return 'setting';
}
