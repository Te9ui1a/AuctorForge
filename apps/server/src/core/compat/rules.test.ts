import { describe, expect, it } from 'vitest';

import { normalizeProjectPath } from './rules';

describe('normalizeProjectPath', () => {
  it('maps legacy or inconsistent plugin paths to the canonical project paths', () => {
    expect(normalizeProjectPath('docs/MASTER.md')).toBe(
      '.novelkit/constitution/MASTER.md',
    );
    expect(normalizeProjectPath('2.2 新书设定案.md')).toBe(
      '2-设定/2.2_新书设定案.md',
    );
    expect(normalizeProjectPath('1.3_套路方向.md')).toBe(
      '1-边界/1.3_套路方向.md',
    );
  });
});
