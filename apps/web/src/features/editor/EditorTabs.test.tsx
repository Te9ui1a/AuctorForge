import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorTabs } from './EditorTabs';

const srcDirectory = dirname(fileURLToPath(import.meta.url));
const injectedEditorStyles = [
  readFileSync(resolve(srcDirectory, '../../styles/tokens.css'), 'utf8'),
  readFileSync(resolve(srcDirectory, '../../styles.css'), 'utf8'),
].join('\n');

if (!document.head.querySelector('[data-test-styles="editor-tabs-contract"]')) {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-test-styles', 'editor-tabs-contract');
  styleElement.textContent = injectedEditorStyles;
  document.head.appendChild(styleElement);
}

function findStyleRule(selectorText: string) {
  for (const styleSheet of Array.from(document.styleSheets)) {
    const rules = Array.from(styleSheet.cssRules ?? []);

    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }

      const selectors = rule.selectorText.split(',').map((selector) => selector.trim());
      if (!selectors.includes(selectorText)) {
        continue;
      }

      return rule;
    }
  }

  return null;
}

function readRuleProperty(selectorText: string, propertyName: string) {
  const rule = findStyleRule(selectorText);

  if (!rule) {
    throw new Error(`Missing CSS rule for selector: ${selectorText}`);
  }

  const value = rule.style.getPropertyValue(propertyName).trim();

  if (!value) {
    throw new Error(`Missing CSS property "${propertyName}" in rule: ${selectorText}`);
  }

  return value;
}

afterEach(() => {
  cleanup();
});

describe('EditorTabs', () => {
  it('renders close buttons for opened documents', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const { container } = render(
        <EditorTabs
          paths={['1-边界/预期.md', '2-设定/2.2_新书设定案.md']}
          activePath="1-边界/预期.md"
          dirtyPaths={['2-设定/2.2_新书设定案.md']}
          onSelect={onSelect}
          onClose={onClose}
        />,
    );

    const tabStrip = container.firstChild as HTMLElement | null;
    const activeTab = tabStrip?.querySelector('[data-editor-state="active"]');
    const inactiveTab = tabStrip?.querySelector('[data-editor-state="inactive"]');
    const activeTabLabel = activeTab?.querySelector('[data-editor-surface="tab-label"]');
    const activeTabContext = activeTab?.querySelector('[data-editor-surface="tab-context"]');
    const inactiveTabContext = inactiveTab?.querySelector('[data-editor-surface="tab-context"]');
    const activeTabButton = within(activeTab as HTMLElement).getByRole('button', { name: '边界 预期.md' });
    const inactiveTabButton = within(inactiveTab as HTMLElement).getByRole('button', { name: '设定 2.2_新书设定案.md' });
    const inactiveCloseButton = screen.getByRole('button', { name: '关闭 2-设定/2.2_新书设定案.md' });
    const dirtyMarker = inactiveTab?.querySelector('[data-editor-surface="dirty-marker"]');

    expect(tabStrip).toHaveAttribute('data-editor-surface', 'tab-strip');
    expect(tabStrip).toHaveAttribute('data-editor-tone', 'editorial-strip');
    expect(tabStrip).toHaveAttribute('data-editor-density', 'quiet');
    expect(tabStrip).toHaveAttribute('data-editor-chrome', 'contextual-navigation');
    expect(tabStrip).toHaveAttribute('data-editor-tab-treatment', 'contextual');
    expect(tabStrip).toHaveAttribute('data-editor-edge', 'attached');
    expect(tabStrip).toHaveAttribute('data-ui-intent-weight', 'supporting');
    expect(activeTab).toHaveAttribute('data-editor-surface', 'tab');
    expect(activeTab).toHaveAttribute('data-editor-tab-role', 'current-document');
    expect(activeTab).toHaveAttribute('data-editor-tab-context', 'boundary');
    expect(activeTab).toHaveAttribute('data-editor-tab-save-state', 'clean');
    expect(activeTab).toHaveAttribute('data-editor-tab-treatment', 'contextual-current');
    expect(inactiveTab).toHaveAttribute('data-editor-surface', 'tab');
    expect(inactiveTab).toHaveAttribute('data-editor-tab-role', 'background-context');
    expect(inactiveTab).toHaveAttribute('data-editor-tab-context', 'setting');
    expect(inactiveTab).toHaveAttribute('data-editor-tab-save-state', 'dirty');
    expect(inactiveTab).toHaveAttribute('data-editor-tab-treatment', 'contextual-background');
    expect(dirtyMarker).toBeInTheDocument();
    expect(dirtyMarker?.tagName).toBe('SPAN');
    expect(dirtyMarker).toHaveAttribute('aria-hidden', 'true');
    expect(activeTabLabel).toHaveTextContent('预期.md');
    expect(activeTabContext).toHaveTextContent('边界');
    expect(inactiveTabContext).toHaveTextContent('设定');
    expect(activeTabButton).toHaveAttribute('aria-current', 'page');
    expect(inactiveTabButton).not.toHaveAttribute('aria-current');
    expect(activeTabButton).not.toHaveAccessibleDescription();
    expect(inactiveTabButton).toHaveAccessibleDescription('未保存更改');
    expect(activeTabButton).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(inactiveTabButton).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(activeTabButton).toHaveAttribute('data-editor-tab-button-tone', 'contextual');
    expect(inactiveCloseButton).toHaveAttribute('data-ui-control-tier', 'quiet');
    expect(inactiveCloseButton).toHaveAttribute('data-editor-tab-button-tone', 'dismiss');

    fireEvent.click(activeTabButton);

    expect(onSelect).toHaveBeenCalledWith('1-边界/预期.md');

    fireEvent.click(inactiveCloseButton);

    expect(onClose).toHaveBeenCalledWith('2-设定/2.2_新书设定案.md');
  });

  it('keeps contextual cues quiet while distinguishing draft focus from supporting tabs', () => {
    render(
      <EditorTabs
        paths={['4-正文/第001章_草稿.md', '3-大纲/第01卷_章纲.md']}
        activePath="4-正文/第001章_草稿.md"
        dirtyPaths={['4-正文/第001章_草稿.md']}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    const activeTab = screen.getByText('第001章_草稿.md').closest('[data-editor-surface="tab"]');
    const outlineTab = screen.getByText('第01卷_章纲.md').closest('[data-editor-surface="tab"]');

    expect(activeTab).toHaveAttribute('data-editor-state', 'active');
    expect(activeTab).toHaveAttribute('data-editor-tab-role', 'current-document');
    expect(activeTab).toHaveAttribute('data-editor-tab-context', 'manuscript');
    expect(activeTab).toHaveAttribute('data-editor-tab-save-state', 'dirty');
    expect(activeTab).toHaveAttribute('data-editor-tab-treatment', 'contextual-current');
    expect(activeTab?.closest('[data-editor-surface="tab-strip"]')).toHaveAttribute('data-ui-intent-weight', 'supporting');
    expect(activeTab?.closest('[data-editor-surface="tab-strip"]')).toHaveAttribute('data-editor-tab-treatment', 'contextual');
    expect(activeTab?.closest('[data-editor-surface="tab-strip"]')).toHaveAttribute('data-editor-edge', 'attached');
    expect(activeTab?.querySelector('[data-editor-surface="tab-context"]')).toHaveTextContent('正文');

    expect(outlineTab).toHaveAttribute('data-editor-state', 'inactive');
    expect(outlineTab).toHaveAttribute('data-editor-tab-role', 'background-context');
    expect(outlineTab).toHaveAttribute('data-editor-tab-context', 'outline');
    expect(outlineTab).toHaveAttribute('data-editor-tab-save-state', 'clean');
    expect(outlineTab).toHaveAttribute('data-editor-tab-treatment', 'contextual-background');
    expect(outlineTab?.querySelector('[data-editor-surface="tab-context"]')).toHaveTextContent('大纲');
    expect(outlineTab?.querySelector('[data-editor-surface="dirty-marker"]')).not.toBeInTheDocument();
  });

  it('keeps dirty descriptions distinct for paths that differ by encoded characters', () => {
    render(
      <EditorTabs
        paths={['4-正文/a b.md', '4-正文/a20b.md']}
        activePath="4-正文/a b.md"
        dirtyPaths={['4-正文/a b.md', '4-正文/a20b.md']}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    const spacedPathButton = screen.getByRole('button', { name: '正文 a b.md' });
    const literalPathButton = screen.getByRole('button', { name: '正文 a20b.md' });
    const spacedPathDescriptionId = spacedPathButton.getAttribute('aria-describedby');
    const literalPathDescriptionId = literalPathButton.getAttribute('aria-describedby');

    expect(spacedPathButton).toHaveAccessibleDescription('未保存更改');
    expect(literalPathButton).toHaveAccessibleDescription('未保存更改');
    expect(spacedPathDescriptionId).toBeTruthy();
    expect(literalPathDescriptionId).toBeTruthy();
    expect(spacedPathDescriptionId).not.toBe(literalPathDescriptionId);
  });

  it('uses compact attached tab sizing and quiet active tab tokens', () => {
    const { container } = render(
      <EditorTabs
        paths={['1-边界/预期.md']}
        activePath="1-边界/预期.md"
        dirtyPaths={[]}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    const tabStrip = container.firstChild as HTMLElement;
    const activeTabButton = screen.getByRole('button', { name: '边界 预期.md' });

    expect(tabStrip).toHaveClass('min-h-[40px]', 'px-2');
    expect(activeTabButton).toHaveClass('min-h-[34px]', 'rounded-t-[12px]', 'rounded-b-none', 'px-3');
    expect(readRuleProperty(':root', '--ui-editor-tab-active-surface')).toBe('rgba(236, 228, 214, 0.08)');
    expect(readRuleProperty(':root', '--ui-editor-tab-active-border')).toBe('rgba(220, 208, 182, 0.1)');
    expect(readRuleProperty(':root', '--ui-editor-tab-active-shadow')).toBe('inset 0 -1px 0 rgba(245, 241, 234, 0.18)');
  });
});
