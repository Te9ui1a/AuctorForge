import { describe, expect, it } from 'vitest';

import {
  buildChatGenerationErrorResponse,
  normalizeChatMode,
  normalizeRequestId,
} from './chatRouteHelpers';

const session = {
  initialized: true,
  currentStepId: 'define',
  currentModule: 'define',
  currentStepTitle: 'Define',
  waitingForApproval: false,
};

describe('chatRouteHelpers', () => {
  it('normalizes chat mode and request ids for chat route entrypoints', () => {
    expect(normalizeChatMode('plan')).toBe('plan');
    expect(normalizeChatMode('write')).toBe('write');
    expect(normalizeChatMode('auto')).toBe('auto');
    expect(normalizeChatMode('unexpected')).toBe('auto');
    expect(normalizeRequestId(' turn-1 ')).toBe('turn-1');
    expect(normalizeRequestId('   ')).toBeNull();
    expect(normalizeRequestId(undefined)).toBeNull();
  });

  it('builds a stable chat generation error payload', () => {
    expect(buildChatGenerationErrorResponse({
      code: 'proposal-network-error',
      message: '模型服务异常',
      details: { provider: 'openai' },
      session,
    })).toEqual({
      error: {
        code: 'proposal-network-error',
        message: '模型服务异常',
        details: { provider: 'openai' },
      },
      session,
      pendingProposal: null,
    });
  });
});
