import { describe, expect, it } from 'vitest';

async function loadAssistantErrorsModule() {
  const modulePath = './assistantErrors';
  return import(modulePath).catch(() => null);
}

describe('assistantErrors', () => {
  it('creates an assistant error when a model is required with typed metadata', async () => {
    const assistantErrors = await loadAssistantErrorsModule();

    expect(assistantErrors).not.toBeNull();
    if (assistantErrors === null) {
      return;
    }

    const error = assistantErrors.createAssistantModelRequiredError();

    expect(error).toMatchObject({
      name: 'AssistantGenerationError',
      code: 'proposal-model-required',
      statusCode: 503,
    });
    expect(assistantErrors.isAssistantGenerationError(error)).toBe(true);
    expect(assistantErrors.isAssistantGenerationError(new Error('nope'))).toBe(false);
  });

  it('serializes assistant network errors without changing the public error shape', async () => {
    const assistantErrors = await loadAssistantErrorsModule();

    expect(assistantErrors).not.toBeNull();
    if (assistantErrors === null) {
      return;
    }

    const cause = new Error('socket hang up');
    const error = assistantErrors.createAssistantNetworkError({
      provider: 'gemini-native',
      cause,
    });

    expect(error).toMatchObject({
      name: 'AssistantGenerationError',
      code: 'proposal-network-error',
      statusCode: 502,
      details: {
        provider: 'gemini-native',
        cause: 'socket hang up',
      },
    });
    expect(error.cause).toBe(cause);
  });
});
