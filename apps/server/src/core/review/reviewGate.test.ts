import { describe, expect, it } from 'vitest';

import { extractReviewGate } from './reviewGate';

describe('reviewGate', () => {
  it('reads PASS / REVISE / BLOCK ratings from a review report', () => {
    expect(extractReviewGate('# 审查报告\n\n- 审查评级：PASS')).toBe('pass');
    expect(extractReviewGate('# 审查报告\n\n- 审查评级：REVISE')).toBe('revise');
    expect(extractReviewGate('# 审查报告\n\n- 审查评级：BLOCK')).toBe('block');
  });

  it('falls back to revise or block heuristics when no explicit rating is present', () => {
    expect(extractReviewGate('# 审查报告\n\n## 局部改写任务\n- 先局部回修后再看是否进入下一章。')).toBe('revise');
    expect(extractReviewGate('# 审查报告\n\n- 建议整章重写，当前不能进入下一章。')).toBe('block');
  });
});
