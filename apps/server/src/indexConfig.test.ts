import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('server entry config', () => {
  it('disables local proposal fallback for the running WebUI server', () => {
    const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

    expect(source).toMatch(/disableLocalProposalFallback:\s*true/);
  });
});
