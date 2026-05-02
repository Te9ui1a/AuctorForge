import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { readProjectFile, writeWorkflowFile } from './fileGateway';
import { initProject } from './initProject';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

const tempDirs: string[] = [];

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-webui-'));
  tempDirs.push(directory);
  await initProject({ projectRoot: directory, skillPackPath });
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('writeWorkflowFile', () => {
  it('writes a file when the normalized path is allowed for the current step', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeWorkflowFile({
      projectRoot: workspaceRoot,
      relativePath: 'docs/MASTER.md',
      content: '# updated constitution',
      allowedWrites: ['.novelkit/constitution/MASTER.md'],
    });

    await expect(
      readFile(path.join(workspaceRoot, '.novelkit', 'constitution', 'MASTER.md'), 'utf8'),
    ).resolves.toBe('# updated constitution');
    await expect(readProjectFile(workspaceRoot, 'docs/MASTER.md')).resolves.toBe('# updated constitution');
  });

  it('rejects writes outside the current workflow allowance', async () => {
    const workspaceRoot = await makeWorkspace();

    await expect(
      writeWorkflowFile({
        projectRoot: workspaceRoot,
        relativePath: '4-正文/第001章_草稿.md',
        content: '# draft',
        allowedWrites: ['2-设定/2.2_新书设定案.md'],
      }),
    ).rejects.toThrow('Write is not allowed');
  });

  it('rejects reads that escape the workspace root', async () => {
    const workspaceRoot = await makeWorkspace();

    await expect(readProjectFile(workspaceRoot, '../../etc/passwd')).rejects.toThrow(
      'Resolved path escapes project root',
    );
  });

  it('rejects reads through symlinks that escape the project root', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'novel-flow-webui-'));
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'novel-flow-outside-'));
    tempDirs.push(workspaceRoot, outsideRoot);

    await mkdir(path.join(workspaceRoot, '1-边界'), { recursive: true });
    await writeFile(path.join(outsideRoot, 'secret.md'), 'outside secret', 'utf8');
    await symlink(path.join(outsideRoot, 'secret.md'), path.join(workspaceRoot, '1-边界', '预期.md'));

    await expect(readProjectFile(workspaceRoot, '1-边界/预期.md')).rejects.toThrow(
      /escapes project root|symlink/i,
    );
  });

  it('rejects writes through symlinked workflow targets', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'novel-flow-webui-'));
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'novel-flow-outside-'));
    tempDirs.push(workspaceRoot, outsideRoot);

    await mkdir(path.join(workspaceRoot, '1-边界'), { recursive: true });
    await writeFile(path.join(outsideRoot, 'target.md'), 'before', 'utf8');
    await symlink(path.join(outsideRoot, 'target.md'), path.join(workspaceRoot, '1-边界', '预期.md'));

    await expect(
      writeWorkflowFile({
        projectRoot: workspaceRoot,
        relativePath: '1-边界/预期.md',
        content: 'after',
        allowedWrites: ['1-边界/预期.md'],
      }),
    ).rejects.toThrow(/symlink/i);

    await expect(readFile(path.join(outsideRoot, 'target.md'), 'utf8')).resolves.toBe('before');
  });

  it('rejects writes through symlinked parent directories before creating outside directories', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'novel-flow-webui-'));
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'novel-flow-outside-'));
    tempDirs.push(workspaceRoot, outsideRoot);

    await symlink(outsideRoot, path.join(workspaceRoot, '2-设定'));

    await expect(
      writeWorkflowFile({
        projectRoot: workspaceRoot,
        relativePath: '2-设定/角色资料/配角.md',
        content: 'after',
        allowedWrites: ['2-设定/角色资料/配角.md'],
      }),
    ).rejects.toThrow(/symlink|escapes project root/i);

    await expect(access(path.join(outsideRoot, '角色资料'))).rejects.toThrow();
  });
});
