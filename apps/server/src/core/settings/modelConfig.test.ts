import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultModelSettings,
  ModelSettingsValidationError,
  parseModelConfig,
  parseModelSettings,
  readActiveModelConfig,
  readModelSettings,
  resolveModelConfigPath,
  testModelConfigConnection,
  writeModelSettings,
} from './modelConfig';

const tempDirs: string[] = [];

async function makeConfigDir() {
  const directory = await mkdtemp(path.join(tmpdir(), 'novel-flow-config-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('modelConfig', () => {
  it.each([
    [
      'unknown active model id',
      {
        activeModelId: 'missing',
        models: {
          primary: defaultModelSettings().models.primary,
          secondary: defaultModelSettings().models.secondary,
        },
      },
    ],
    [
      'missing nested model config',
      {
        activeModelId: 'primary',
        models: {
          primary: defaultModelSettings().models.primary,
        },
      },
    ],
    [
      'invalid provider',
      {
        ...defaultModelSettings(),
        models: {
          ...defaultModelSettings().models,
          primary: {
            ...defaultModelSettings().models.primary,
            provider: 'anthropic',
          },
        },
      },
    ],
    [
      'invalid base URL',
      {
        ...defaultModelSettings(),
        models: {
          ...defaultModelSettings().models,
          primary: {
            ...defaultModelSettings().models.primary,
            baseUrl: 'not a url',
          },
        },
      },
    ],
    [
      'non-finite temperature',
      {
        ...defaultModelSettings(),
        models: {
          ...defaultModelSettings().models,
          primary: {
            ...defaultModelSettings().models.primary,
            temperature: Number.POSITIVE_INFINITY,
          },
        },
      },
    ],
  ])('rejects invalid model settings with %s', (_description, payload) => {
    expect(() => parseModelSettings(payload)).toThrow(ModelSettingsValidationError);
    expect(() => parseModelSettings(payload)).toThrow(/model settings/i);
  });

  it('returns parsed model settings for valid payloads', () => {
    const settings = {
      activeModelId: 'secondary' as const,
      models: {
        primary: {
          provider: 'openai-compatible' as const,
          baseUrl: 'https://example.com/v1',
          apiKey: 'secret-key-a',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          stream: true,
        },
        secondary: {
          provider: 'gemini-native' as const,
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          apiKey: 'secret-key-b',
          model: 'gemini-2.5-pro',
          temperature: 0.3,
          stream: true,
        },
      },
    };

    expect(parseModelSettings(settings)).toEqual(settings);
  });

  it('returns null when no config exists', async () => {
    const directory = await makeConfigDir();

    await expect(readModelSettings(directory)).resolves.toBeNull();
  });

  it('writes and reads the saved dual-model settings', async () => {
    const directory = await makeConfigDir();
    const settings = {
      activeModelId: 'secondary' as const,
      models: {
        primary: {
          provider: 'openai-compatible' as const,
          baseUrl: 'https://example.com/v1',
          apiKey: 'secret-key-a',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          stream: true,
        },
        secondary: {
          provider: 'gemini-native' as const,
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          apiKey: 'secret-key-b',
          model: 'gemini-2.5-pro',
          temperature: 0.3,
          stream: true,
        },
      },
    };

    await writeModelSettings(directory, settings);

    await expect(readModelSettings(directory)).resolves.toEqual(settings);
    await expect(readActiveModelConfig(directory)).resolves.toEqual(settings.models.secondary);
    await expect(readFile(resolveModelConfigPath(directory), 'utf8')).resolves.toContain('secret-key-a');
  });

  it('migrates a legacy single-model config into the new dual-model shape', async () => {
    const directory = await makeConfigDir();
    const legacy = {
      provider: 'openai-compatible' as const,
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret-key',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      stream: true,
    };

    await mkdir(path.dirname(resolveModelConfigPath(directory)), { recursive: true });
    await writeFile(resolveModelConfigPath(directory), JSON.stringify(legacy), 'utf8');

    await expect(readModelSettings(directory)).resolves.toEqual({
      ...defaultModelSettings(),
      models: {
        ...defaultModelSettings().models,
        primary: legacy,
      },
    });
  });

  it('returns null when persisted dual-model settings fail schema validation', async () => {
    const directory = await makeConfigDir();

    await mkdir(path.dirname(resolveModelConfigPath(directory)), { recursive: true });
    await writeFile(
      resolveModelConfigPath(directory),
      JSON.stringify({
        activeModelId: 'missing',
        models: {
          primary: defaultModelSettings().models.primary,
          secondary: defaultModelSettings().models.secondary,
        },
      }),
      'utf8',
    );

    await expect(readModelSettings(directory)).resolves.toBeNull();
    await expect(readActiveModelConfig(directory)).resolves.toBeNull();
  });

  it('validates single model configs before test requests use them', () => {
    expect(() => parseModelConfig({ provider: 'openai-compatible' })).toThrow(ModelSettingsValidationError);
  });

  it('tests gemini-native connectivity with query-param auth instead of bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const config = {
      provider: 'gemini-native' as const,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
      apiKey: 'gem-key',
      model: 'gemini-2.5-pro',
      temperature: 0.5,
      stream: true,
    };

    await expect(testModelConfigConnection(config)).resolves.toEqual({ ok: true, message: '连接成功' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models?key=gem-key',
      { method: 'GET' },
    );
  });

  it('includes upstream error details in the returned connection message when available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'User location is not supported for the API use.',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testModelConfigConnection({
      provider: 'gemini-native',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gem-key',
      model: 'gemini-2.5-pro',
      temperature: 0.5,
      stream: true,
    });

    expect(result).toEqual({
      ok: false,
      message: '连接失败：400（User location is not supported for the API use.）',
    });
  });
});
