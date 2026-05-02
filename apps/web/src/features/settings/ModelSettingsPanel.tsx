import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Boxes,
  KeyRound,
  Link2,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import { DialogFooter, DialogHeader } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';
import type { ModelSettings, ModelSettingsStore } from './useModelSettings';

type ModelSettingsPanelProps = {
  isOpen: boolean;
  settings: ModelSettingsStore;
  isSaving: boolean;
  isTesting: boolean;
  statusMessage: string;
  onClose: () => void;
  onSave: (settings: ModelSettingsStore) => Promise<void> | void;
  onTestConnection: (config: ModelSettings) => Promise<void> | void;
};

export function ModelSettingsPanel({
  isOpen,
  settings,
  isSaving,
  isTesting,
  statusMessage,
  onClose,
  onSave,
  onTestConnection,
}: ModelSettingsPanelProps) {
  const [draft, setDraft] = useState(settings);
  const activeConfig = useMemo(() => draft.models[draft.activeModelId], [draft]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  function updateActiveModel(nextModelId: string) {
    if (nextModelId !== 'primary' && nextModelId !== 'secondary') {
      return;
    }

    setDraft((current) => ({
      ...current,
      activeModelId: nextModelId,
    }));
  }

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(draft);
  }

  function updateActiveConfig(nextPatch: Partial<ModelSettings>) {
    setDraft((current) => ({
      ...current,
      models: {
        ...current.models,
        [current.activeModelId]: {
          ...current.models[current.activeModelId],
          ...nextPatch,
        },
      },
    }));
  }

  const isFailureStatus = statusMessage.includes('失败');

  const panelSurfaceClassName =
    'w-[min(860px,100%)] max-h-[min(820px,calc(100vh-48px))] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--ui-overlay-border)] bg-[var(--ui-overlay-surface)] text-[var(--ui-overlay-foreground)] shadow-[var(--ui-overlay-shadow)]';

  const cardClassName =
    'rounded-[var(--radius-md)] border border-border/55 bg-background/24 p-4 shadow-none';

  const fieldLabelClassName = 'mb-2 inline-flex items-center gap-2 text-sm font-medium text-foreground';

  const inputClassName = 'bg-background/30 text-foreground placeholder:text-muted-foreground';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--ui-overlay-backdrop)] p-4 sm:p-6"
      data-ui-layer="overlay"
      data-overlay-surface="backdrop"
    >
      <aside
        className={panelSurfaceClassName}
        data-overlay-surface="settings-panel"
        data-overlay-style="solid"
        data-settings-layout="viewport-fit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
      >
        <DialogHeader className="flex items-start justify-between gap-4 border-b border-border/70 bg-background/10 px-5 py-4 sm:px-6">
          <div className="grid gap-1.5">
            <h2 id="settings-panel-title" className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
              <Settings2 className="h-4 w-4 text-primary" aria-hidden="true" />
              模型配置
            </h2>
            <p className="text-sm text-muted-foreground">保持双模型配置独立，随时测试当前激活模型的连接。</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-[var(--radius-md)] text-muted-foreground hover:bg-background/40 hover:text-foreground"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogHeader>

        <form className="grid h-full min-h-0 grid-rows-[1fr_auto]" onSubmit={handleSubmit}>
          <Tabs value={draft.activeModelId} onValueChange={updateActiveModel} className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid min-h-0 grid-cols-[minmax(220px,240px)_minmax(0,1fr)] items-start gap-4" data-settings-grid="two-column">
              <div className="grid min-w-0 gap-4">
                <div className={cn(cardClassName, 'gap-4 p-3')}>
                  <div className="grid gap-3">
                    <div className="grid gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active model</span>
                      <p className="text-sm text-muted-foreground">模型 A / B 保持各自的连接与参数草稿。</p>
                    </div>
                    <TabsList aria-label="模型配置切换" className="grid h-auto grid-cols-2 rounded-[var(--radius-md)] bg-background/40 p-1">
                      <TabsTrigger
                        value="primary"
                        className="min-w-0 rounded-xl px-3 py-2 text-sm"
                        onClick={() => updateActiveModel('primary')}
                      >
                        模型 A
                      </TabsTrigger>
                      <TabsTrigger
                        value="secondary"
                        className="min-w-0 rounded-xl px-3 py-2 text-sm"
                        onClick={() => updateActiveModel('secondary')}
                      >
                        模型 B
                      </TabsTrigger>
                    </TabsList>
                  </div>
                </div>

                <section className={cardClassName} data-settings-section="provider">
                  <div className="mb-1 grid gap-1">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Provider</h3>
                    <p className="text-sm text-muted-foreground">选择当前激活模型使用的后端协议。</p>
                  </div>
                  <div className="grid gap-2" role="group" aria-label="Provider">
                    <Button
                      type="button"
                      variant={activeConfig.provider === 'openai-compatible' ? 'secondary' : 'outline'}
                      className={cn(
                        'h-auto justify-start rounded-[var(--radius-md)] px-4 py-3 text-left',
                        activeConfig.provider === 'openai-compatible' && 'border-primary/30 bg-primary/12 text-foreground',
                      )}
                      onClick={() => updateActiveConfig({ provider: 'openai-compatible' })}
                    >
                      <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex flex-col items-start gap-0.5">
                        <span className="font-medium">OpenAI Compatible</span>
                        <span className="text-xs text-muted-foreground">适合兼容 OpenAI API 的服务</span>
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant={activeConfig.provider === 'gemini-native' ? 'secondary' : 'outline'}
                      className={cn(
                        'h-auto justify-start rounded-[var(--radius-md)] px-4 py-3 text-left',
                        activeConfig.provider === 'gemini-native' && 'border-primary/30 bg-primary/12 text-foreground',
                      )}
                      onClick={() => updateActiveConfig({ provider: 'gemini-native' })}
                    >
                      <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex flex-col items-start gap-0.5">
                        <span className="font-medium">Gemini Native</span>
                        <span className="text-xs text-muted-foreground">直接使用 Gemini 原生接口</span>
                      </span>
                    </Button>
                  </div>
                </section>
              </div>

              <TabsContent value={draft.activeModelId} className="mt-0 grid min-w-0 gap-4 outline-none">
                <section className={cardClassName} data-settings-section="connection">
                  <div className="mb-1 grid gap-1">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Connection</h3>
                    <p className="text-sm text-muted-foreground">更新当前模型的访问地址与密钥，不会影响另一组配置。</p>
                  </div>
                  <label className="grid gap-2">
                    <span className={fieldLabelClassName}>
                      <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      Base URL
                    </span>
                    <Input
                      type="text"
                      aria-label="Base URL"
                      value={activeConfig.baseUrl}
                      onChange={(event) => updateActiveConfig({ baseUrl: event.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className={inputClassName}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={fieldLabelClassName}>
                      <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      API Key
                    </span>
                    <Input
                      type="password"
                      aria-label="API Key"
                      value={activeConfig.apiKey}
                      onChange={(event) => updateActiveConfig({ apiKey: event.target.value })}
                      placeholder="sk-..."
                      className={inputClassName}
                    />
                  </label>
                </section>

                <section className={cardClassName} data-settings-section="parameters">
                  <div className="mb-1 grid gap-1">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Parameters</h3>
                    <p className="text-sm text-muted-foreground">模型名称和采样参数始终绑定到当前激活的模型页签。</p>
                  </div>
                  <label className="grid gap-2">
                    <span className={fieldLabelClassName}>
                      <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      Model
                    </span>
                    <Input
                      type="text"
                      aria-label="Model"
                      value={activeConfig.model}
                      onChange={(event) => updateActiveConfig({ model: event.target.value })}
                      placeholder="gpt-4o-mini"
                      className={inputClassName}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={fieldLabelClassName}>
                      <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      Temperature
                    </span>
                    <Input
                      type="number"
                      aria-label="Temperature"
                      step="0.1"
                      min="0"
                      max="2"
                      value={activeConfig.temperature}
                      onChange={(event) => updateActiveConfig({ temperature: Number(event.target.value) })}
                      className={inputClassName}
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border/50 bg-background/20 px-3 py-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={activeConfig.stream}
                      onChange={(event) => updateActiveConfig({ stream: event.target.checked })}
                      className="h-4 w-4 rounded border-input bg-transparent"
                    />
                    <span>启用流式输出 (Stream)</span>
                  </label>
                </section>
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex flex-col gap-4 border-t border-border/70 bg-background/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0 flex-1">
              {statusMessage ? (
                <span
                  role="status"
                  data-settings-status={isFailureStatus ? 'error' : 'success'}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium',
                    isFailureStatus
                      ? 'border-destructive/35 bg-destructive/12 text-destructive-foreground'
                      : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
                  )}
                >
                  {statusMessage}
                </span>
              ) : null}
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="rounded-[var(--radius-md)] px-4 shadow-none"
                onClick={() => void onTestConnection(activeConfig)}
                disabled={isTesting}
              >
                <Activity className="h-4 w-4" aria-hidden="true" />
                {isTesting ? '测试中...' : '测试连接'}
              </Button>
              <Button type="submit" className="rounded-[var(--radius-md)] px-4 shadow-none" disabled={isSaving}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {isSaving ? '保存中...' : '保存配置'}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </aside>
    </div>
  );
}
