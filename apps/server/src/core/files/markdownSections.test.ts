import { describe, expect, it } from 'vitest';

import { replaceSubsection, replaceTopLevelSection, upsertTrailingSection } from './markdownSections';

describe('markdownSections', () => {
  it('replaces top-level sections and keeps the trailing separator format', () => {
    const markdown = ['## 5. 风格指南（文风参考）', '旧内容', '', '---', '', '## 6. 重要备注与软性约束', '保留内容'].join(
      '\n',
    );

    expect(replaceTopLevelSection(markdown, '## 5. 风格指南（文风参考）', ['-> 1-边界/1.2_文风.md'])).toBe([
      '## 5. 风格指南（文风参考）',
      '',
      '-> 1-边界/1.2_文风.md',
      '',
      '---',
      '',
      '## 6. 重要备注与软性约束',
      '保留内容',
    ].join('\n'));
  });

  it('replaces only the targeted subsection body', () => {
    const markdown = [
      '## 7. 当前写作状态（动态上下文）',
      '### 7.4 待处理线索',
      '旧线索',
      '',
      '### 7.5 执行复盘',
      '保留复盘',
    ].join('\n');

    expect(replaceSubsection(markdown, '### 7.4 待处理线索', ['-> .novelkit/memory/foreshadowing.md'])).toBe([
      '## 7. 当前写作状态（动态上下文）',
      '### 7.4 待处理线索',
      '',
      '-> .novelkit/memory/foreshadowing.md',
      '',
      '### 7.5 执行复盘',
      '保留复盘',
    ].join('\n'));
  });

  it('upserts a trailing section when the heading does not exist yet', () => {
    const markdown = ['# 角色状态', '', '原有内容'].join('\n');

    expect(upsertTrailingSection(markdown, '## 自动同步记录', ['- 最近完成章节：第001章'])).toBe([
      '# 角色状态',
      '',
      '原有内容',
      '',
      '## 自动同步记录',
      '',
      '- 最近完成章节：第001章',
      '',
    ].join('\n'));
  });
});
