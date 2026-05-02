import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from './initProject';
import { syncWorkflowFiles } from './syncWorkflowFiles';

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

describe('syncWorkflowFiles', () => {
  it('replaces the style-guide pointer during define-direction sync', async () => {
    const workspaceRoot = await makeWorkspace();

    await syncWorkflowFiles({
      projectRoot: workspaceRoot,
      stepId: 'define-direction',
      volumeNumber: 1,
      chapterNumber: 1,
    });

    const project = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');

    expect(project).toContain('## 5. 风格指南（文风参考）');
    expect(project).toContain('-> 1-边界/1.2_文风.md');
  });

  it('updates write-chapter focus and appends synced memory notes', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '4-正文', '第001章_草稿.md'), '# 第001章\n\n正文草稿', 'utf8');

    await syncWorkflowFiles({
      projectRoot: workspaceRoot,
      stepId: 'write-chapter',
      volumeNumber: 1,
      chapterNumber: 1,
    });

    const project = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const characterMemory = await readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'character_state.md'), 'utf8');
    const foreshadowingMemory = await readFile(
      path.join(workspaceRoot, '.novelkit', 'memory', 'foreshadowing.md'),
      'utf8',
    );

    expect(project).toContain('- **核心任务**：完成第001章草稿并准备下一章');
    expect(project).toContain('  - [x] 第001章草稿');
    expect(characterMemory).toContain('## 自动同步记录');
    expect(characterMemory).toContain('- 最近完成章节：第001章');
    expect(foreshadowingMemory).toContain('- 第001章草稿已完成，待后续补录伏笔。');
  });

  it('stops suggesting a non-existent next chapter at the final chapter pause', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(
      path.join(workspaceRoot, '3-大纲', '第01卷_章纲.md'),
      [
        '第1章：夹缝求生',
        '',
        '**章节梗概**：首章求生。',
        '',
        '第2章：借势藏锋',
        '',
        '**章节梗概**：第二章收束本卷。',
      ].join('\n'),
      'utf8',
    );
    await writeFile(path.join(workspaceRoot, '4-正文', '第002章_草稿.md'), '# 第002章 借势藏锋\n\n正文草稿', 'utf8');
    await writeFile(path.join(workspaceRoot, '5-审查', '第002章_审查报告.md'), '# 第002章 审查报告\n\n通过', 'utf8');

    await syncWorkflowFiles({
      projectRoot: workspaceRoot,
      stepId: 'write-chapter',
      substepId: 'chapter-pause',
      volumeNumber: 1,
      chapterNumber: 2,
    });

    const project = await readFile(path.join(workspaceRoot, 'PROJECT.md'), 'utf8');
    const foreshadowingMemory = await readFile(
      path.join(workspaceRoot, '.novelkit', 'memory', 'foreshadowing.md'),
      'utf8',
    );

    expect(project).toContain('- **核心任务**：当前卷章稿已完成，进入终章修订或总体验收');
    expect(project).toContain('  - [ ] 终章修订');
    expect(project).toContain('  - [ ] 总体验收');
    expect(project).toContain('  - [ ] 结束本卷');
    expect(project).not.toContain('第003章草稿');
    expect(foreshadowingMemory).toContain('当前卷章稿已完成');
  });
});
