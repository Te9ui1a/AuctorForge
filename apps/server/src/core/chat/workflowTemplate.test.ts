import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadSkillPack } from '../vsix/loadSkillPack';
import { extractTemplateSections } from './workflowTemplate';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

describe('extractTemplateSections', () => {
  it('derives ideation output sections from the skill pack workflow doc', () => {
    const skillPack = loadSkillPack(skillPackPath);

    expect(
      extractTemplateSections({
        module: 'ideation',
        targetPath: '2-设定/2.2_新书设定案.md',
        workflowDocs: [skillPack.modules.ideation],
      }),
    ).toEqual([
      '世界观',
      '关键人设',
      '金手指',
      '主线推演',
      '关键关系博弈',
      '地图路线图',
      '关键事件',
    ]);

    expect(
      extractTemplateSections({
        module: 'ideation',
        targetPath: '2-设定/2.3_金手指设定.md',
        workflowDocs: [skillPack.modules.ideation],
      }),
    ).toEqual(['核心概念', '功能模块', '平衡性设计', '进化路线', '视觉表现']);
  });

  it('derives outline output sections from the skill pack workflow doc', () => {
    const skillPack = loadSkillPack(skillPackPath);

    expect(
      extractTemplateSections({
        module: 'outline',
        targetPath: '3-大纲/3.1_全书结构总纲.md',
        workflowDocs: [skillPack.modules.outline],
      }),
    ).toEqual([
      '全书剧情单元总览',
      '核心节奏公式',
      '节奏密度统计表',
      '对新书的启示',
    ]);

    expect(
      extractTemplateSections({
        module: 'outline',
        targetPath: '3-大纲/第01卷_完整卷纲.md',
        workflowDocs: [skillPack.modules.outline],
      }),
    ).toEqual([
      '战略层 - 核心设计',
      '战略层 - 人物链',
      '战术层 - 剧情事件流',
      '战术层 - 金手指植入',
    ]);

    expect(
      extractTemplateSections({
        module: 'outline',
        targetPath: '3-大纲/第01卷_章纲.md',
        workflowDocs: [skillPack.modules.outline],
      }),
    ).toEqual(['章节梗概', '场景拆解', '伏笔与线索', '结尾钩子']);
  });

  it('derives write workflow checklists from the skill pack workflow doc', () => {
    const skillPack = loadSkillPack(skillPackPath);

    expect(
      extractTemplateSections({
        module: 'write',
        targetPath: '4-正文/第001章_草稿.md',
        workflowDocs: [skillPack.modules.write],
      }),
    ).toEqual([
      '风格约束',
      '红线底线',
      '设定支持',
      '当前状态',
      '伏笔与进度',
      '本章指令',
      '上下文参考',
      '字数检查',
      '大纲符合性检查',
      '文风检查',
      '接续检查',
      '金手指合规性',
    ]);
  });

  it('derives review sections from the skill pack workflow doc', () => {
    const skillPack = loadSkillPack(skillPackPath);

    expect(
      extractTemplateSections({
        module: 'review',
        targetPath: '5-审查/设定审查报告.md',
        workflowDocs: [skillPack.modules.review],
      }),
    ).toEqual([
      '逻辑自洽性 (Internal Logic)',
      '爽点支撑度 (Pleasure Points)',
      '利益驱动逻辑 (Motivation)',
      '人物立体度 (Character Depth)',
    ]);

    expect(
      extractTemplateSections({
        module: 'review',
        targetPath: '5-审查/大纲审查报告.md',
        workflowDocs: [skillPack.modules.review],
      }),
    ).toEqual([
      '节奏密度 (Pacing)',
      '期待感管理 (Hooks)',
      '爽点逻辑 (Payoff)',
      '一致性检查 (Consistency)',
    ]);

    expect(
      extractTemplateSections({
        module: 'review',
        targetPath: '5-审查/第001章_审查报告.md',
        workflowDocs: [skillPack.modules.review],
      }),
    ).toEqual([
      '黄金三章法则 (Opening)',
      '沉浸感 (Immersion)',
      '情绪调动 (Emotion)',
      '文风与红线 (Style & Constraints)',
    ]);
  });
});
