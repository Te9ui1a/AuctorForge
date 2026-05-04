import { describe, expect, it } from 'vitest';

import { getMaxOutlinedChapterNumber, parseOutlineChapters, validateChapterDraftProposal } from './chapterContract';

describe('chapterContract', () => {
  it('parses the outlined max chapter number', () => {
    expect(
      getMaxOutlinedChapterNumber([
        '第1章：待填写开局章标题',
        '',
        '第2章：待填写承接章标题',
        '',
        '第10章：待填写后续章标题',
      ].join('\n')),
    ).toBe(10);
  });

  it('parses markdown chapter headings without a colon', () => {
    expect(parseOutlineChapters([
      '## 第001章 债契',
      '',
      '- 场景1：角色甲在组织甲杂役院被角色乙逼签债契。',
      '',
      '## 第002章 净尘符',
    ].join('\n'))).toEqual([
      { number: 1, title: '债契' },
      { number: 2, title: '净尘符' },
    ]);
  });

  it('parses bold markdown chapter headings from generated outlines', () => {
    expect(parseOutlineChapters([
      '**第005章：外门坊市，钱记当铺**',
      '',
      '**章节梗概**：角色甲潜入外门坊市。',
    ].join('\n'))).toEqual([
      { number: 5, title: '外门坊市，钱记当铺' },
    ]);
  });

  it('rejects a colon-style draft heading whose title does not match the parsed outline', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 5,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['**第005章：外门坊市，钱记当铺**', '', '**第006章：与虎谋皮**'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第005章_草稿.md',
          content: '# 第005章：伪装与诱饵\n\n' + '角色甲进入外门坊市。'.repeat(500),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      message: expect.stringContaining('本章标题应为“外门坊市，钱记当铺”'),
    });
  });

  it('rejects chapter draft writes for a different chapter path', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 7,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第7章：夜探旧仓', '', '第8章：暗潮初起'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第005章_草稿.md',
          content: '# 第005章 错章\n\n' + '角色甲沿着旧仓外的墙根慢慢走。'.repeat(380),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      message: expect.stringContaining('草稿写入路径不一致'),
    });
  });

  it('accepts long drafts using per-chapter plans from the master outline when volume chapter outline is missing', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 8,
      projectFiles: [
        {
          path: '3-大纲/3.1_全书结构总纲.md',
          content: [
            '# 全书结构总纲与前期细纲',
            '',
            '### 第8章：疯狂制符',
            '- **开端**：角色甲日夜利用残镜制符。',
            '- **冲突**：修为太低限制制符效率。',
            '- **转折**：残镜提纯灵力反哺自身。',
            '- **章末钩子**：角色甲决定推演更具杀伤力的底牌。',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第008章_草稿.md',
          content: '# 第008章 疯狂制符\n\n' + '角色甲伏在案前，一笔一画压住资源甲里的火气。'.repeat(520),
        },
      ],
    });

    expect(validation).toEqual({ ok: true });
  });

  it('fails closed when no chapter plan source is available', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 3,
      projectFiles: [],
      proposedWrites: [
        {
          path: '4-正文/第003章_草稿.md',
          content: '# 第003章 黑山坊市\n\n' + '角色甲走进坊市深处，袖中的资源甲被汗水压得发硬。'.repeat(320),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      code: 'chapter-plan-missing',
      message: expect.stringContaining('缺少章节计划'),
    });
  });

  it('rejects a chapter draft whose title drifts into a future finale', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第1章：待填写开局章标题', '', '第2章：待填写承接章标题', '', '第3章：待填写后续章标题'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 待填写后续章标题（大结局）\n\n这一章直接大结局。',
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      message: expect.stringContaining('超出当前章纲范围'),
    });
  });

  it('rejects chapter drafts below the 2800-character minimum', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第1章：待填写开局章标题', '', '第2章：待填写承接章标题'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 待填写开局章标题\n\n' + '甲'.repeat(2799),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      code: 'chapter-draft-too-short',
      message: expect.stringContaining('至少2800字'),
    });
  });

  it('accepts chapter drafts at the 2800-character minimum', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第1章：待填写开局章标题', '', '第2章：待填写承接章标题'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 待填写开局章标题\n\n' + '甲'.repeat(2800),
        },
      ],
    });

    expect(validation).toEqual({ ok: true });
  });

  it('accepts chapter drafts above the former target band', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第1章：待填写开局章标题', '', '第2章：待填写承接章标题'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 待填写开局章标题\n\n' + '角色甲在雨里检查线索甲线索。'.repeat(520),
        },
      ],
    });

    expect(validation).toEqual({ ok: true });
  });

  it('accepts otherwise valid chapter drafts that contain repairable AI-flavor stock phrases', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第1章：待填写开局章标题', '', '第2章：待填写承接章标题'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 待填写开局章标题\n\n' + '角色甲深吸一口气，继续查看线索甲线索。'.repeat(190),
        },
      ],
    });

    expect(validation).toEqual({ ok: true });
  });

  it('rejects chapter drafts that consume future explicit project signals', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 3,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: [
            '### 第3章：当前章',
            '- **章节梗概**：主角处理当前事件。',
            '- 连续性信号：当前信号甲',
            '- 场景1：处理当前信号甲。',
            '- **章末钩子**：当前悬念继续。',
            '',
            '### 第5章：后续章',
            '- **章节梗概**：后续揭示：未来信号甲、未来信号乙',
            '- 场景1：处理未来信号甲。',
            '- 场景2：处理未来信号乙。',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第003章_草稿.md',
          content: '# 第003章 当前章\n\n'
            + '正文处理当前信号甲，却提前写到了未来信号甲和未来信号乙。'.repeat(120),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      code: 'chapter-draft-continuity-revise',
      message: expect.stringContaining('提前消费后续章纲'),
    });
  });

  it('rejects chapter drafts that introduce future explicit resource signals', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 4,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: [
            '### 第4章：当前章',
            '- **章节梗概**：主角处理当前事件。',
            '- 连续性信号：当前信号甲',
            '- 场景1：处理当前信号甲。',
            '',
            '### 第6章：资源章',
            '- **章节梗概**：资源状态变化。',
            '- 资源信号：资源信号甲',
            '- 场景1：资源信号甲进入项目状态。',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第004章_草稿.md',
          content: '# 第004章 当前章\n\n'
            + '正文处理当前信号甲，又提前写到资源信号甲已经进入当前项目状态。'.repeat(120),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      code: 'chapter-draft-continuity-revise',
      message: expect.stringContaining('资源信号'),
    });
  });

  it('rejects chapter drafts that do not use the active role table entities', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '2-设定/2.4_主要角色设定表.md',
          content: '# 主要角色设定表\n\n## 角色甲\n组织甲杂役弟子。\n\n## 角色乙\n外门管事。',
        },
        {
          path: '3-大纲/第01卷_章纲.md',
          content: [
            '## 第001章 债契',
            '',
            '- 场景1：角色甲在组织甲杂役院被角色乙逼签债契。',
            '- 场景2：角色甲发现净尘符能洗去药渣。',
            '',
            '## 第002章 净尘符',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 债契\n\n' + '陌生角色在区域甲被组织甲对手逼债，地点甲的木牌落进环境要素里。'.repeat(160),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      message: expect.stringContaining('项目设定不一致'),
    });
  });
});
