import { describe, expect, it } from 'vitest';

import { extractChapterMemory } from './chapterMemoryExtractor';

const draftContent = [
  '# 第001章 待填写第001章标题',
  '',
  '时间：时间甲。',
  '地点：地点甲。',
  '角色甲在场景甲里接到一封信，随后把物件甲交到角色甲手里。',
  '角色甲与角色乙对视后转身离开。',
  '',
  '## 角色表',
  '- 角色甲',
  '- 角色乙',
].join('\n');

describe('chapterMemoryExtractor', () => {
  it('extracts chapter, entity, hook, and quality memory from chapter files', () => {
    const result = extractChapterMemory({
      chapterNumber: 1,
      draftContent,
      reviewContent: '# 第001章 审查报告\n\n- 审查评级：REVISE\n\n## 连续性检查\n- 需要回收伏笔。',
      characterStateContent: '## 主角：[姓名]\n\n- **角色甲**：当前目标。',
      foreshadowingContent: ['| 伏笔内容 | 埋设章节 | 预期收回 | 状态 | 备注 |', '| 物件甲 | 第1章 | 第3章 | 待收回 | |'].join('\n'),
      chapterOutlineContent: '第1章：待填写第001章标题\n\n第2章：待填写第002章标题',
    });

    expect(result.chapter.chapterNumber).toBe(1);
    expect(result.chapter.title).toBe('待填写第001章标题');
    expect(result.chapter.summary).toContain('角色甲在场景甲里接到一封信');
    expect(result.chapter.time).toBe('时间甲。');
    expect(result.chapter.location).toBe('地点甲。');
    expect(result.chapter.activeCharacters).toEqual(expect.arrayContaining(['角色甲', '角色乙']));
    expect(result.chapter.objects[0]).toMatchObject({ name: '物件甲', owner: '角色甲', state: '转移中' });
    expect(result.chapter.hooksOpened.length).toBeGreaterThan(0);
    expect(result.chapter.facts.length).toBeGreaterThan(0);
    expect(result.entities.some((entity) => entity.id === 'character:角色甲')).toBe(true);
    expect(result.quality?.reviewGate).toBe('revise');
    expect(result.quality?.narrativeChars).toBeGreaterThan(0);
  });
});

