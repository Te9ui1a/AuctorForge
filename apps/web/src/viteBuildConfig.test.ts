import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('vite build config', () => {
  it('uses relative asset URLs so the built WebUI can open from file URLs', () => {
    const configSource = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8');

    expect(configSource).toMatch(/base:\s*['"]\.\/['"]/);
  });
});
