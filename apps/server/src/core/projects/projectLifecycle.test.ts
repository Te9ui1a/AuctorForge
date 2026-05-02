import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectManifestDataError, readProjectManifest, writeProjectManifest } from './projectManifest';
import {
  createProject,
  importProject,
  openProject,
  ProjectLifecycleError,
  repairProject,
} from './projectLifecycle';
import { readProjectRegistry, writeProjectRegistry } from './projectRegistry';
import { readProjectSummary } from './projectSummary';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

const tempDirs: string[] = [];

async function makeSandbox() {
  const root = await mkdtemp(path.join(tmpdir(), 'novel-flow-project-lifecycle-'));
  tempDirs.push(root);

  const userConfigDir = path.join(root, 'config');
  const workspaceDir = path.join(root, 'workspace');

  await mkdir(workspaceDir, { recursive: true });

  return {
    root,
    userConfigDir,
    workspaceDir,
  };
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

async function expectLifecycleError(
  operation: Promise<unknown>,
  expectedCode:
    | 'not-found'
    | 'missing-path'
    | 'unhealthy'
    | 'init-failed'
    | 'manifest-conflict',
) {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectLifecycleError);
    expect((error as ProjectLifecycleError).code).toBe(expectedCode);
    return error as ProjectLifecycleError;
  }

  throw new Error(`Expected ProjectLifecycleError with code ${expectedCode}.`);
}

describe('projectLifecycle', () => {
  it('creates a project, writes the manifest, and marks it active only after the scaffold is healthy', async () => {
    const sandbox = await makeSandbox();
    const projectRoot = path.join(sandbox.workspaceDir, 'star-ocean');

    const result = await createProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: projectRoot,
      displayName: '星海长夜',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_star_ocean',
    });

    expect(result.store.activeProjectId).toBe('proj_star_ocean');
    expect(result.entry).toMatchObject({
      id: 'proj_star_ocean',
      displayName: '星海长夜',
      rootPath: path.resolve(projectRoot),
      archived: false,
      missing: false,
      lastMode: 'create',
      lastOpenedAt: '2026-04-04T10:00:00.000Z',
    });
    expect(result.summary.status).toBe('ready');

    await expect(readProjectManifest(projectRoot)).resolves.toMatchObject({
      projectId: 'proj_star_ocean',
      displayName: '星海长夜',
      entryMode: 'create',
      scaffoldVersion: '1',
      vsixVersion: '0.1.5',
    });
    await expect(readFile(path.join(projectRoot, 'PROJECT.md'), 'utf8')).resolves.toContain(
      '# PROJECT.md — 项目控制面板',
    );
  });

  it('reuses the existing registry entry when importing the same rootPath again', async () => {
    const sandbox = await makeSandbox();
    const projectRoot = path.join(sandbox.workspaceDir, 'mirror-city');

    await createProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: projectRoot,
      displayName: '镜城',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_mirror_city',
    });

    const result = await importProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: path.join(projectRoot, '.'),
      displayName: '镜城（重新导入）',
      entryMode: 'reference',
      skillPackPath,
      now: () => '2026-04-04T11:00:00.000Z',
      createProjectId: () => 'proj_unused',
    });

    expect(result.store.activeProjectId).toBe('proj_mirror_city');
    expect(result.entry).toMatchObject({
      id: 'proj_mirror_city',
      displayName: '镜城（重新导入）',
      lastMode: 'reference',
      lastOpenedAt: '2026-04-04T11:00:00.000Z',
    });
    expect(result.store.projects).toHaveLength(1);
  });

  it('opens an existing healthy project and keeps a single active project selection', async () => {
    const sandbox = await makeSandbox();
    const alphaRoot = path.join(sandbox.workspaceDir, 'alpha');
    const betaRoot = path.join(sandbox.workspaceDir, 'beta');

    await createProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: alphaRoot,
      displayName: 'Alpha',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T09:00:00.000Z',
      createProjectId: () => 'proj_alpha',
    });
    await createProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: betaRoot,
      displayName: 'Beta',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T09:30:00.000Z',
      createProjectId: () => 'proj_beta',
    });

    const result = await openProject({
      userConfigDir: sandbox.userConfigDir,
      projectId: 'proj_alpha',
      entryMode: 'reference',
      now: () => '2026-04-04T12:00:00.000Z',
    });

    expect(result.store.activeProjectId).toBe('proj_alpha');
    expect(result.entry).toMatchObject({
      id: 'proj_alpha',
      lastMode: 'reference',
      lastOpenedAt: '2026-04-04T12:00:00.000Z',
    });
    expect(result.summary.status).toBe('ready');
  });

  it('uses a not-found error code when opening an unknown project id', async () => {
    const sandbox = await makeSandbox();

    await expectLifecycleError(
      openProject({
        userConfigDir: sandbox.userConfigDir,
        projectId: 'proj_missing',
        entryMode: 'reference',
        now: () => '2026-04-04T12:30:00.000Z',
      }),
      'not-found',
    );
  });

  it('does not mark a partially created project active when scaffold initialization fails', async () => {
    const sandbox = await makeSandbox();
    const projectRoot = path.join(sandbox.workspaceDir, 'broken-create');

    await expectLifecycleError(
      createProject({
        userConfigDir: sandbox.userConfigDir,
        rootPath: projectRoot,
        displayName: '损坏创建',
        entryMode: 'create',
        skillPackPath: path.join(sandbox.root, 'missing-skill-pack'),
        now: () => '2026-04-04T13:00:00.000Z',
        createProjectId: () => 'proj_broken_create',
      }),
      'init-failed',
    );

    const store = await readProjectRegistry(sandbox.userConfigDir);

    expect(store).not.toBeNull();
    expect(store?.activeProjectId).toBeNull();
    expect(store?.projects).toHaveLength(1);
    await expect(
      readProjectSummary({
        rootPath: projectRoot,
        registryEntry: store?.projects[0] ?? null,
      }),
    ).resolves.toMatchObject({
      status: 'needs-repair',
      projectId: 'proj_broken_create',
    });
  });

  it('uses a missing-path error code when opening a registered project whose folder is gone', async () => {
    const sandbox = await makeSandbox();
    const projectRoot = path.join(sandbox.workspaceDir, 'moved-away');

    await createProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: projectRoot,
      displayName: '迁移项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T13:30:00.000Z',
      createProjectId: () => 'proj_moved_away',
    });
    await rm(projectRoot, { recursive: true, force: true });

    await expectLifecycleError(
      openProject({
        userConfigDir: sandbox.userConfigDir,
        projectId: 'proj_moved_away',
        entryMode: 'reference',
        now: () => '2026-04-04T13:45:00.000Z',
      }),
      'missing-path',
    );

    await expect(readProjectRegistry(sandbox.userConfigDir)).resolves.toMatchObject({
      activeProjectId: 'proj_moved_away',
      projects: [expect.objectContaining({ id: 'proj_moved_away', missing: true })],
    });
  });

  it('refuses to open a broken project and preserves the current active project', async () => {
    const sandbox = await makeSandbox();
    const healthyRoot = path.join(sandbox.workspaceDir, 'healthy');
    const brokenRoot = path.join(sandbox.workspaceDir, 'broken');

    await createProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: healthyRoot,
      displayName: '健康项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T10:00:00.000Z',
      createProjectId: () => 'proj_healthy',
    });

    await mkdir(brokenRoot, { recursive: true });
    await writeProjectRegistry(sandbox.userConfigDir, {
      activeProjectId: 'proj_healthy',
      projects: [
        (await readProjectRegistry(sandbox.userConfigDir))?.projects[0] ?? buildRegistryEntry(healthyRoot),
        buildRegistryEntry(brokenRoot, {
          id: 'proj_broken',
          displayName: '损坏项目',
          updatedAt: '2026-04-04T10:30:00.000Z',
        }),
      ],
    });

    await expectLifecycleError(
      openProject({
        userConfigDir: sandbox.userConfigDir,
        projectId: 'proj_broken',
        entryMode: 'reference',
        now: () => '2026-04-04T14:00:00.000Z',
      }),
      'unhealthy',
    );

    await expect(readProjectRegistry(sandbox.userConfigDir)).resolves.toMatchObject({
      activeProjectId: 'proj_healthy',
    });
  });

  it('uses a manifest-conflict error code when an imported manifest projectId already belongs to another path', async () => {
    const sandbox = await makeSandbox();
    const registeredRoot = path.join(sandbox.workspaceDir, 'registered');
    const conflictingRoot = path.join(sandbox.workspaceDir, 'conflicting-copy');

    await createProject({
      userConfigDir: sandbox.userConfigDir,
      rootPath: registeredRoot,
      displayName: '原始项目',
      entryMode: 'create',
      skillPackPath,
      now: () => '2026-04-04T14:10:00.000Z',
      createProjectId: () => 'proj_original',
    });

    await mkdir(conflictingRoot, { recursive: true });
    await writeProjectManifest(conflictingRoot, {
      projectId: 'proj_original',
      displayName: '冲突副本',
      createdAt: '2026-04-04T14:20:00.000Z',
      scaffoldVersion: '1',
      vsixVersion: '0.1.5',
      entryMode: 'reference',
    });

    await expectLifecycleError(
      importProject({
        userConfigDir: sandbox.userConfigDir,
        rootPath: conflictingRoot,
        displayName: '冲突副本',
        entryMode: 'reference',
        skillPackPath,
        now: () => '2026-04-04T14:30:00.000Z',
      }),
      'manifest-conflict',
    );
  });

  it('keeps corrupt manifest errors visible instead of treating them like a missing manifest', async () => {
    const sandbox = await makeSandbox();
    const projectRoot = path.join(sandbox.workspaceDir, 'corrupt-manifest');

    await mkdir(path.join(projectRoot, '.novelflow'), { recursive: true });
    await writeFile(path.join(projectRoot, '.novelflow', 'project.json'), '{"projectId":', 'utf8');

    const error = await expectLifecycleError(
      importProject({
        userConfigDir: sandbox.userConfigDir,
        rootPath: projectRoot,
        entryMode: 'reference',
        skillPackPath,
        now: () => '2026-04-04T14:40:00.000Z',
      }),
      'manifest-conflict',
    );

    expect(error.cause).toBeInstanceOf(ProjectManifestDataError);
  });

  it('repairs a known project without overwriting existing PROJECT.md and then marks it active', async () => {
    const sandbox = await makeSandbox();
    const projectRoot = path.join(sandbox.workspaceDir, 'repair-me');
    const registryEntry = buildRegistryEntry(projectRoot, {
      id: 'proj_repair_me',
      displayName: '待修复项目',
    });
    const customProject = '# custom project';

    await mkdir(projectRoot, { recursive: true });
    await writeFile(path.join(projectRoot, 'PROJECT.md'), customProject, 'utf8');
    await writeProjectRegistry(sandbox.userConfigDir, {
      activeProjectId: null,
      projects: [registryEntry],
    });

    const result = await repairProject({
      userConfigDir: sandbox.userConfigDir,
      projectId: 'proj_repair_me',
      entryMode: 'reference',
      skillPackPath,
      now: () => '2026-04-04T15:00:00.000Z',
    });

    expect(result.store.activeProjectId).toBe('proj_repair_me');
    expect(result.summary.status).toBe('ready');
    await expect(readFile(path.join(projectRoot, 'PROJECT.md'), 'utf8')).resolves.toBe(customProject);
    await expect(readProjectManifest(projectRoot)).resolves.toMatchObject({
      projectId: 'proj_repair_me',
      displayName: '待修复项目',
      entryMode: 'reference',
    });
  });
});
