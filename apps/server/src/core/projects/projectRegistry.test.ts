import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveProject,
  defaultProjectRegistryStore,
  ProjectRegistryDataError,
  readProjectRegistry,
  removeProject,
  resolveProjectRegistryPath,
  setActiveProject,
  updateProjectMetadata,
  upsertProjectRegistryEntry,
  writeProjectRegistry,
} from './projectRegistry';

const tempDirs: string[] = [];

async function makeConfigDir() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-projects-'));
  tempDirs.push(directory);
  return directory;
}

async function writeRegistryContents(directory: string, content: string) {
  const filePath = resolveProjectRegistryPath(directory);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function buildRegistryEntry(directory: string, name: string, id = `proj_${name}`) {
  return {
    id,
    displayName: name,
    rootPath: path.join(directory, 'workspace', name),
    createdAt: '2026-04-04T09:00:00.000Z',
    updatedAt: '2026-04-04T09:00:00.000Z',
    lastOpenedAt: null,
    favorite: false,
    archived: false,
    missing: false,
    lastMode: null,
    lastOpenedDocument: null,
    lastKnownStepId: null,
    lastKnownSubstepId: null,
    lastKnownChapterNumber: null,
  } as const;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('projectRegistry', () => {
  it('returns null when no registry exists', async () => {
    const directory = await makeConfigDir();

    await expect(readProjectRegistry(directory)).resolves.toBeNull();
  });

  it('writes and reads the saved registry store', async () => {
    const directory = await makeConfigDir();
    const rootPath = path.join(directory, 'workspace', 'star-ocean');
    const store = {
      activeProjectId: 'proj_star_ocean',
      projects: [
        {
          id: 'proj_star_ocean',
          displayName: '星海长夜',
          rootPath,
          createdAt: '2026-04-04T10:00:00.000Z',
          updatedAt: '2026-04-04T10:00:00.000Z',
          lastOpenedAt: '2026-04-04T10:30:00.000Z',
          favorite: false,
          archived: false,
          missing: false,
          lastMode: 'create' as const,
          lastOpenedDocument: '1-边界/预期.md',
          lastKnownStepId: 'define-direction',
          lastKnownSubstepId: 'direction-define',
          lastKnownChapterNumber: 1,
        },
      ],
    };

    await writeProjectRegistry(directory, store);

    await expect(readProjectRegistry(directory)).resolves.toEqual(store);
    await expect(readFile(resolveProjectRegistryPath(directory), 'utf8')).resolves.toContain('星海长夜');
  });

  it('throws on malformed registry JSON and preserves the corrupt file', async () => {
    const directory = await makeConfigDir();
    const corruptJson = '{"activeProjectId":';

    await writeRegistryContents(directory, corruptJson);

    await expect(readProjectRegistry(directory)).rejects.toThrow(ProjectRegistryDataError);
    await expect(upsertProjectRegistryEntry(directory, buildRegistryEntry(directory, 'safe-entry'))).rejects.toThrow(ProjectRegistryDataError);
    await expect(readFile(resolveProjectRegistryPath(directory), 'utf8')).resolves.toBe(corruptJson);
  });

  it('throws when registry entries are partial or malformed', async () => {
    const directory = await makeConfigDir();

    await writeRegistryContents(
      directory,
      JSON.stringify({
        activeProjectId: null,
        projects: [
          {
            id: 'proj_broken',
            displayName: '损坏项目',
          },
        ],
      }),
    );

    await expect(readProjectRegistry(directory)).rejects.toThrow(ProjectRegistryDataError);
  });

  it('throws when activeProjectId points at a missing project', async () => {
    const directory = await makeConfigDir();

    await writeRegistryContents(
      directory,
      JSON.stringify({
        activeProjectId: 'proj_missing',
        projects: [buildRegistryEntry(directory, 'known-project', 'proj_known')],
      }),
    );

    await expect(readProjectRegistry(directory)).rejects.toThrow(ProjectRegistryDataError);
  });

  it('upserts entries by normalized rootPath instead of duplicating them', async () => {
    const directory = await makeConfigDir();
    const rootPath = path.join(directory, 'workspace', 'night-sea');

    await upsertProjectRegistryEntry(directory, {
      id: 'proj_night_sea',
      displayName: '旧名字',
      rootPath: path.join(rootPath, '..', 'night-sea'),
      createdAt: '2026-04-04T09:00:00.000Z',
      updatedAt: '2026-04-04T09:00:00.000Z',
      lastOpenedAt: null,
      favorite: false,
      archived: false,
      missing: false,
      lastMode: null,
      lastOpenedDocument: null,
      lastKnownStepId: null,
      lastKnownSubstepId: null,
      lastKnownChapterNumber: null,
    });

    await upsertProjectRegistryEntry(directory, {
      id: 'proj_night_sea',
      displayName: '新名字',
      rootPath: path.join(rootPath, '.'),
      createdAt: '2026-04-04T09:00:00.000Z',
      updatedAt: '2026-04-04T09:30:00.000Z',
      lastOpenedAt: '2026-04-04T09:35:00.000Z',
      favorite: true,
      archived: false,
      missing: false,
      lastMode: 'reference',
      lastOpenedDocument: 'PROJECT.md',
      lastKnownStepId: 'inspect-existing-draft',
      lastKnownSubstepId: 'draft-overview',
      lastKnownChapterNumber: 3,
    });

    await expect(readProjectRegistry(directory)).resolves.toEqual({
      ...defaultProjectRegistryStore(),
      projects: [
        {
          id: 'proj_night_sea',
          displayName: '新名字',
          rootPath: path.resolve(rootPath),
          createdAt: '2026-04-04T09:00:00.000Z',
          updatedAt: '2026-04-04T09:30:00.000Z',
          lastOpenedAt: '2026-04-04T09:35:00.000Z',
          favorite: true,
          archived: false,
          missing: false,
          lastMode: 'reference',
          lastOpenedDocument: 'PROJECT.md',
          lastKnownStepId: 'inspect-existing-draft',
          lastKnownSubstepId: 'draft-overview',
          lastKnownChapterNumber: 3,
        },
      ],
    });
  });

  it('rejects upserts that would introduce a duplicate project id on another path', async () => {
    const directory = await makeConfigDir();

    await writeProjectRegistry(directory, {
      ...defaultProjectRegistryStore(),
      projects: [buildRegistryEntry(directory, 'alpha', 'proj_shared')],
    });

    await expect(
      upsertProjectRegistryEntry(directory, {
        ...buildRegistryEntry(directory, 'beta', 'proj_shared'),
        displayName: 'Beta',
      }),
    ).rejects.toThrow(ProjectRegistryDataError);
  });

  it('sets the active project for an existing entry', async () => {
    const directory = await makeConfigDir();
    const rootPath = path.join(directory, 'workspace', 'moon-gate');

    await writeProjectRegistry(directory, {
      ...defaultProjectRegistryStore(),
      projects: [
        {
          id: 'proj_moon_gate',
          displayName: '月门',
          rootPath,
          createdAt: '2026-04-04T08:00:00.000Z',
          updatedAt: '2026-04-04T08:00:00.000Z',
          lastOpenedAt: null,
          favorite: false,
          archived: false,
          missing: false,
          lastMode: null,
          lastOpenedDocument: null,
          lastKnownStepId: null,
          lastKnownSubstepId: null,
          lastKnownChapterNumber: null,
        },
      ],
    });

    await setActiveProject(directory, 'proj_moon_gate');

    await expect(readProjectRegistry(directory)).resolves.toEqual({
      activeProjectId: 'proj_moon_gate',
      projects: [
        {
          id: 'proj_moon_gate',
          displayName: '月门',
          rootPath: path.resolve(rootPath),
          createdAt: '2026-04-04T08:00:00.000Z',
          updatedAt: '2026-04-04T08:00:00.000Z',
          lastOpenedAt: null,
          favorite: false,
          archived: false,
          missing: false,
          lastMode: null,
          lastOpenedDocument: null,
          lastKnownStepId: null,
          lastKnownSubstepId: null,
          lastKnownChapterNumber: null,
        },
      ],
    });
  });

  it('updates convenience metadata for an existing entry', async () => {
    const directory = await makeConfigDir();
    const rootPath = path.join(directory, 'workspace', 'sun-archive');

    await writeProjectRegistry(directory, {
      ...defaultProjectRegistryStore(),
      projects: [
        {
          id: 'proj_sun_archive',
          displayName: '旧档案',
          rootPath,
          createdAt: '2026-04-04T07:00:00.000Z',
          updatedAt: '2026-04-04T07:00:00.000Z',
          lastOpenedAt: null,
          favorite: false,
          archived: false,
          missing: false,
          lastMode: null,
          lastOpenedDocument: null,
          lastKnownStepId: null,
          lastKnownSubstepId: null,
          lastKnownChapterNumber: null,
        },
      ],
    });

    await updateProjectMetadata(directory, 'proj_sun_archive', {
      displayName: '新档案',
      favorite: true,
      missing: true,
      lastOpenedAt: '2026-04-04T07:15:00.000Z',
      lastMode: 'create',
      lastOpenedDocument: '1-边界/世界观.md',
      lastKnownStepId: 'review-outline',
      lastKnownSubstepId: 'outline-polish',
      lastKnownChapterNumber: 8,
    });

    const store = await readProjectRegistry(directory);

    expect(store).not.toBeNull();
    expect(store?.projects[0]).toMatchObject({
      id: 'proj_sun_archive',
      displayName: '新档案',
      rootPath: path.resolve(rootPath),
      createdAt: '2026-04-04T07:00:00.000Z',
      favorite: true,
      archived: false,
      missing: true,
      lastOpenedAt: '2026-04-04T07:15:00.000Z',
      lastMode: 'create',
      lastOpenedDocument: '1-边界/世界观.md',
      lastKnownStepId: 'review-outline',
      lastKnownSubstepId: 'outline-polish',
      lastKnownChapterNumber: 8,
    });
    expect(store?.projects[0].updatedAt).not.toBe('2026-04-04T07:00:00.000Z');
  });

  it('archives an active project and clears the active selection', async () => {
    const directory = await makeConfigDir();
    const rootPath = path.join(directory, 'workspace', 'storm-glass');

    await writeProjectRegistry(directory, {
      activeProjectId: 'proj_storm_glass',
      projects: [
        {
          id: 'proj_storm_glass',
          displayName: '风暴玻璃',
          rootPath,
          createdAt: '2026-04-04T06:00:00.000Z',
          updatedAt: '2026-04-04T06:00:00.000Z',
          lastOpenedAt: null,
          favorite: false,
          archived: false,
          missing: false,
          lastMode: null,
          lastOpenedDocument: null,
          lastKnownStepId: null,
          lastKnownSubstepId: null,
          lastKnownChapterNumber: null,
        },
      ],
    });

    await archiveProject(directory, 'proj_storm_glass');

    const store = await readProjectRegistry(directory);

    expect(store?.activeProjectId).toBeNull();
    expect(store?.projects[0]).toMatchObject({
      id: 'proj_storm_glass',
      archived: true,
      rootPath: path.resolve(rootPath),
    });
  });

  it('removes an active project from the registry', async () => {
    const directory = await makeConfigDir();

    await writeProjectRegistry(directory, {
      activeProjectId: 'proj_last_light',
      projects: [
        {
          id: 'proj_last_light',
          displayName: '最后之光',
          rootPath: path.join(directory, 'workspace', 'last-light'),
          createdAt: '2026-04-04T05:00:00.000Z',
          updatedAt: '2026-04-04T05:00:00.000Z',
          lastOpenedAt: null,
          favorite: false,
          archived: false,
          missing: false,
          lastMode: null,
          lastOpenedDocument: null,
          lastKnownStepId: null,
          lastKnownSubstepId: null,
          lastKnownChapterNumber: null,
        },
      ],
    });

    await removeProject(directory, 'proj_last_light');

    await expect(readProjectRegistry(directory)).resolves.toEqual(defaultProjectRegistryStore());
  });
});
