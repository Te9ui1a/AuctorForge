import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writeProjectManifest } from './projectManifest';
import { readProjectSummary } from './projectSummary';

const tempDirs: string[] = [];

const projectContent = [
  '# PROJECT.md — 项目控制面板',
  '',
  '### 8.1 当前重点与后续步骤',
  '- **阶段**：正文写作',
  '- **核心任务**：撰写第3章',
  '- **待办事项**：',
  '  - [x] 完成第2章审校',
  '  - [ ] 撰写第3章',
].join('\n');

async function makeProjectRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-project-summary-'));
  tempDirs.push(directory);
  return directory;
}

function buildRegistryEntry(projectRoot: string, overrides: Partial<{
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  favorite: boolean;
  archived: boolean;
  missing: boolean;
  lastMode: 'create' | 'reference' | null;
  lastOpenedDocument: string | null;
  lastKnownStepId: string | null;
  lastKnownSubstepId: string | null;
  lastKnownChapterNumber: number | null;
}> = {}) {
  return {
    id: overrides.id ?? 'proj_star_ocean',
    displayName: overrides.displayName ?? '星海长夜',
    rootPath: projectRoot,
    createdAt: overrides.createdAt ?? '2026-04-04T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-04T10:00:00.000Z',
    lastOpenedAt: overrides.lastOpenedAt ?? null,
    favorite: overrides.favorite ?? false,
    archived: overrides.archived ?? false,
    missing: overrides.missing ?? false,
    lastMode: overrides.lastMode ?? null,
    lastOpenedDocument: overrides.lastOpenedDocument ?? null,
    lastKnownStepId: overrides.lastKnownStepId ?? null,
    lastKnownSubstepId: overrides.lastKnownSubstepId ?? null,
    lastKnownChapterNumber: overrides.lastKnownChapterNumber ?? null,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('projectSummary', () => {
  it('uses PROJECT.md as the source of truth for progress summary while keeping registry chapter hints', async () => {
    const projectRoot = await makeProjectRoot();
    const registryEntry = buildRegistryEntry(projectRoot, {
      displayName: '缓存名字',
      lastOpenedAt: '2026-04-04T11:00:00.000Z',
      lastOpenedDocument: '4-正文/第2章.md',
      lastKnownStepId: 'outdated-cache-step',
      lastKnownSubstepId: 'outdated-cache-substep',
      lastKnownChapterNumber: 7,
    });

    await writeProjectManifest(projectRoot, {
      projectId: registryEntry.id,
      displayName: '清单名字',
      createdAt: registryEntry.createdAt,
      scaffoldVersion: '1',
      vsixVersion: '0.1.5',
      entryMode: 'create',
    });
    await writeFile(path.join(projectRoot, 'PROJECT.md'), projectContent, 'utf8');

    await expect(readProjectSummary({ rootPath: projectRoot, registryEntry })).resolves.toMatchObject({
      projectId: 'proj_star_ocean',
      displayName: '缓存名字',
      rootPath: path.resolve(projectRoot),
      status: 'ready',
      phase: '正文写作',
      coreTask: '撰写第3章',
      nextSuggestion: '撰写第3章',
      currentChapterNumber: 7,
      lastOpenedAt: '2026-04-04T11:00:00.000Z',
      lastOpenedDocument: '4-正文/第2章.md',
    });
  });

  it('returns missing-path before archived when the registry target no longer exists', async () => {
    const projectRoot = path.join(await makeProjectRoot(), 'missing-project');

    await expect(
      readProjectSummary({
        rootPath: projectRoot,
        registryEntry: buildRegistryEntry(projectRoot, { archived: true, missing: false }),
      }),
    ).resolves.toMatchObject({
      status: 'missing-path',
      rootPath: path.resolve(projectRoot),
    });
  });

  it('returns needs-repair before archived when a known project is missing PROJECT.md', async () => {
    const projectRoot = await makeProjectRoot();
    const registryEntry = buildRegistryEntry(projectRoot, { archived: true });

    await writeProjectManifest(projectRoot, {
      projectId: registryEntry.id,
      displayName: registryEntry.displayName,
      createdAt: registryEntry.createdAt,
      scaffoldVersion: '1',
      vsixVersion: '0.1.5',
      entryMode: 'reference',
    });

    await expect(readProjectSummary({ rootPath: projectRoot, registryEntry })).resolves.toMatchObject({
      status: 'needs-repair',
      phase: null,
      coreTask: null,
      nextSuggestion: null,
    });
  });

  it('returns archived for a healthy archived project after higher-priority checks pass', async () => {
    const projectRoot = await makeProjectRoot();
    const registryEntry = buildRegistryEntry(projectRoot, { archived: true });

    await writeProjectManifest(projectRoot, {
      projectId: registryEntry.id,
      displayName: registryEntry.displayName,
      createdAt: registryEntry.createdAt,
      scaffoldVersion: '1',
      vsixVersion: '0.1.5',
      entryMode: 'create',
    });
    await writeFile(path.join(projectRoot, 'PROJECT.md'), projectContent, 'utf8');

    await expect(readProjectSummary({ rootPath: projectRoot, registryEntry })).resolves.toMatchObject({
      status: 'archived',
    });
  });

  it('returns uninitialized for an existing folder that has not been scaffolded yet', async () => {
    const projectRoot = await makeProjectRoot();

    await mkdir(path.join(projectRoot, 'drafts'), { recursive: true });
    await writeFile(path.join(projectRoot, 'drafts', 'outline.txt'), '普通目录', 'utf8');

    await expect(readProjectSummary({ rootPath: projectRoot })).resolves.toMatchObject({
      projectId: null,
      displayName: path.basename(projectRoot),
      rootPath: path.resolve(projectRoot),
      status: 'uninitialized',
      phase: null,
      coreTask: null,
      nextSuggestion: null,
      currentChapterNumber: null,
    });
  });
});
