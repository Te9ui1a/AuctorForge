import { describe, expect, it } from 'vitest';

import { parseProjectProgress } from './readProjectProgress';

describe('parseProjectProgress', () => {
  it('extracts phase, core task, todo items, and next suggestion from PROJECT §8.1', () => {
    const progress = parseProjectProgress(`## 8. 项目路线图与里程碑
### 8.1 当前重点与后续步骤

- **阶段**：章节收束
- **核心任务**：决定是继续修订第001章，还是进入下一章
- **待办事项**：
  - [x] 第001章草稿
  - [x] 第001章审查报告
  - [ ] 第002章草稿

### 8.2 里程碑日志（回顾）
`);

    expect(progress).toMatchObject({
      phase: '章节收束',
      coreTask: '决定是继续修订第001章，还是进入下一章',
      nextSuggestion: '第002章草稿',
      callableModules: ['write', 'review'],
    });
    expect(progress.todoItems).toEqual([
      { text: '第001章草稿', done: true },
      { text: '第001章审查报告', done: true },
      { text: '第002章草稿', done: false },
    ]);
    expect(progress.assetPointers).toEqual([]);
  });

  it('extracts key asset pointers from PROJECT index sections', () => {
    const progress = parseProjectProgress([
      '### 2.2 世界索引（文件指针）',
      '- [新书设定] -> `2-设定/2.2_新书设定案.md`',
      '- [金手指] -> `2-设定/2.3_金手指设定.md`',
      '',
      '### 4.2 大纲索引（文件指针）',
      '- [总纲] -> `3-大纲/3.1_全书结构总纲.md`',
      '',
      '### 8.1 当前重点与后续步骤',
      '- **阶段**：正文写作',
      '- **核心任务**：完成第001章草稿',
      '- **待办事项**：',
      '  - [ ] 第001章草稿',
    ].join('\n'));

    expect(progress.assetPointers).toEqual([
      { section: '世界索引', label: '新书设定', path: '2-设定/2.2_新书设定案.md' },
      { section: '世界索引', label: '金手指', path: '2-设定/2.3_金手指设定.md' },
      { section: '大纲索引', label: '总纲', path: '3-大纲/3.1_全书结构总纲.md' },
    ]);
  });
});
