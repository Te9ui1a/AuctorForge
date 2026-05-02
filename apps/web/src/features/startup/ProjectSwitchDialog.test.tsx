import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectSwitchDialog } from './ProjectSwitchDialog';

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });

  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: originalShowModal,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: originalClose,
  });
});

describe('ProjectSwitchDialog', () => {
  it('preserves dirty-switch actions and stable dialog semantics', () => {
    const onSaveAndSwitch = vi.fn();
    const onDiscardAndSwitch = vi.fn();
    const onCancel = vi.fn();

    const { container } = render(
      <ProjectSwitchDialog
        isOpen
        dirtyCount={2}
        onSaveAndSwitch={onSaveAndSwitch}
        onDiscardAndSwitch={onDiscardAndSwitch}
        onCancel={onCancel}
      />,
    );

    const dialog = container.querySelector('dialog[data-ui-layer="overlay"][data-overlay-surface="switch-dialog"]');
    const actions = container.querySelector('[data-overlay-surface="dialog-actions"]');

    expect(dialog).toBeTruthy();
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('data-dialog-state', 'open');
    expect(dialog).toHaveAttribute('aria-labelledby', 'project-switch-dialog-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'project-switch-dialog-description');
    expect(container.querySelector('[data-overlay-surface="dialog-content"]')).toBeTruthy();
    expect(actions).toBeTruthy();
    expect(screen.getByRole('heading', { name: '未保存的更改' })).toHaveAttribute('id', 'project-switch-dialog-title');
    expect(screen.getByText('当前项目有 2 个未保存的文件。切换项目将丢失这些更改。')).toHaveAttribute('id', 'project-switch-dialog-description');

    expect(within(actions as HTMLElement).getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole('button', { name: '放弃更改并切换' })).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole('button', { name: '保存并切换' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '保存并切换' }));
    fireEvent.click(screen.getByRole('button', { name: '放弃更改并切换' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onSaveAndSwitch).toHaveBeenCalledTimes(1);
    expect(onDiscardAndSwitch).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('falls back to the open attribute when dialog methods are unavailable', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: undefined,
    });

    const { container, rerender } = render(
      <ProjectSwitchDialog
        isOpen={false}
        dirtyCount={1}
        onSaveAndSwitch={() => {}}
        onDiscardAndSwitch={() => {}}
        onCancel={() => {}}
      />,
    );

    const dialog = container.querySelector('dialog[data-ui-layer="overlay"][data-overlay-surface="switch-dialog"]') as HTMLDialogElement | null;
    expect(dialog).not.toBeNull();
    expect(dialog).not.toHaveAttribute('open');

    rerender(
      <ProjectSwitchDialog
        isOpen
        dirtyCount={1}
        onSaveAndSwitch={() => {}}
        onDiscardAndSwitch={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(dialog).toHaveAttribute('open');

    rerender(
      <ProjectSwitchDialog
        isOpen={false}
        dirtyCount={1}
        onSaveAndSwitch={() => {}}
        onDiscardAndSwitch={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(dialog).not.toHaveAttribute('open');
  });
});
