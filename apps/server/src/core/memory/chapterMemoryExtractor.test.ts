import { describe, expect, it } from 'vitest';

import { extractChapterMemory } from './chapterMemoryExtractor';

const draftContent = [
  '# 第001章 夜雨来信',
  '',
  '时间：子时。',
  '地点：城南旧巷。',
  '林照在夜雨里接到一封信，随后把账册交到林照手里。',
  '林照与阿七对视后转身离开。',
  '',
  '## 角色表',
  '- 林照',
  '- 阿七',
].join('\n');

describe('chapterMemoryExtractor', () => {
  it('extracts chapter, entity, hook, and quality memory from chapter files', () => {
    const result = extractChapterMemory({
      chapterNumber: 1,
      draftContent,
      reviewContent: '# 第001章 审查报告\n\n- 审查评级：REVISE\n\n## 连续性检查\n- 需要回收伏笔。',
      characterStateContent: '## 主角：[姓名]\n\n- **林照**：当前目标。',
      foreshadowingContent: ['| 伏笔内容 | 埋设章节 | 预期收回 | 状态 | 备注 |', '| 账册 | 第1章 | 第3章 | 待收回 | |'].join('\n'),
      chapterOutlineContent: '第1章：夜雨来信\n\n第2章：夜雨之后',
    });

    expect(result.chapter.chapterNumber).toBe(1);
    expect(result.chapter.title).toBe('夜雨来信');
    expect(result.chapter.summary).toContain('林照在夜雨里接到一封信');
    expect(result.chapter.time).toBe('子时。');
    expect(result.chapter.location).toBe('城南旧巷。');
    expect(result.chapter.activeCharacters).toEqual(expect.arrayContaining(['林照', '阿七']));
    expect(result.chapter.objects[0]).toMatchObject({ name: '账册', owner: '林照', state: '转移中' });
    expect(result.chapter.hooksOpened.length).toBeGreaterThan(0);
    expect(result.chapter.facts.length).toBeGreaterThan(0);
    expect(result.entities.some((entity) => entity.id === 'character:林照')).toBe(true);
    expect(result.quality?.reviewGate).toBe('revise');
    expect(result.quality?.narrativeChars).toBeGreaterThan(0);
  });
});

