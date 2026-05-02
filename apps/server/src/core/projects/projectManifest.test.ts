import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectManifestDataError, readProjectManifest, resolveProjectManifestPath, writeProjectManifest } from './projectManifest';

const tempDirs: string[] = [];

async function makeProjectRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-manifest-'));
  tempDirs.push(directory);
  return directory;
}

async function writeManifestContents(projectRoot: string, content: string) {
  const filePath = resolveProjectManifestPath(projectRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('projectManifest', () => {
  it('returns null when no manifest exists', async () => {
    const projectRoot = await makeProjectRoot();

    await expect(readProjectManifest(projectRoot)).resolves.toBeNull();
  });

  it('writes and reads stable project identity metadata from .novelflow/project.json', async () => {
    const projectRoot = await makeProjectRoot();
    const manifest = {
      projectId: 'proj_star_ocean',
      displayName: '星海长夜',
      createdAt: '2026-04-04T10:00:00.000Z',
      scaffoldVersion: '1',
      vsixVersion: '0.1.5',
      entryMode: 'create' as const,
    };

    await writeProjectManifest(projectRoot, manifest);

    await expect(readProjectManifest(projectRoot)).resolves.toEqual(manifest);
    await expect(readFile(resolveProjectManifestPath(projectRoot), 'utf8')).resolves.toContain('proj_star_ocean');
  });

  it('throws when manifest JSON is malformed', async () => {
    const projectRoot = await makeProjectRoot();

    await writeManifestContents(projectRoot, '{"projectId":');

    await expect(readProjectManifest(projectRoot)).rejects.toThrow(ProjectManifestDataError);
  });

  it('throws when manifest data is partial or invalid', async () => {
    const projectRoot = await makeProjectRoot();

    await writeManifestContents(
      projectRoot,
      JSON.stringify({
        projectId: 'proj_star_ocean',
        displayName: '星海长夜',
        createdAt: '2026-04-04T10:00:00.000Z',
        scaffoldVersion: '1',
        vsixVersion: '0.1.5',
        entryMode: 'draft',
      }),
    );

    await expect(readProjectManifest(projectRoot)).rejects.toThrow(ProjectManifestDataError);
  });
});
