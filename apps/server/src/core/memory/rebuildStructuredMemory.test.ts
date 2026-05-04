import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { initProject } from '../files/initProject';
import { rebuildStructuredMemory } from './rebuildStructuredMemory';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

const tempDirs: string[] = [];

async function makeWorkspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-memory-'));
  tempDirs.push(directory);
  await initProject({ projectRoot: directory, skillPackPath });
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('rebuildStructuredMemory', () => {
  it('rebuilds chapter, review, entity, hook, and quality memory from project files', async () => {
    const workspaceRoot = await makeWorkspace();

    await writeFile(path.join(workspaceRoot, '4-正文', '第001章_草稿.md'), '# 第001章 待填写第001章标题\n\n时间：时间甲。\n地点：地点甲。\n角色甲把物件甲交到角色乙手里。', 'utf8');
    await writeFile(path.join(workspaceRoot, '4-正文', '第002章_草稿.md'), '# 第002章 待填写第002章标题\n\n角色甲回头。', 'utf8');
    await writeFile(
      path.join(workspaceRoot, '5-审查', '第001章_审查报告.md'),
      [
        '# 第001章 审查报告',
        '',
        '- 审查评级：REVISE',
        '',
        '## 连续性硬校验（服务端补充）',
        '- 命中类型：future-beat-leak',
        '- 修补建议：当前章提前消费后续章纲：命中第003章信号 物件甲。',
      ].join('\n'),
      'utf8',
    );
    await writeFile(path.join(workspaceRoot, '.novelkit', 'memory', 'character_state.md'), '## 主角：[姓名]\n\n- **角色甲**：当前目标。', 'utf8');
    await writeFile(path.join(workspaceRoot, '.novelkit', 'memory', 'foreshadowing.md'), '| 伏笔内容 | 埋设章节 | 预期收回 | 状态 | 备注 |\n| 物件甲 | 第1章 | 第3章 | 待收回 | |', 'utf8');
    await writeFile(path.join(workspaceRoot, '3-大纲', '第01卷_章纲.md'), '第1章：待填写第001章标题\n\n第2章：待填写第002章标题', 'utf8');

    const summary = await rebuildStructuredMemory(workspaceRoot);

    expect(summary.chapterCount).toBe(2);
    expect(summary.latestChapter).toBe(2);
    expect(summary.activeEntityCount).toBeGreaterThan(0);
    expect(summary.unresolvedHookCount).toBeGreaterThan(0);
    expect(summary.latestWarningCount).toBeGreaterThanOrEqual(0);
    expect(await readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'structured', 'chapters.jsonl'), 'utf8')).toContain('待填写第001章标题');
    expect(await readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'structured', 'quality.jsonl'), 'utf8')).toContain('future-beat-leak');
    expect(await readFile(path.join(workspaceRoot, '.novelkit', 'memory', 'structured', 'quality-report.md'), 'utf8')).toContain('第001章');
  });
});
