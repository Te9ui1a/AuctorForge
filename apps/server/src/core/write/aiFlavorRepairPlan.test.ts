import { describe, expect, it } from 'vitest';

import { buildAiFlavorRepairPlan, verifyAiFlavorRepair } from './aiFlavorRepairPlan';
import { lintAiFlavor } from './aiFlavorLint';

describe('aiFlavorRepairPlan', () => {
  it('maps lint hits to writing-move strategies instead of synonym replacement', () => {
    const lint = lintAiFlavor([
      '# 第001章 夹缝求生',
      '',
      '老郑倒吸一口凉气，显然已经震惊到了极点。',
      '这意味着他们已经没有退路。',
    ].join('\n'));

    const plan = buildAiFlavorRepairPlan(lint);

    expect(plan.escalation).toBeNull();
    expect(plan.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'paragraph',
          originalSnippet: expect.stringContaining('倒吸一口凉气'),
          strategy: expect.stringContaining('动作'),
          acceptanceChecks: expect.arrayContaining([
            expect.stringContaining('不要用同义套话'),
          ]),
        }),
        expect.objectContaining({
          strategy: expect.stringContaining('具体后果'),
          evidence: expect.arrayContaining([
            expect.objectContaining({ category: 'explanatory_narration' }),
          ]),
        }),
      ]),
    );
  });

  it('escalates only when blocking issues are dense across multiple spans', () => {
    const content = [
      '# 第001章 夹缝求生',
      '',
      '老郑倒吸一口凉气，嘴角勾起冷笑。',
      '',
      '沈砚深吸一口气，眼中精芒一闪。',
      '',
      '这意味着命运已经落下审判。',
      '',
      '夜色仿佛凝固，空气仿佛凝固。',
    ].join('\n');

    const plan = buildAiFlavorRepairPlan(lintAiFlavor(content));

    expect(plan.escalation).toEqual(
      expect.objectContaining({
        reason: expect.stringContaining('多处'),
      }),
    );
  });

  it('verifies repaired prose and reports newly introduced issues', () => {
    const passing = verifyAiFlavorRepair('老郑捏紧烟袋锅，铜锅沿在墙上磕了一下。');
    const failing = verifyAiFlavorRepair('老郑倒吸一口凉气，嘴角勾起冷笑。');

    expect(passing.passed).toBe(true);
    expect(failing.passed).toBe(false);
    expect(failing.remainingHits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'cliche_phrase' }),
      ]),
    );
  });
});
