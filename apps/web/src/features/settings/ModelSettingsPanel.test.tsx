import type { ComponentProps } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelSettingsPanel } from './ModelSettingsPanel';

const baseSettings = {
  activeModelId: 'primary' as const,
  models: {
    primary: {
      provider: 'openai-compatible' as const,
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret-key',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      stream: true,
    },
    secondary: {
      provider: 'gemini-native' as const,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gem-key',
      model: 'gemini-2.5-pro',
      temperature: 0.3,
      stream: true,
    },
  },
};

function renderPanel(overrides?: Partial<ComponentProps<typeof ModelSettingsPanel>>) {
  return render(
    <ModelSettingsPanel
      isOpen
      isSaving={false}
      settings={baseSettings}
      statusMessage=""
      isTesting={false}
      onClose={() => {}}
      onSave={() => {}}
      onTestConnection={() => {}}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('ModelSettingsPanel', () => {
  it('hides the settings panel when closed', () => {
    const { container } = renderPanel({ isOpen: false });

    expect(screen.queryByRole('dialog', { name: '模型配置' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-ui-layer="overlay"]')).toBeNull();
  });

  it('renders the viewport-fit settings dialog with stable hooks and tab semantics', () => {
    const { container } = render(
      <ModelSettingsPanel
        isOpen
        isSaving={false}
        settings={baseSettings}
        statusMessage=""
        isTesting={false}
        onClose={() => {}}
        onSave={() => {}}
        onTestConnection={() => {}}
      />
    );

    const overlayBackdrop = container.querySelector('[data-ui-layer="overlay"][data-overlay-surface="backdrop"]');
    const settingsDialog = screen.getByRole('dialog', { name: '模型配置' });

    expect(overlayBackdrop).toBeTruthy();
    expect(settingsDialog).toHaveAttribute('aria-modal', 'true');
    expect(settingsDialog).toHaveAttribute('aria-labelledby', 'settings-panel-title');
    expect(settingsDialog).toHaveAttribute('data-overlay-surface', 'settings-panel');
    expect(settingsDialog).toHaveAttribute('data-settings-layout', 'viewport-fit');
    expect(settingsDialog).toHaveAttribute('data-overlay-style', 'solid');
    expect(container.querySelector('[data-settings-grid="two-column"]')).toBeTruthy();
    expect(container.querySelector('[data-settings-section="provider"]')).toBeTruthy();
    expect(container.querySelector('[data-settings-section="connection"]')).toBeTruthy();
    expect(container.querySelector('[data-settings-section="parameters"]')).toBeTruthy();
    expect(screen.getByRole('tablist', { name: '模型配置切换' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '模型 A', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '模型 B', selected: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument();
  });

  it('bounds the settings dialog to the viewport and makes the settings body scrollable', () => {
    const { container } = renderPanel();

    const settingsDialog = screen.getByRole('dialog', { name: '模型配置' });
    const settingsForm = settingsDialog.querySelector('form');
    const scrollRegion = container.querySelector('[data-settings-scroll-region="model-settings-body"]');

    expect(settingsDialog).toHaveClass('grid');
    expect(settingsDialog.className).toContain('h-[min(820px,calc(100vh-48px))]');
    expect(settingsDialog.className).not.toContain('max-h-[min(820px,calc(100vh-48px))]');
    expect(settingsForm).toHaveClass('grid-rows-[minmax(0,1fr)_auto]');
    expect(scrollRegion).toHaveClass('min-h-0', 'overflow-y-auto');
  });

  it('updates only the active model and submits the full settings store', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderPanel({ onSave, statusMessage: '连接成功' });

    fireEvent.click(screen.getByRole('tab', { name: '模型 B' }));
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gpt-4.1-mini' } });
    fireEvent.click(screen.getByRole('tab', { name: '模型 A' }));

    expect(screen.getByLabelText('Model')).toHaveValue('gpt-4o-mini');
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://example.com/v1');

    fireEvent.click(screen.getByRole('tab', { name: '模型 B' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        activeModelId: 'secondary',
        models: expect.objectContaining({
          primary: expect.objectContaining({
            model: 'gpt-4o-mini',
            baseUrl: 'https://example.com/v1',
          }),
          secondary: expect.objectContaining({
            model: 'gpt-4.1-mini',
          }),
        }),
      }),
    );
    expect(screen.getByText('连接成功')).toBeInTheDocument();
  });

  it('sends the active config to connection tests', () => {
    const onTestConnection = vi.fn();

    renderPanel({ onTestConnection });

    fireEvent.click(screen.getByRole('tab', { name: '模型 B' }));
    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '1.1' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    expect(onTestConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini-native',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gem-key',
        model: 'gemini-2.5-pro',
        temperature: 1.1,
      }),
    );
  });

  it('renders status messages with distinct success and failure states', () => {
    const { rerender } = renderPanel({ statusMessage: '连接成功' });

    expect(screen.getByText('连接成功')).toHaveAttribute('data-settings-status', 'success');

    rerender(
      <ModelSettingsPanel
        isOpen
        isSaving={false}
        settings={baseSettings}
        statusMessage="连接失败"
        isTesting={false}
        onClose={() => {}}
        onSave={() => {}}
        onTestConnection={() => {}}
      />,
    );

    expect(screen.getByText('连接失败')).toHaveAttribute('data-settings-status', 'error');
  });
});
