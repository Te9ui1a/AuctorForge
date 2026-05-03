import { describe, expect, it } from 'vitest';

import { augmentChapterReviewProposal } from './reviewReportAugment';

describe('reviewReportAugment', () => {
  it('adds the current chapter review report when the model only proposes soft writes', () => {
    const augmented = augmentChapterReviewProposal({
      chapterNumber: 4,
      projectFiles: [
        {
          path: '4-正文/第004章_草稿.md',
          content: '# 第004章 待填写第004章标题\n\n角色甲收起资源甲，确认巷口无人。',
        },
      ],
      proposedWrites: [
        {
          path: 'PROJECT.md',
          content: '# PROJECT\n\n- 第004章草稿已完成，等待审查。',
        },
      ],
    });

    expect(augmented.gate).toBe('pass');
    expect(augmented.proposedWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '5-审查/第004章_审查报告.md',
          content: expect.stringContaining('# 第004章 审查报告'),
        }),
        expect.objectContaining({ path: 'PROJECT.md' }),
      ]),
    );
    expect(augmented.proposedWrites.find((item) => item.path === '5-审查/第004章_审查报告.md')?.content).toContain(
      '审查对象：第004章 待填写第004章标题',
    );
  });

  it('adds AI flavor repair details to synthesized review reports', () => {
    const augmented = augmentChapterReviewProposal({
      chapterNumber: 4,
      projectFiles: [
        {
          path: '4-正文/第004章_草稿.md',
          content: '# 第004章 待填写第004章标题\n\n' + '角色甲深吸一口气，沿着巷口重新核对血迹。'.repeat(80),
        },
      ],
      proposedWrites: [
        {
          path: 'PROJECT.md',
          content: '# PROJECT\n\n- 第004章草稿已完成，等待审查。',
        },
      ],
    });

    const report = augmented.proposedWrites.find((item) => item.path === '5-审查/第004章_审查报告.md')?.content ?? '';

    expect(augmented.gate).toBe('revise');
    expect(report).toContain('审查评级：REVISE');
    expect(report).toContain('## AI味命中明细（服务端补充）');
    expect(report).toContain('禁用套话');
    expect(report).toContain('## 局部改写任务（服务端补充）');
  });

  it('adds service-side AI flavor findings and raises false PASS ratings to REVISE', () => {
    const augmented = augmentChapterReviewProposal({
      chapterNumber: 1,
      projectFiles: [
        {
          path: '4-正文/第001章_草稿.md',
          content: [
            '# 第001章 待填写开局章标题',
            '',
            '夜色像刀一样压下来，仿佛整条街都在发抖。',
            '这不是求生，而是命运对他的审判。',
            '他知道这意味着自己再也不能回头，这说明真正的黑暗刚刚开始。',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '5-审查/第001章_审查报告.md',
          content: '# 第001章 审查报告\n\n- 审查评级：PASS\n\n## 结论\n- 可以继续下一章。',
        },
      ],
    });

    expect(augmented.gate).toBe('revise');
    expect(augmented.proposedWrites[0]?.content).toContain('审查评级：REVISE');
    expect(augmented.proposedWrites[0]?.content).toContain('## AI味命中明细（服务端补充）');
    expect(augmented.proposedWrites[0]?.content).toContain('高频比喻');
    expect(augmented.proposedWrites[0]?.content).toContain('## 局部改写任务（服务端补充）');
    expect(augmented.proposedWrites[0]?.content).toContain('改写策略');
    expect(augmented.proposedWrites[0]?.content).toContain('不要整章重写');
  });

  it('adds non-blocking repair guidance for a single warning-level AI flavor hit', () => {
    const augmented = augmentChapterReviewProposal({
      chapterNumber: 2,
      projectFiles: [
        {
          path: '4-正文/第002章_草稿.md',
          content: [
            '# 第002章 待填写承接章标题',
            '',
            '这意味着他已经没有退路，只能把物件甲重新压回袖中。',
          ].join('\n'),
        },
      ],
      proposedWrites: [
        {
          path: '5-审查/第002章_审查报告.md',
          content: '# 第002章 审查报告\n\n- 审查评级：PASS\n\n## 结论\n- 可以继续下一章。',
        },
      ],
    });

    const report = augmented.proposedWrites[0]?.content ?? '';

    expect(augmented.gate).toBe('pass');
    expect(report).toContain('审查评级：PASS');
    expect(report).toContain('## AI味命中明细（服务端补充）');
    expect(report).toContain('解释性旁白');
    expect(report).toContain('这意味着他已经没有退路');
    expect(report).toContain('## 局部改写任务（服务端补充）');
  });

  it('adds service-side continuity findings and raises false PASS ratings to REVISE', () => {
    const augmented = augmentChapterReviewProposal({
      chapterNumber: 3,
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
        {
          path: '4-正文/第003章_草稿.md',
          content: '# 第003章 当前章\n\n'
            + '正文处理当前信号甲，却提前写到了未来信号甲和未来信号乙。',
        },
      ],
      proposedWrites: [
        {
          path: '5-审查/第003章_审查报告.md',
          content: '# 第003章 审查报告\n\n- 审查评级：PASS\n\n## 连续性检查\n- 连续性完美，可以继续下一章。',
        },
      ],
    });

    const report = augmented.proposedWrites[0]?.content ?? '';

    expect(augmented.gate).toBe('revise');
    expect(report).toContain('审查评级：REVISE');
    expect(report).toContain('## 连续性硬校验（服务端补充）');
    expect(report).toContain('提前消费后续章纲');
    expect(report).toContain('future-beat-leak');
  });

  it('corrects false model word-count estimates with deterministic chapter length data', () => {
    const longDraft = [
      '# 第004章 待填写第004章标题',
      '',
      '角色甲低头检查袖中的资源甲，环境声源压住了巷尾的脚步。',
      '他没有急着动手，只把呼吸放慢，等对方先露出破绽。',
    ].join('\n') + '\n\n' + '环境要素沿着门槛往屋里渗，角色甲把每一步都压得很稳。'.repeat(140);

    const augmented = augmentChapterReviewProposal({
      chapterNumber: 4,
      projectFiles: [
        {
          path: '4-正文/第004章_草稿.md',
          content: longDraft,
        },
      ],
      proposedWrites: [
        {
          path: '5-审查/第004章_审查报告.md',
          content: [
            '# 第004章 审查报告',
            '',
            '- 审查评级：REVISE',
            '',
            '## 基础数据',
            '- 字数评估：当前草稿约 1600 字，距离单章 2800-3500 字的标准相差甚远。',
          ].join('\n'),
        },
      ],
    });

    const report = augmented.proposedWrites[0]?.content ?? '';

    expect(augmented.gate).toBe('pass');
    expect(report).toContain('审查评级：PASS');
    expect(report).toContain('## 字数核验（服务端补充）');
    expect(report).toContain('当前正文约');
    expect(report).toContain('最低要求为 2800 字');
    expect(report).toContain('模型原字数估算与实际正文长度不一致');
    expect(report).not.toContain('约 1600 字');
  });
});
