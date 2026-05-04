import { describe, expect, it } from 'vitest';

import { augmentChapterReviewProposal } from './reviewReportAugment';

describe('reviewReportAugment length correction', () => {
  it('rewrites real false short-length review wording to server-side truth while preserving unrelated findings', () => {
    const longDraft = [
      '# 第006章 章标题',
      '',
      '角色甲稳住呼吸，沿着冷柜边缘重新确认地面的拖痕。',
      '他没有急着开口，只把每一个细节都压进视线里。',
    ].join('\n') + '\n\n' + '环境细节沿着走廊缓慢推进，角色甲把动作放得极稳。'.repeat(140);

    const augmented = augmentChapterReviewProposal({
      chapterNumber: 6,
      projectFiles: [
        {
          path: '4-正文/第006章_草稿.md',
          content: longDraft,
        },
      ],
      proposedWrites: [
        {
          path: '5-审查/第006章_审查报告.md',
          content: [
            '# 第006章 审查报告',
            '',
            '- 审查评级：REVISE',
            '',
            '## 1. 基础数据与红线检查',
            '- **字数**：当前正文约 4313 字（未达到 2800 字最低要求）。',
            '- **字数检查**：当前草稿字数约在 2000 字左右，未达到不低于 2800 字的硬性要求。',
            '',
            '## 2. 核心维度打分',
            '- **剧情节奏 (Pacing)**：8/10。',
            '- **沉浸感 (Immersion)**：7/10。',
            '',
            '## 3. AI 味专项检查',
            '- **滥用比喻**：“轻描淡写的一句话，却像是一把生锈的手术刀，精准地挑断了罗慎紧绷的神经。”',
            '',
            '## 4. 局部改写任务',
            '- **问题类型**：字数不足，人物互动过于简略。',
            '- **问题类型**：部分 AI 味描写。',
            '',
            '## 5. 结论与下一步建议',
            '本章剧情推进和爽点设计合格，主要问题在于**字数不足**和**部分 AI 味描写**。',
          ].join('\n'),
        },
      ],
    });

    const report = augmented.proposedWrites[0]?.content ?? '';

    expect(augmented.gate).toBe('pass');
    expect(report).toContain('## 字数核验（服务端补充）');
    expect(report).toContain('服务端统计：当前正文约');
    expect(report).toContain('已达到单章至少2800字的长度要求');
    expect(report).toContain('部分 AI 味描写');
    expect(report).not.toContain('未达到 2800 字最低要求');
    expect(report).not.toContain('未达到不低于 2800 字的硬性要求');
    expect(report).not.toContain('字数不足');
    expect(report).not.toContain('略有不足');
  });

  it('does not treat correct minimum-length guidance as a false shortage claim', () => {
    const longDraft = [
      '# 第007章 章标题',
      '',
      '角色乙关上库房门，先把灯绳绕在门栓上，再蹲下去听墙后的水声。',
      '她把纸条折成窄条，塞进袖口，没有急着给任何人解释。',
    ].join('\n') + '\n\n' + '脚步声从楼梯下方一层层压近，木板的响动让每个人都把话吞回去。'.repeat(120);

    const augmented = augmentChapterReviewProposal({
      chapterNumber: 7,
      projectFiles: [
        {
          path: '4-正文/第007章_草稿.md',
          content: longDraft,
        },
      ],
      proposedWrites: [
        {
          path: '5-审查/第007章_审查报告.md',
          content: [
            '# 第007章 审查报告',
            '',
            '- 审查评级：PASS',
            '',
            '## 1. 基础数据与红线检查',
            '- **字数**：当前正文已达到不低于 2800 字的最低要求。',
            '',
            '## 2. 结论',
            '本章可以进入定稿阶段。',
          ].join('\n'),
        },
      ],
    });

    const report = augmented.proposedWrites[0]?.content ?? '';

    expect(augmented.gate).toBe('pass');
    expect(report).toContain('- **字数**：当前正文已达到不低于 2800 字的最低要求。');
    expect(report).toContain('- 核验结论：审查字数依据已由服务端真实统计兜底。');
    expect(report).not.toContain('模型原字数估算与实际正文长度不一致');
  });
});
