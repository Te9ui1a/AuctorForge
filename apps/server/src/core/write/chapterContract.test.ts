import { describe, expect, it } from 'vitest';

import { getMaxOutlinedChapterNumber, parseOutlineChapters, validateChapterDraftProposal } from './chapterContract';

describe('chapterContract', () => {
  it('parses the outlined max chapter number', () => {
    expect(
      getMaxOutlinedChapterNumber([
        '第1章：夹缝求生',
        '',
        '第2章：借势藏锋',
        '',
        '第10章：黎明之火',
      ].join('\n')),
    ).toBe(10);
  });

  it('parses markdown chapter headings without a colon', () => {
    expect(parseOutlineChapters([
      '## 第001章 债契',
      '',
      '- 场景1：沈砚在青岚宗杂役院被赵德柱逼签债契。',
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
      '**章节梗概**：沈砚潜入外门坊市。',
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
          content: '# 第005章：伪装与诱饵\n\n' + '沈砚进入外门坊市。'.repeat(500),
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
          content: '# 第005章 错章\n\n' + '沈砚沿着旧仓外的墙根慢慢走。'.repeat(380),
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
            '- **开端**：沈砚日夜利用残镜制符。',
            '- **冲突**：修为太低限制制符效率。',
            '- **转折**：残镜提纯灵力反哺自身。',
            '- **章末钩子**：沈砚决定推演更具杀伤力的底牌。',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第008章_草稿.md',
          content: '# 第008章 疯狂制符\n\n' + '沈砚伏在案前，一笔一画压住符纸里的火气。'.repeat(520),
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
          content: '# 第003章 黑山坊市\n\n' + '沈砚走进坊市深处，袖中的符纸被汗水压得发硬。'.repeat(320),
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
          content: ['第1章：夹缝求生', '', '第2章：借势藏锋', '', '第3章：黎明之火'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 黎明之火（大结局）\n\n这一章直接大结局。',
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      message: expect.stringContaining('超出当前章纲范围'),
    });
  });

  it('rejects chapter drafts below the 3000-character minimum', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第1章：夹缝求生', '', '第2章：借势藏锋'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 夹缝求生\n\n' + '这一章仍然只有摘要式正文。'.repeat(80),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      code: 'chapter-draft-too-short',
      message: expect.stringContaining('至少3000字'),
    });
  });

  it('accepts chapter drafts above the former target band', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '3-大纲/第01卷_章纲.md',
          content: ['第1章：夹缝求生', '', '第2章：借势藏锋'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 夹缝求生\n\n' + '沈砚在雨里检查血铁线索。'.repeat(520),
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
          content: ['第1章：夹缝求生', '', '第2章：借势藏锋'].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 夹缝求生\n\n' + '沈砚深吸一口气，继续查看血铁线索。'.repeat(190),
        },
      ],
    });

    expect(validation).toEqual({ ok: true });
  });

  it('rejects chapter drafts that leak the old local fallback world when the project context uses different entities', () => {
    const validation = validateChapterDraftProposal({
      currentChapterNumber: 1,
      projectFiles: [
        {
          path: '2-设定/2.4_主要角色设定表.md',
          content: '# 主要角色设定表\n\n## 沈砚\n青岚宗杂役弟子。\n\n## 赵德柱\n外门管事。',
        },
        {
          path: '3-大纲/第01卷_章纲.md',
          content: [
            '## 第001章 债契',
            '',
            '- 场景1：沈砚在青岚宗杂役院被赵德柱逼签债契。',
            '- 场景2：沈砚发现净尘符能洗去药渣。',
            '',
            '## 第002章 净尘符',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '4-正文/第001章_草稿.md',
          content: '# 第001章 债契\n\n' + '陈渊在棚户区被毒蛇帮刘三逼债，黑水仓的木牌落进泥水里。'.repeat(160),
        },
      ],
    });

    expect(validation).toMatchObject({
      ok: false,
      message: expect.stringContaining('项目设定不一致'),
    });
  });
});
