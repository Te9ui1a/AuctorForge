import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentProps } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentEditor } from './DocumentEditor';

const srcDirectory = dirname(fileURLToPath(import.meta.url));
const injectedEditorStyles = [
  readFileSync(resolve(srcDirectory, '../../styles/tokens.css'), 'utf8'),
  readFileSync(resolve(srcDirectory, '../../styles.css'), 'utf8'),
].join('\n');

if (!document.head.querySelector('[data-test-styles="document-editor-contract"]')) {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-test-styles', 'document-editor-contract');
  styleElement.textContent = injectedEditorStyles;
  document.head.appendChild(styleElement);
}

type DocumentEditorProps = ComponentProps<typeof DocumentEditor>;

const baseProps = {
  path: '3-正文/第001章.md',
  content: '正文',
  canSave: true,
  onChange: (_value: string) => {},
  onSave: () => {},
} satisfies DocumentEditorProps;

function renderEditor(overrides: Partial<DocumentEditorProps> = {}) {
  return render(<DocumentEditor {...baseProps} {...overrides} />);
}

function getManuscriptLane(container: HTMLElement) {
  const lanes = container.querySelectorAll<HTMLElement>('[data-editor-surface="manuscript-lane"]');

  expect(lanes).toHaveLength(1);

  return lanes[0];
}

function getToolbar(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-editor-surface="toolbar"]');
}

function getLaneContract(lane: HTMLElement) {
  return lane.getAttribute('data-editor-lane');
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

describe('DocumentEditor manuscript lane', () => {
  it('marks the manuscript lane as centered and open in editable mode', () => {
    const { container } = renderEditor();

    const lane = getManuscriptLane(container);

    expect(lane).toHaveAttribute('data-editor-lane', 'centered-open');
  });

  it('keeps shell-wide editor chrome outside the manuscript lane', () => {
    const { container } = renderEditor();

    const toolbar = getToolbar(container);
    getManuscriptLane(container);

    expect(toolbar).not.toBeNull();
    expect(toolbar).toHaveAttribute('data-editor-chrome', 'compact-status');
    expect(toolbar?.closest('[data-editor-surface="manuscript-lane"]')).toBeNull();
  });

  it('uses the same centered and open lane contract in readonly and empty states', () => {
    const { container: editableContainer } = renderEditor();
    const { container: readonlyContainer } = renderEditor({ readOnly: true });
    const { container: emptyContainer } = renderEditor({ path: '', canSave: false });

    const editableLane = getManuscriptLane(editableContainer);
    const readonlyLane = getManuscriptLane(readonlyContainer);
    const emptyLane = getManuscriptLane(emptyContainer);

    expect(getLaneContract(editableLane)).toBe('centered-open');
    expect(getLaneContract(readonlyLane)).toBe(getLaneContract(editableLane));
    expect(getLaneContract(emptyLane)).toBe(getLaneContract(editableLane));
  });

  it('does not style the manuscript lane as a nested card', () => {
    const selector = "[data-editor-surface='manuscript-lane'][data-editor-lane='centered-open']";

    expect(readRuleProperty(selector, 'border')).toBe('0');
    expect(readRuleProperty(selector, 'background')).toBe('transparent');
    expect(readRuleProperty(selector, 'box-shadow')).toBe('none');
  });

  it('keeps explicit open lane tokens for future editor styling changes', () => {
    expect(readRuleProperty(':root', '--ui-document-lane-open-background')).toBe('transparent');
    expect(readRuleProperty(':root', '--ui-document-lane-open-border')).toBe('transparent');
    expect(readRuleProperty(':root', '--ui-document-lane-open-shadow')).toBe('none');
  });

  it('uses full-width manuscript tokens on large screens to avoid hollow editor edges', () => {
    expect(readRuleProperty(':root', '--ui-document-lane-max-width-lg')).toBe('100%');
    expect(readRuleProperty(':root', '--ui-document-lane-shell-padding-inline-lg')).toBe('14px');
    expect(readRuleProperty(':root', '--ui-document-editor-inline-padding-lg')).toBe('24px');
  });

  it('remounts the manuscript lane only when the active document transition key changes', () => {
    const { container, rerender } = renderEditor();

    const initialLane = getManuscriptLane(container);

    expect(initialLane).toHaveAttribute('data-editor-motion', 'page-in');
    expect(initialLane).toHaveAttribute('data-editor-transition-state', 'working-draft');
    expect(initialLane).toHaveAttribute('data-editor-transition-key', '3-正文/第001章.md');

    rerender(<DocumentEditor {...baseProps} content="正文继续" />);

    expect(getManuscriptLane(container)).toBe(initialLane);

    rerender(<DocumentEditor {...baseProps} path="3-正文/第002章.md" content="第二章" />);

    const nextLane = getManuscriptLane(container);

    expect(nextLane).not.toBe(initialLane);
    expect(nextLane).toHaveAttribute('data-editor-transition-key', '3-正文/第002章.md');
  });

  it('uses shared motion tokens for manuscript page transitions', () => {
    expect(readRuleProperty("[data-editor-surface='manuscript-lane'][data-editor-motion='page-in']", 'animation-name')).toBe('manuscriptLaneIn');
    expect(readRuleProperty("[data-editor-surface='manuscript-lane'][data-editor-motion='page-in']", 'animation-duration')).toBe('var(--motion-duration-slow)');
    expect(readRuleProperty("[data-editor-surface='document-shell']", 'transition-duration')).toBe('var(--motion-duration-normal)');
  });

  it('keeps loaded documents read-only when the workflow does not allow saving them', () => {
    const onChange = vi.fn();

    renderEditor({
      canSave: false,
      onChange,
    });

    const editor = screen.getByLabelText('当前文档编辑器');

    expect(editor).toHaveAttribute('readonly');
    expect(screen.getAllByText('当前阶段不可保存').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '保存当前文档' })).toBeDisabled();

    fireEvent.change(editor, { target: { value: '不应该进入草稿' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('only enables saving writable documents after the current draft is dirty', () => {
    const { rerender } = renderEditor({ isDirty: false });

    expect(screen.getByText('草稿已保存')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存当前文档' })).toBeDisabled();

    rerender(<DocumentEditor {...baseProps} isDirty />);

    expect(screen.getByText('草稿可保存')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存当前文档' })).toBeEnabled();
  });

  it('uses reduced manuscript density for editable documents', () => {
    renderEditor({ canSave: true, isDirty: true });

    const editor = screen.getByLabelText('当前文档编辑器');

    expect(editor).toHaveAttribute('data-editor-density', 'compact-writing');
    expect(editor.className).toContain('text-[14px]');
    expect(editor.className).toContain('leading-7');
  });

  it('shows zero narrative characters for empty editor content', () => {
    renderEditor({ content: '' });

    expect(screen.getByText('正文 0 字')).toBeInTheDocument();
  });

  it('counts only effective narrative body characters', () => {
    renderEditor({
      content: '# 第001章 场景甲\n\n  角色甲 动作甲。 \n\n## 余波\n雨 停了。',
    });

    expect(screen.getByText('正文 11 字')).toBeInTheDocument();
  });

  it('updates the narrative character count when editor content changes', () => {
    const { rerender } = renderEditor({ content: '# 第001章\n\n场景变化甲。' });

    expect(screen.getByText('正文 6 字')).toBeInTheDocument();

    rerender(<DocumentEditor {...baseProps} content={'# 第001章\n\n场景变化甲。\n角色甲动作甲。'} />);

    expect(screen.getByText('正文 13 字')).toBeInTheDocument();
  });

  it('shows the narrative character count in readonly proposal preview', () => {
    renderEditor({ readOnly: true, content: '# 提案\n\n角色甲动作甲。' });

    expect(screen.getByText('正文 7 字')).toBeInTheDocument();
  });
});
