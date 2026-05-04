import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from './badge';
import { Button } from './button';

const srcRoot = resolve(__dirname, '../..');
const stylesCssPath = resolve(srcRoot, 'styles.css');
const tokensCssPath = resolve(srcRoot, 'styles/tokens.css');

afterEach(() => {
  cleanup();
});

describe('button tiers', () => {
  it('keeps the default variant as the only strong primary tier', () => {
    render(<Button>继续写作</Button>);

    expect(screen.getByRole('button', { name: '继续写作' })).toHaveAttribute('data-ui-control-tier', 'primary');
  });

  it('renders primary and destructive actions as bordered tonal controls instead of bright CTA treatments', () => {
    render(
      <>
        <Button>继续写作</Button>
        <Button variant="destructive">删除</Button>
      </>,
    );

    const primary = screen.getByRole('button', { name: '继续写作' });
    const destructive = screen.getByRole('button', { name: '删除' });

    expect(primary.className).toContain('border-[var(--ui-control-primary-border)]');
    expect(primary.className).toContain('hover:bg-[var(--ui-control-primary-hover-surface)]');
    expect(primary.className).not.toContain('hover:brightness-110');
    expect(destructive.className).toContain('border-[var(--ui-control-destructive-border)]');
    expect(destructive.className).toContain('hover:bg-[var(--ui-control-destructive-hover-surface)]');
    expect(destructive.className).not.toContain('hover:brightness-110');
  });

  it('maps non-primary button variants onto supporting, quiet, and destructive tiers', () => {
    render(
      <>
        <Button variant="secondary">讨论</Button>
        <Button variant="outline">导入</Button>
        <Button variant="ghost">历史</Button>
        <Button variant="link">了解更多</Button>
        <Button variant="destructive">删除</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: '讨论' })).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(screen.getByRole('button', { name: '导入' })).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(screen.getByRole('button', { name: '历史' })).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(screen.getByRole('button', { name: '了解更多' })).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(screen.getByRole('button', { name: '删除' })).toHaveAttribute('data-ui-control-tier', 'destructive');
  });

  it('keeps supporting and quiet controls restrained so they read like tools, not competing CTAs', () => {
    render(
      <>
        <Button variant="secondary">讨论</Button>
        <Button variant="outline">导入</Button>
        <Button variant="ghost">历史</Button>
        <Button variant="link">了解更多</Button>
      </>,
    );

    const secondary = screen.getByRole('button', { name: '讨论' });
    const outline = screen.getByRole('button', { name: '导入' });
    const ghost = screen.getByRole('button', { name: '历史' });
    const link = screen.getByRole('button', { name: '了解更多' });

    expect(secondary.className).toContain('border-[var(--ui-control-supporting-border)]');
    expect(secondary.className).toContain('bg-[var(--ui-control-supporting-surface)]');
    expect(outline.className).toContain('bg-transparent');
    expect(outline.className).toContain('hover:border-[var(--ui-control-supporting-hover-border)]');
    expect(ghost.className).toContain('bg-transparent');
    expect(ghost.className).toContain('hover:bg-[var(--ui-control-quiet-hover-surface)]');
    expect(link.className).toContain('bg-transparent');
  });

  it('keeps badges lighter and less pill-dominant while preserving emphasis semantics', () => {
    render(
      <>
        <Badge>Primary</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="muted">Quiet</Badge>
      </>,
    );

    expect(screen.getByText('Primary').className).toContain('rounded-md');
    expect(screen.getByText('Primary').className).not.toContain('rounded-full');
    expect(screen.getByText('Primary').className).toContain('border-[var(--ui-badge-dominant-border)]');
    expect(screen.getByText('Secondary').className).toContain('border-[var(--ui-badge-supporting-border)]');
    expect(screen.getByText('Outline').className).toContain('border-[var(--ui-badge-outline-border)]');
    expect(screen.getByText('Quiet').className).toContain('border-[var(--ui-badge-muted-border)]');

    expect(screen.getByText('Primary')).toHaveAttribute('data-ui-emphasis', 'dominant');
    expect(screen.getByText('Secondary')).toHaveAttribute('data-ui-emphasis', 'supporting');
    expect(screen.getByText('Outline')).toHaveAttribute('data-ui-emphasis', 'supporting');
    expect(screen.getByText('Quiet')).toHaveAttribute('data-ui-emphasis', 'supporting');
  });

  it('keeps the shared cleanup free of legacy parallel button style selectors', () => {
    const stylesCss = readFileSync(stylesCssPath, 'utf8');

    expect(stylesCss).not.toMatch(/(^|\n)\.button\s*\{/);
    expect(stylesCss).not.toMatch(/(^|\n)\.button-primary\s*\{/);
    expect(stylesCss).not.toMatch(/(^|\n)\.button-secondary\s*\{/);
  });

  it('defines shared cursor and hover feedback for enabled and disabled controls', () => {
    const stylesCss = readFileSync(stylesCssPath, 'utf8');

    expect(stylesCss).toMatch(/button:not\(:disabled\)[\s\S]*cursor:\s*pointer/);
    expect(stylesCss).toMatch(/\[role='button'\]:not\(\[aria-disabled='true'\]\)[\s\S]*cursor:\s*pointer/);
    expect(stylesCss).toMatch(/button:disabled[\s\S]*cursor:\s*not-allowed/);
    expect(stylesCss).toMatch(/@media \(hover: hover\) and \(pointer: fine\)[\s\S]*button:not\(:disabled\):hover[\s\S]*transform:\s*translateY\(-1px\)/);
  });

  it('keeps shared editor and document tokens out of the old bright-blue accent family', () => {
    const tokensCss = readFileSync(tokensCssPath, 'utf8');

    expect(tokensCss).not.toMatch(/--ui-editor-shell-surface:[\s\S]*rgba\(122, 163, 255, 0\.08\)/);
    expect(tokensCss).not.toMatch(/--ui-document-focus-ring:\s*rgba\(122, 163, 255, 0\.24\)/);
  });

  it('preserves semantic control hooks on the rendered child when using asChild', () => {
    render(
      <Button asChild variant="secondary" size="sm">
        <a href="/docs">打开文档</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: '打开文档' });

    expect(link).toHaveAttribute('data-ui-control-tier', 'supporting');
    expect(link.className).toContain('border-[var(--ui-control-supporting-border)]');
    expect(link.className).toContain('bg-[var(--ui-control-supporting-surface)]');
    expect(link.className).toContain('h-9');
  });
});
