import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listProjectFiles } from './listProjectFiles';

const tempDirs: string[] = [];

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-tree-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('listProjectFiles', () => {
  it('returns grouped project files for the workbench tree', async () => {
    const workspaceRoot = await makeWorkspace();

    await mkdir(path.join(workspaceRoot, '1-边界'), { recursive: true });
    await mkdir(path.join(workspaceRoot, '2-设定'), { recursive: true });
    await mkdir(path.join(workspaceRoot, '.novelkit', 'memory'), { recursive: true });
    await writeFile(path.join(workspaceRoot, 'PROJECT.md'), '# PROJECT', 'utf8');

    await writeFile(path.join(workspaceRoot, '1-边界', '1.2_文风.md'), '# 文风', 'utf8');
    await writeFile(path.join(workspaceRoot, '2-设定', '2.2_新书设定案.md'), '# 设定', 'utf8');
    await writeFile(path.join(workspaceRoot, '.novelkit', 'memory', 'character_state.md'), '# memory', 'utf8');

    const tree = await listProjectFiles(workspaceRoot);

    expect(tree.rootFiles).toEqual([{ path: 'PROJECT.md', label: 'PROJECT.md' }]);
    expect(tree.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '1-边界',
          files: [expect.objectContaining({ path: '1-边界/1.2_文风.md' })],
        }),
        expect.objectContaining({
          title: '2-设定',
          files: [expect.objectContaining({ path: '2-设定/2.2_新书设定案.md' })],
        }),
        expect.objectContaining({
          title: '.novelkit',
          files: [expect.objectContaining({ path: '.novelkit/memory/character_state.md' })],
        }),
      ]),
    );
  });

  it('keeps standard folders visible even when they are empty', async () => {
    const workspaceRoot = await makeWorkspace();

    await mkdir(path.join(workspaceRoot, '2-设定'), { recursive: true });
    await mkdir(path.join(workspaceRoot, '3-大纲'), { recursive: true });
    await mkdir(path.join(workspaceRoot, '4-正文'), { recursive: true });
    await mkdir(path.join(workspaceRoot, '5-审查'), { recursive: true });

    const tree = await listProjectFiles(workspaceRoot);

    expect(tree.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '2-设定', files: [] }),
        expect.objectContaining({ title: '3-大纲', files: [] }),
        expect.objectContaining({ title: '4-正文', files: [] }),
        expect.objectContaining({ title: '5-审查', files: [] }),
      ]),
    );
    expect(tree.groups.map((group) => group.title)).toEqual([
      '.novelkit',
      '1-边界',
      '2-设定',
      '3-大纲',
      '4-正文',
      '5-审查',
    ]);
  });

  it('includes empty nested folders so newly created folders appear in the workbench tree', async () => {
    const workspaceRoot = await makeWorkspace();

    await mkdir(path.join(workspaceRoot, '1-边界', '角色资料'), { recursive: true });

    const tree = await listProjectFiles(workspaceRoot);

    expect(tree.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '1-边界',
          files: [
            {
              path: '1-边界/角色资料',
              label: '角色资料',
              type: 'folder',
            },
          ],
        }),
      ]),
    );
  });
});
