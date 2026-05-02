import { useCallback, useEffect, useMemo, useState } from 'react';

export type ModelProvider = 'openai-compatible' | 'gemini-native';

export type ModelSettings = {
  provider: ModelProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  stream: boolean;
};

export type ModelSettingsStore = {
  activeModelId: 'primary' | 'secondary';
  models: {
    primary: ModelSettings;
    secondary: ModelSettings;
  };
};

const defaultConfig: ModelSettings = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  stream: true,
};

export const defaultSettingsStore: ModelSettingsStore = {
  activeModelId: 'primary',
  models: {
    primary: { ...defaultConfig },
    secondary: { ...defaultConfig, model: 'gpt-4.1-mini' },
  },
};

function normalizeSettingsStore(input: Partial<ModelSettingsStore & ModelSettings>): ModelSettingsStore {
  function normalizeProvider(config: ModelSettings): ModelSettings {
    if (/generativelanguage\.googleapis\.com/i.test(config.baseUrl)) {
      return {
        ...config,
        provider: 'gemini-native',
      };
    }

    return config;
  }

  if ('models' in input && input.models) {
    const merged = {
      ...defaultSettingsStore,
      ...input,
      models: {
        ...defaultSettingsStore.models,
        ...input.models,
      },
    };

    return {
      ...merged,
      models: {
        primary: normalizeProvider(merged.models.primary),
        secondary: normalizeProvider(merged.models.secondary),
      },
    };
  }

  return {
    ...defaultSettingsStore,
    models: {
      ...defaultSettingsStore.models,
      primary: normalizeProvider({
        ...defaultSettingsStore.models.primary,
        ...(input as Partial<ModelSettings>),
      }),
    },
  };
}

export function useModelSettings() {
  const [settings, setSettings] = useState<ModelSettingsStore>(defaultSettingsStore);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState('');

  const config = useMemo(() => settings.models[settings.activeModelId], [settings]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/model');
      if (!response.ok) {
        setMessage('模型配置读取失败，已使用默认配置');
        setSettings(defaultSettingsStore);
        return;
      }

      const data = (await response.json()) as Partial<ModelSettingsStore & ModelSettings>;
      setSettings(normalizeSettingsStore(data));
    } catch {
      setMessage('模型配置读取失败，已使用默认配置');
      setSettings(defaultSettingsStore);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (nextSettings: ModelSettingsStore) => {
    setIsSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/settings/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      });
      if (!response.ok) {
        setMessage('模型配置保存失败');
        return;
      }

      const data = (await response.json()) as ModelSettingsStore;
      setSettings(data);
      setMessage('模型配置已保存');
    } catch {
      setMessage('模型配置保存失败');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const testConnection = useCallback(async (configToTest: ModelSettings) => {
    setIsTesting(true);
    setMessage('');
    try {
      const response = await fetch('/api/settings/model/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToTest),
      });
      const data = (await response.json()) as { ok: boolean; message: string };
      setMessage(data.message);
    } catch {
      setMessage('模型连接测试失败');
    } finally {
      setIsTesting(false);
    }
  }, []);

  return {
    settings,
    config,
    isLoading,
    isSaving,
    isTesting,
    message,
    save,
    testConnection,
    refresh,
  };
}
