import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import type { ModelConfig, ModelSettingsStore } from 'shared';

export type { ModelConfig, ModelProvider, ModelSettingsStore } from 'shared';

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  stream: true,
};

const modelConfigSchema = z.object({
  provider: z.enum(['openai-compatible', 'gemini-native']),
  baseUrl: z.string().url(),
  apiKey: z.string(),
  model: z.string().trim().min(1),
  temperature: z.number().finite().min(0).max(2),
  stream: z.boolean(),
});

const modelSettingsSchema = z.object({
  activeModelId: z.enum(['primary', 'secondary']),
  models: z.object({
    primary: modelConfigSchema,
    secondary: modelConfigSchema,
  }),
});

export class ModelSettingsValidationError extends Error {
  constructor(message = 'Model settings payload is invalid.') {
    super(message);
    this.name = 'ModelSettingsValidationError';
  }
}

export function resolveModelConfigPath(baseDir = homedir()) {
  return path.join(baseDir, '.novel-flow-webui', 'config.json');
}

export function defaultModelConfig(): ModelConfig {
  return { ...DEFAULT_MODEL_CONFIG };
}

export function defaultModelSettings(): ModelSettingsStore {
  return {
    activeModelId: 'primary',
    models: {
      primary: defaultModelConfig(),
      secondary: {
        ...defaultModelConfig(),
        model: 'gpt-4.1-mini',
      },
    },
  };
}

export function parseModelSettings(value: unknown): ModelSettingsStore {
  const result = modelSettingsSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues[0]?.message;
    throw new ModelSettingsValidationError(
      detail ? `Model settings payload is invalid: ${detail}` : 'Model settings payload is invalid.',
    );
  }

  return result.data;
}

export function parseModelConfig(value: unknown): ModelConfig {
  const result = modelConfigSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues[0]?.message;
    throw new ModelSettingsValidationError(
      detail ? `Model config payload is invalid: ${detail}` : 'Model config payload is invalid.',
    );
  }

  return result.data;
}

function normalizeProvider(config: ModelConfig): ModelConfig {
  if (/generativelanguage\.googleapis\.com/i.test(config.baseUrl)) {
    return {
      ...config,
      provider: 'gemini-native',
    };
  }

  return config;
}

export async function readModelSettings(baseDir = homedir()): Promise<ModelSettingsStore | null> {
  try {
    const content = await readFile(resolveModelConfigPath(baseDir), 'utf8');
    const parsed = JSON.parse(content) as Partial<ModelSettingsStore & ModelConfig>;

    if ('models' in parsed) {
      const merged = {
        ...defaultModelSettings(),
        ...parsed,
        models: {
          ...defaultModelSettings().models,
          ...(parsed.models ?? {}),
        },
      };

      return parseModelSettings({
        ...merged,
        models: {
          primary: normalizeProvider(merged.models.primary),
          secondary: normalizeProvider(merged.models.secondary),
        },
      });
    }

    return parseModelSettings({
      ...defaultModelSettings(),
      models: {
        ...defaultModelSettings().models,
        primary: normalizeProvider({
          ...defaultModelConfig(),
          ...(parsed as Partial<ModelConfig>),
        }),
      },
    });
  } catch {
    return null;
  }
}

export async function readActiveModelConfig(baseDir = homedir()): Promise<ModelConfig | null> {
  const settings = await readModelSettings(baseDir);
  if (!settings) {
    return null;
  }

  return settings.models[settings.activeModelId];
}

export async function writeModelSettings(baseDir: string, settings: ModelSettingsStore) {
  const parsedSettings = parseModelSettings(settings);
  const filePath = resolveModelConfigPath(baseDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(parsedSettings, null, 2), { encoding: 'utf8', mode: 0o600 });
  return parsedSettings;
}

export async function testModelConfigConnection(config: ModelConfig) {
  const parsedConfig = parseModelConfig(config);

  if (parsedConfig.provider === 'gemini-native') {
    const response = await fetch(`${parsedConfig.baseUrl.replace(/\/$/, '')}/models?key=${encodeURIComponent(parsedConfig.apiKey)}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      return {
        ok: false,
        message: detail ? `连接失败：${response.status}（${detail}）` : `连接失败：${response.status}`,
      };
    }

    return {
      ok: true,
      message: '连接成功',
    };
  }

  const response = await fetch(`${parsedConfig.baseUrl.replace(/\/$/, '')}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${parsedConfig.apiKey}`,
    },
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    return {
      ok: false,
      message: detail ? `连接失败：${response.status}（${detail}）` : `连接失败：${response.status}`,
    };
  }

  return {
    ok: true,
    message: '连接成功',
  };
}

async function readErrorDetail(response: Response) {
  try {
    const data = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };

    return data.error?.message ?? data.message ?? '';
  } catch {
    return '';
  }
}
