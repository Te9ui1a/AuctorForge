import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadSkillPack } from '../vsix/loadSkillPack';
import { buildLocalProposal, selectWritableTargets } from './assistantLocalProposal';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);
const skillPack = loadSkillPack(skillPackPath);

describe('assistantLocalProposal', () => {
  it('prefers explicit writable chat targets over default module targets', () => {
    expect(
      selectWritableTargets({
        module: 'define',
        strictWorkflowWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md'],
        chatAllowedWrites: [
          '2-设定/2.1_创意脑暴.md',
          '1-边界/1.2_文风.md',
          '3-大纲/3.1_全书结构总纲.md',
        ],
        preferredWritePaths: ['3-大纲/3.1_全书结构总纲.md'],
      }),
    ).toEqual(['3-大纲/3.1_全书结构总纲.md']);
  });

  it('builds a local proposal with workflow checklist and draft payloads', () => {
    const proposal = buildLocalProposal({
      stepTitle: '单章正文写作',
      module: 'write',
      strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
      chatAllowedWrites: ['4-正文/第001章_草稿.md'],
      preferredWritePaths: [],
      userPrompt: '用户消息：开始写第一章正文。',
      projectFiles: [
        {
          path: '4-正文/第003章_草稿.md',
          content: [
            '# 第003章 杀局前夜',
            '',
            '上一章的余势还没散尽。陈渊仍坐在门槛后，听雨水敲着破瓦。',
            '',
            '雨水顺着门缝往里爬，陈渊把符纸一张张压平。',
          ].join('\n'),
        },
        {
          path: '3-大纲/第01卷_章纲.md',
          content:
            '第1章：夹缝求生\n\n**章节梗概**：主角在危险环境里第一次显露“苟住才有机会翻盘”的核心策略。\n\n**场景拆解**：\n- 场景1：危机降临\n- 场景2：低调试探\n- 场景3：第一轮小反制\n\n**结尾钩子**：主角意识到更大的规则压制已经开始。',
        },
      ],
      workflowDocs: [skillPack.modules.write],
    });

    expect(proposal.reply).toContain('单章正文写作');
    expect(proposal.reply).toContain('确认');
    expect(proposal.reply).toContain('去 AI 味');
    expect(proposal.proposedWrites).toEqual([
      expect.objectContaining({ path: '4-正文/第001章_草稿.md' }),
    ]);
    expect(proposal.proposedWrites[0]?.content).toContain('# 第001章 夹缝求生');
    expect(proposal.proposedWrites[0]?.content).not.toContain('## 完稿自检卡');
    expect(proposal.proposedWrites[0]?.content).not.toContain('## 场景1');
    expect(proposal.proposedWrites[0]?.content).not.toContain('并不是偶然发生');
    expect(proposal.proposedWrites[0]?.content).not.toContain('写法指导');
    expect(proposal.proposedWrites[0]?.content).not.toContain('主角在这一场景里');
  });

  it('does not repeat stock transition paragraphs or leak outline annotations in write drafts', () => {
    const proposal = buildLocalProposal({
      stepTitle: '单章正文写作',
      module: 'write',
      strictWorkflowWrites: ['4-正文/第004章_草稿.md'],
      chatAllowedWrites: ['4-正文/第004章_草稿.md'],
      preferredWritePaths: [],
      userPrompt: '用户消息：按审查报告重写第4章正文，只写小说正文。',
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content:
            '第4章：雨夜交锋，示敌以弱\n\n**章节梗概**：陈渊在暴雨夜诱杀喽啰。\n\n**场景拆解**：\n- 场景1：喽啰（练气二层）踹门而入，外面下着大雨。\n- 场景2：陈渊交出两块灵石（卖符所得），喽啰临时加价。\n- 场景3：陈渊谎称能去百宝阁借钱，诱使对方尾随。\n- 场景4：喽啰在废弃矿坑跳出拦路。\n- 场景5：陈渊用火弹符反杀并摸尸。\n\n**结尾钩子**：储物袋里的东西让他意识到此地不能久留。',
        },
      ],
      workflowDocs: [skillPack.modules.write],
    });

    const content = proposal.proposedWrites[0]?.content ?? '';

    expect(content).not.toContain('（练气二层）');
    expect(content).not.toContain('（卖符所得）');
    expect(content).not.toContain('喽啰踹门而入');
    expect(content).not.toContain('陈渊交出两块灵石');
    expect(content).not.toContain('喽啰临时加价');
    expect(content).not.toContain('态度极度嚣张');
    expect(content).not.toContain('杀鸡儆猴');
    expect(content).not.toContain('上一章的余势');
    expect(content.match(/他没有立刻反应/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(content.match(/对方越急/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(content.match(/雨水把脚印冲得很淡/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(content.length).toBeGreaterThan(3000);
    expect(content).toContain('“');
  });

  it('uses chapter-specific scene material instead of reusing the rent-collection template', () => {
    const proposal = buildLocalProposal({
      stepTitle: '单章正文写作',
      module: 'write',
      strictWorkflowWrites: ['4-正文/第005章_草稿.md'],
      chatAllowedWrites: ['4-正文/第005章_草稿.md'],
      preferredWritePaths: [],
      userPrompt: '用户消息：直接写第5章正文。',
      projectFiles: [
        {
          path: '4-正文/第004章_草稿.md',
          content: [
            '# 第004章 雨夜交锋，示敌以弱',
            '',
            '木门被踹开时，门闩撞在墙上，碎木屑混着雨点弹进屋里。',
            '',
            '雨水顺着门缝往里爬，陈渊把名单折好，塞进灶膛夹层。',
            '',
            '他把黑水仓三个字记在心里，等雨声重新盖住巷口脚步。',
          ].join('\n'),
        },
        {
          path: '3-大纲/第01卷_章纲.md',
          content:
            '第5章：十符齐发，瞬间秒杀\n\n**章节梗概**：陈渊在废弃矿坑完成反杀，取得储物袋和黑水仓线索。\n\n**场景拆解**：\n- 场景1：【图穷匕见】废弃矿坑死胡同，大雨倾盆。喽啰不再隐藏，跳出来拦住陈渊。\n- 场景2：【极致示弱】陈渊装出极度惊恐的样子，连连后退，甚至跌倒在泥水里。\n- 场景3：【雷霆反击】喽啰狞笑着举刀劈下，陈渊不退反进。\n- 场景4：【火力覆盖】十张精通级火弹符瞬间激发，在狭窄死胡同炸开。\n- 场景5：【杀人扬灰】陈渊补刀摸尸，洒下化尸粉。\n\n**结尾钩子**：储物袋里的木牌指向黑水仓。',
        },
      ],
      workflowDocs: [skillPack.modules.write],
    });

    const content = proposal.proposedWrites[0]?.content ?? '';

    expect(content).toContain('# 第005章 十符齐发，瞬间秒杀');
    expect(content).toContain('废弃矿坑');
    expect(content).toContain('符光');
    expect(content).toContain('陌生凭记');
    expect(content).toContain('黑水仓三个字记在心里');
    expect(content).not.toContain('木门被踹开');
    expect(content).not.toContain('例钱');
    expect(content).not.toContain('毒蛇帮');
    expect(content.length).toBeGreaterThan(3000);
  });

  it('does not leak legacy fallback-world entities into a different active project', () => {
    const proposal = buildLocalProposal({
      stepTitle: '单章正文写作',
      module: 'write',
      strictWorkflowWrites: ['4-正文/第001章_草稿.md'],
      chatAllowedWrites: ['4-正文/第001章_草稿.md'],
      preferredWritePaths: [],
      userPrompt: '用户消息：直接写第1章正文。',
      projectFiles: [
        {
          path: '2-设定/2.4_主要角色设定表.md',
          content: '# 主要角色设定表\n\n## 沈砚\n青石城沈家落魄子弟。\n\n## 沈怀礼\n沈家管事。',
        },
        {
          path: '3-大纲/3.1_全书结构总纲.md',
          content: [
            '# 全书结构总纲与前期细纲',
            '',
            '### 第1章：逼债与绝境',
            '- **开端**：百宝斋伙计上门逼债。',
            '- **冲突**：沈怀礼逼沈砚签下卖身契。',
            '- **转折**：沈砚拒绝卖身契。',
            '- **章末钩子**：鲜血滴落祖传青铜残镜。',
          ].join('\n'),
        },
      ],
      workflowDocs: [skillPack.modules.write],
    });

    const content = proposal.proposedWrites[0]?.content ?? '';

    expect(content).toContain('沈砚');
    expect(content).not.toMatch(/陈渊|毒蛇帮|黑水仓|刘三|棚户区/u);
  });

  it('keeps MASTER project-specific redlines idempotent across repeated local proposal generations', () => {
    const proposal = buildLocalProposal({
      stepTitle: '创意孵化与设定构建',
      module: 'ideation',
      strictWorkflowWrites: ['.novelkit/constitution/MASTER.md'],
      chatAllowedWrites: ['.novelkit/constitution/MASTER.md'],
      preferredWritePaths: [],
      userPrompt: '用户消息：补全宪法约束。',
      projectFiles: [
        {
          path: '2-设定/2.1_创意脑暴.md',
          content: '# 套路方向与核心设定\n\n## 1. 核心梗 (Core Premise)\n龟丞相在西游世界苟道长生。',
        },
        {
          path: '.novelkit/constitution/MASTER.md',
          content: [
            '# MASTER',
            '',
            '## 项目特有红线',
            '- 保持“龟丞相在西游世界苟道长生。”的苟道生存逻辑，不要强行热血降智。',
            '- 反派决策必须基于其已知信息下的最优解。',
          ].join('\n'),
        },
      ],
      workflowDocs: [skillPack.modules.ideation],
    });

    const masterDraft = proposal.proposedWrites[0]?.content ?? '';
    expect(masterDraft.match(/保持“龟丞相在西游世界苟道长生。/g)?.length ?? 0).toBe(1);
    expect(masterDraft.match(/反派决策必须基于其已知信息下的最优解/g)?.length ?? 0).toBe(1);
  });

  it('includes localized rewrite guidance in local review proposals', () => {
    const proposal = buildLocalProposal({
      stepTitle: '正文质检',
      module: 'review',
      strictWorkflowWrites: ['5-审查/第001章_审查报告.md'],
      chatAllowedWrites: ['5-审查/第001章_审查报告.md'],
      preferredWritePaths: [],
      userPrompt: '用户消息：请审查第一章草稿。',
      projectFiles: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章\n\n正文草稿。',
        },
      ],
      workflowDocs: [skillPack.modules.review],
    });

    expect(proposal.reply).toContain('AI味');
    expect(proposal.reply).toContain('局部改写');
    expect(proposal.reply).toContain('整章重写');
    expect(proposal.proposedWrites[0]?.content).toContain('局部改写任务');
    expect(proposal.proposedWrites[0]?.content).toContain('命中类型');
    expect(proposal.proposedWrites[0]?.content).toContain('原句或段落');
    expect(proposal.proposedWrites[0]?.content).toContain('建议改法');
    expect(proposal.proposedWrites[0]?.content).toContain('句子级');
  });

  it('does not pass short chapter drafts that read like compressed outlines', () => {
    const proposal = buildLocalProposal({
      stepTitle: '正文质检',
      module: 'review',
      strictWorkflowWrites: ['5-审查/第004章_审查报告.md'],
      chatAllowedWrites: ['5-审查/第004章_审查报告.md'],
      preferredWritePaths: [],
      userPrompt: '用户消息：请审查第4章草稿，重点检查正文是否太像压缩章纲、连续性是否自然、AI味是否仍明显。',
      projectFiles: [
        {
          path: '4-正文/第004章_草稿.md',
          content: [
            '# 第004章 雨夜交锋，示敌以弱',
            '',
            '上一章的余势还没散尽。陈渊对着瘸腿木桌上的破旧铜盆，盆中浑浊的水面倒映出一张眼角下垂、颧骨微凸的中年人脸庞。',
            '',
            '之前那个喽啰踹门而入，外面下着大雨。喽啰态度极度嚣张，拔出法器短刀，准备拿陈渊开刀立威，杀鸡儆猴。',
            '',
            '他先让肩背塌下去，像是真的被这一夜压弯了骨头。',
            '',
            '陈渊颠了颠手中沾血的储物袋，打开一看，里面的东西让他瞳孔猛地一缩。',
          ].join('\n'),
        },
      ],
      workflowDocs: [skillPack.modules.review],
    });

    const report = proposal.proposedWrites[0]?.content ?? '';

    expect(report).toContain('审查评级：REVISE');
    expect(report).toContain('压缩章纲');
    expect(report).toContain('正文长度不足');
    expect(report).toContain('整章扩写');
    expect(report).not.toContain('审查评级：PASS');
  });
});
