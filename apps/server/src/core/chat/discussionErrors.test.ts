import { describe, expect, it } from 'vitest';

async function loadDiscussionErrorsModule() {
  const modulePath = './discussionErrors';
  return import(modulePath).catch(() => null);
}

describe('discussionErrors', () => {
  it('creates a discussion error for missing API keys with typed metadata', async () => {
    const discussionErrors = await loadDiscussionErrorsModule();

    expect(discussionErrors).not.toBeNull();
    if (discussionErrors === null) {
      return;
    }

    const error = discussionErrors.createDiscussionApiKeyMissingError();

    expect(error).toMatchObject({
      name: 'DiscussionGenerationError',
      code: 'discussion-api-key-missing',
      statusCode: 503,
    });
    expect(discussionErrors.isDiscussionGenerationError(error)).toBe(true);
    expect(discussionErrors.isDiscussionGenerationError(new Error('nope'))).toBe(false);
  });

  it('creates a discussion error for upstream failures with serializable details', async () => {
    const discussionErrors = await loadDiscussionErrorsModule();

    expect(discussionErrors).not.toBeNull();
    if (discussionErrors === null) {
      return;
    }

    const error = discussionErrors.createDiscussionUpstreamResponseError({
      provider: 'openai-compatible',
      status: 502,
    });

    expect(error).toMatchObject({
      name: 'DiscussionGenerationError',
      code: 'discussion-upstream-response',
      statusCode: 502,
      details: {
        provider: 'openai-compatible',
        status: 502,
      },
    });
  });

  it('serializes discussion network errors without changing the public error shape', async () => {
    const discussionErrors = await loadDiscussionErrorsModule();

    expect(discussionErrors).not.toBeNull();
    if (discussionErrors === null) {
      return;
    }

    const cause = new Error('gateway timeout');
    const error = discussionErrors.createDiscussionNetworkError({
      provider: 'openai-compatible',
      cause,
    });

    expect(error).toMatchObject({
      name: 'DiscussionGenerationError',
      code: 'discussion-network-error',
      statusCode: 502,
      details: {
        provider: 'openai-compatible',
        cause: 'gateway timeout',
      },
    });
    expect(error.cause).toBe(cause);
  });
});
