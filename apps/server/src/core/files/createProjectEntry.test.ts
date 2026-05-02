import { access, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createProjectFile, createProjectFolder, ProjectEntryNameError } from './createProjectEntry';

const tempDirs: string[] = [];

async function makeProjectRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-project-entry-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('createProjectEntry', () => {
  it.each(['', '.', '..', 'nested/file.md', 'nested\\file.md'])(
    'rejects invalid file name %j as a single basename',
    async (name) => {
      const root = await makeProjectRoot();

      await expect(createProjectFile(root, '', name)).rejects.toBeInstanceOf(ProjectEntryNameError);
      await expect(createProjectFile(root, '', name)).rejects.toThrow(/single file or folder name/i);
    },
  );

  it.each(['', '.', '..', 'nested/folder', 'nested\\folder'])(
    'rejects invalid folder name %j as a single basename',
    async (name) => {
      const root = await makeProjectRoot();

      await expect(createProjectFolder(root, '', name)).rejects.toBeInstanceOf(ProjectEntryNameError);
      await expect(createProjectFolder(root, '', name)).rejects.toThrow(/single file or folder name/i);
    },
  );

  it('creates files and folders for valid basenames', async () => {
    const root = await makeProjectRoot();

    await expect(createProjectFolder(root, '', '设定资料')).resolves.toEqual({ path: '设定资料' });
    await expect(createProjectFile(root, '设定资料', '角色资料.md')).resolves.toEqual({ path: '设定资料/角色资料.md' });
  });

  it('rejects file and folder creation through symlinked parent directories', async () => {
    const root = await makeProjectRoot();
    const outsideRoot = await makeProjectRoot();
    await symlink(outsideRoot, path.join(root, 'linked-outside'), 'dir');

    await expect(createProjectFolder(root, 'linked-outside', '角色资料')).rejects.toBeInstanceOf(ProjectEntryNameError);
    await expect(createProjectFile(root, 'linked-outside', '角色资料.md')).rejects.toBeInstanceOf(ProjectEntryNameError);
    await expect(access(path.join(outsideRoot, '角色资料'))).rejects.toThrow();
    await expect(access(path.join(outsideRoot, '角色资料.md'))).rejects.toThrow();
  });
});
