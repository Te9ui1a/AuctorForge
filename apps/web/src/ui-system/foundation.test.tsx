import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const uiSystemDirectory = dirname(fileURLToPath(import.meta.url));
const mainSourcePath = resolve(uiSystemDirectory, '../main.tsx');
const tokensSourcePath = resolve(uiSystemDirectory, '../styles/tokens.css');
const stylesSourcePath = resolve(uiSystemDirectory, '../styles.css');

function readRootCustomProperty(source: string, propertyName: string) {
  const match = new RegExp(`${propertyName}:\\s*([^;]+);`).exec(source);

  return match?.[1].trim() ?? '';
}

afterEach(() => {
  cleanup();
});

describe('ui-system foundation', () => {
  it('uses the globals stylesheet entry in main.tsx', () => {
    const mainSource = readFileSync(mainSourcePath, 'utf8');

    expect(mainSource).toContain("import './styles/globals.css';");
  });

  it('exposes cn() and a renderable button primitive', async () => {
    const utilsImportPath = '../lib/utils';
    const buttonImportPath = '../components/ui/button';

    const [{ cn }, { Button }] = await Promise.all([
      import(/* @vite-ignore */ utilsImportPath),
      import(/* @vite-ignore */ buttonImportPath),
    ]);

    render(<Button className={cn('foundation-smoke-test')}>Foundation</Button>);

    expect(screen.getByRole('button', { name: 'Foundation' })).toHaveClass('foundation-smoke-test');
  });

  it('exposes shared motion tokens for restrained product motion', () => {
    const tokensSource = readFileSync(tokensSourcePath, 'utf8');

    expect(readRootCustomProperty(tokensSource, '--motion-duration-fast')).toBe('120ms');
    expect(readRootCustomProperty(tokensSource, '--motion-duration-normal')).toBe('180ms');
    expect(readRootCustomProperty(tokensSource, '--motion-duration-slow')).toBe('260ms');
    expect(readRootCustomProperty(tokensSource, '--motion-ease-standard')).toContain('cubic-bezier');
    expect(readRootCustomProperty(tokensSource, '--motion-ease-out')).toContain('cubic-bezier');
    expect(readRootCustomProperty(tokensSource, '--motion-ease-in')).toContain('cubic-bezier');
  });

  it('defines the approved editor-neutral color ladder without changing manuscript paper warmth', () => {
    const tokensSource = readFileSync(tokensSourcePath, 'utf8');
    const stylesSource = readFileSync(stylesSourcePath, 'utf8');

    expect(readRootCustomProperty(tokensSource, '--ui-background')).toBe('#0f1012');
    expect(readRootCustomProperty(tokensSource, '--ui-shell-bg')).toBe('#17191d');
    expect(readRootCustomProperty(tokensSource, '--ui-card')).toBe('#202329');
    expect(readRootCustomProperty(tokensSource, '--ui-popover')).toBe('#202329');
    expect(readRootCustomProperty(tokensSource, '--ui-primary')).toBe('#6f7f8f');
    expect(readRootCustomProperty(tokensSource, '--ui-document-paper')).toBe('#f7f2e8');

    expect(readRootCustomProperty(stylesSource, '--bg-canvas')).toBe('#0f1012');
    expect(readRootCustomProperty(stylesSource, '--bg-shell')).toBe('#17191d');
    expect(readRootCustomProperty(stylesSource, '--bg-panel')).toBe('#202329');
    expect(readRootCustomProperty(stylesSource, '--document-paper')).toBe('#f7f2e8');
    expect(readRootCustomProperty(stylesSource, '--accent')).toBe('#6f7f8f');
  });

  it('keeps the surface system low-radius and panel-like instead of card-heavy', () => {
    const tokensSource = readFileSync(tokensSourcePath, 'utf8');
    const stylesSource = readFileSync(stylesSourcePath, 'utf8');

    expect(readRootCustomProperty(tokensSource, '--radius-sm')).toBe('6px');
    expect(readRootCustomProperty(tokensSource, '--radius-md')).toBe('8px');
    expect(readRootCustomProperty(tokensSource, '--radius-lg')).toBe('10px');
    expect(readRootCustomProperty(tokensSource, '--radius-xl')).toBe('12px');

    expect(readRootCustomProperty(stylesSource, '--radius-sm')).toBe('6px');
    expect(readRootCustomProperty(stylesSource, '--radius-md')).toBe('8px');
    expect(readRootCustomProperty(stylesSource, '--radius-lg')).toBe('10px');
    expect(readRootCustomProperty(stylesSource, '--radius-xl')).toBe('12px');

    expect(readRootCustomProperty(tokensSource, '--ui-shell-frame-shadow')).toBe('none');
    expect(readRootCustomProperty(tokensSource, '--ui-editor-shell-shadow')).toBe('none');
    expect(readRootCustomProperty(tokensSource, '--ui-assistant-shadow')).toBe('none');
    expect(readRootCustomProperty(tokensSource, '--ui-workbench-context-rail-width')).toBe('clamp(300px, 25vw, 392px)');
    expect(readRootCustomProperty(tokensSource, '--ui-workbench-context-rail-shadow')).toBe('0 18px 42px rgba(4, 6, 12, 0.24)');
  });
});
