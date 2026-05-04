import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('server entry config', () => {
  it('does not configure the removed proposal backup option for the running WebUI server', () => {
    const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
    const removedOptionName = ['disable', 'Local', 'Proposal', 'Fallback'].join('');

    expect(source).not.toContain(removedOptionName);
  });
});
