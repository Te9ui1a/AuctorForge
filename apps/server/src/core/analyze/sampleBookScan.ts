import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { ANALYZE_SELECTION_PATH } from '../paths/projectPaths';

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

export type SampleBookContext = {
  sampleBookPath: string | null;
  sampleBookPaths: string[];
  sampleText: string;
  previewLines: string[];
  chapterHeads: string[];
};

export async function readSampleBookContext(projectRoot: string): Promise<SampleBookContext> {
  const sampleBookPaths = await locateSampleBooks(projectRoot);
  const selection = await readSelectedSampleBook(projectRoot);
  const sampleBookPath = selection && sampleBookPaths.includes(selection)
    ? selection
    : sampleBookPaths[0] ?? null;
  const sampleText = sampleBookPath ? await readFile(path.join(projectRoot, sampleBookPath), 'utf8') : '';
  const previewLines = sampleText.split(/\n+/).filter(Boolean).slice(0, 12);
  const chapterHeads = sampleText
    .split(/\n+/)
    .filter((line) => /第[一二三四五六七八九十\d]+章|^第\d+章|^第一章|^第二章|^第三章/.test(line));

  return {
    sampleBookPath,
    sampleBookPaths,
    sampleText,
    previewLines,
    chapterHeads,
  };
}

async function locateSampleBooks(projectRoot: string) {
  const rootEntries = await readdir(projectRoot, { withFileTypes: true });
  const rootTxt = rootEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        path.extname(entry.name).toLowerCase() === '.txt' &&
        !IGNORED_ROOTS.has(entry.name),
    )
    .map((entry) => entry.name);

  const boundaryDir = path.join(projectRoot, '1-边界');
  let boundaryTxt: string[] = [];
  try {
    const boundaryEntries = await readdir(boundaryDir, { withFileTypes: true });
    boundaryTxt = boundaryEntries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.txt')
      .map((entry) => `1-边界/${entry.name}`);
  } catch {
    boundaryTxt = [];
  }

  return [...rootTxt, ...boundaryTxt].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

async function readSelectedSampleBook(projectRoot: string) {
  try {
    const content = await readFile(path.join(projectRoot, ANALYZE_SELECTION_PATH), 'utf8');
    const parsed = JSON.parse(content) as { sampleBookPath?: string };
    return parsed.sampleBookPath ?? null;
  } catch {
    return null;
  }
}
