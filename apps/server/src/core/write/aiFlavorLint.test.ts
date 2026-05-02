import { describe, expect, it } from 'vitest';

import { lintAiFlavor } from './aiFlavorLint';

describe('aiFlavorLint', () => {
  it('flags dense AI-flavor patterns in a draft', () => {
    const result = lintAiFlavor([
      '# 第001章 夹缝求生',
      '',
      '夜色像刀一样压下来，仿佛整条街都在发抖。',
      '这不是求生，而是命运对他的审判。',
      '他知道这意味着自己再也不能回头，这说明真正的黑暗刚刚开始。',
    ].join('\n'));

    expect(result.blocked).toBe(true);
    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '高频比喻' }),
        expect.objectContaining({ label: '否定排比' }),
        expect.objectContaining({ label: '解释性旁白' }),
      ]),
    );
  });

  it('blocks explicit banned web-novel stock phrases even when only one type appears', () => {
    const result = lintAiFlavor([
      '# 第001章 夹缝求生',
      '',
      '沈砚深吸一口气，眼中精芒一闪，嘴角勾起冷笑。',
    ].join('\n'));

    expect(result.blocked).toBe(true);
    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '禁用套话' }),
      ]),
    );
  });

  it('returns categorized evidence while preserving legacy pattern compatibility', () => {
    const result = lintAiFlavor([
      '# 第001章 夹缝求生',
      '',
      '老郑倒吸一口凉气，显然已经震惊到了极点。',
      '这意味着他们已经没有退路。',
    ].join('\n'));

    expect(result.blocked).toBe(true);
    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'stock-breath-reaction',
          category: 'cliche_phrase',
          label: '禁用套话',
          matchedText: '倒吸一口凉气',
          context: expect.stringContaining('老郑倒吸一口凉气'),
          pattern: expect.any(RegExp),
        }),
        expect.objectContaining({
          category: 'explanatory_narration',
          matchedText: '这意味着',
        }),
      ]),
    );
    expect(result.blockingReasons).toEqual(expect.arrayContaining(['禁用套话']));
  });

  it('blocks accumulated warning-level categories by threshold and explains why', () => {
    const result = lintAiFlavor([
      '# 第001章 夹缝求生',
      '',
      '夜色仿佛压了下来。',
      '他非常紧张，极其愤怒。',
      '与此同时，巷口传来脚步声。',
    ].join('\n'));

    expect(result.blocked).toBe(true);
    expect(result.thresholdHits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'generic_intensifier',
          count: 2,
        }),
      ]),
    );
  });

  it('does not block concrete clean prose', () => {
    const result = lintAiFlavor([
      '# 第001章 夹缝求生',
      '',
      '雨水顺着门槛往里爬。沈砚把账册塞进怀里，指腹按住纸角，没有看身后。',
      '老郑停在巷口，烟袋锅碰了碰墙面。他压低声音：“别走正街。”',
    ].join('\n'));

    expect(result.blocked).toBe(false);
    expect(result.hits).toHaveLength(0);
  });
});
