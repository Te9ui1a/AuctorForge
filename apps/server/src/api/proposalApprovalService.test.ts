import { describe, expect, it, vi } from 'vitest';
import type { SessionResponse } from 'shared';

import { createProposalApprovalService } from './proposalApprovalService';

const session = {
  messages: [],
  workflow: null,
  discussionNotes: [],
  writeTargetHint: {
    strictWorkflowWrites: [],
    chatAllowedWrites: [],
    activeDocumentPath: null,
    hasPendingProposal: false,
  },
} satisfies SessionResponse;

describe('createProposalApprovalService', () => {
  it('returns the no-pending approval response when no proposal or decision is waiting', () => {
    const buildSessionResponse = vi.fn(() => session);
    const service = createProposalApprovalService({
      buildSessionResponse,
    });

    const response = service.handleNoPendingApproval({
      pendingProposal: null,
      pendingDecision: null,
    });

    expect(response).toEqual({
      reply: '当前没有待确认事项。请先描述你想推进的内容，我会先给出决策或提案。',
      session,
      pendingDecision: null,
      pendingProposal: null,
    });
    expect(buildSessionResponse).toHaveBeenCalledTimes(1);
  });

  it('passes through when an approval item is pending', () => {
    const buildSessionResponse = vi.fn(() => session);
    const service = createProposalApprovalService({
      buildSessionResponse,
    });

    expect(service.handleNoPendingApproval({
      pendingProposal: { id: 'proposal' },
      pendingDecision: null,
    })).toBeNull();
    expect(service.handleNoPendingApproval({
      pendingProposal: null,
      pendingDecision: { id: 'decision' },
    })).toBeNull();
    expect(buildSessionResponse).not.toHaveBeenCalled();
  });

  it('approves a pending decision by clearing approval state, advancing workflow, syncing, and returning the next step reply', async () => {
    const buildSessionResponse = vi.fn(() => session);
    const currentStep = {
      id: 'define-direction',
      title: '确定作品方向',
      substepId: null,
      substepTitle: null,
      nextStepId: 'ideation',
    };
    const nextStep = {
      id: 'ideation',
      title: '新书设定案',
      substepId: null,
      substepTitle: null,
      nextStepId: 'outline',
    };
    const getCurrentStep = vi.fn()
      .mockReturnValueOnce(currentStep)
      .mockReturnValueOnce(nextStep);
    const advanceWorkflowState = vi.fn(() => ({ id: 'advanced', volumeNumber: 1, chapterNumber: 2 }));
    const jumpToWorkflowTarget = vi.fn();
    const syncWorkflowFiles = vi.fn(async () => undefined);
    const service = createProposalApprovalService({
      buildSessionResponse,
      getCurrentStep,
      advanceWorkflowState,
      jumpToWorkflowTarget,
      syncWorkflowFiles,
    });
    const state = {
      projectRoot: '/project',
      workflowState: { id: 'before', volumeNumber: 1, chapterNumber: 1 },
      pendingProposal: { id: 'proposal' },
      pendingDecision: {
        reply: '确认进入下一步？',
        decisionType: 'substep_confirmation' as const,
      },
    };

    const response = await service.handlePendingDecisionApproval(state);

    expect(state).toMatchObject({
      workflowState: { id: 'advanced', volumeNumber: 1, chapterNumber: 2 },
      pendingProposal: null,
      pendingDecision: null,
    });
    expect(advanceWorkflowState).toHaveBeenCalledWith(
      { id: 'before', volumeNumber: 1, chapterNumber: 1 },
      { approved: true },
    );
    expect(jumpToWorkflowTarget).not.toHaveBeenCalled();
    expect(syncWorkflowFiles).toHaveBeenCalledWith({
      projectRoot: '/project',
      stepId: 'ideation',
      substepId: undefined,
      volumeNumber: 1,
      chapterNumber: 2,
    });
    expect(response).toEqual({
      reply: '已确认当前决策，并进入【新书设定案】。',
      session,
      pendingDecision: null,
      pendingProposal: null,
    });
  });

  it('approves a terminal pending decision without syncing when there is no return target', async () => {
    const buildSessionResponse = vi.fn(() => session);
    const getCurrentStep = vi.fn()
      .mockReturnValueOnce({
        id: 'final',
        title: '最终步骤',
        substepId: null,
        substepTitle: null,
        nextStepId: null,
      })
      .mockReturnValueOnce({
        id: 'final',
        title: '最终步骤',
        substepId: null,
        substepTitle: null,
        nextStepId: null,
      });
    const syncWorkflowFiles = vi.fn(async () => undefined);
    const service = createProposalApprovalService({
      buildSessionResponse,
      getCurrentStep,
      advanceWorkflowState: vi.fn(() => ({ id: 'advanced', volumeNumber: 1, chapterNumber: 1 })),
      jumpToWorkflowTarget: vi.fn(),
      syncWorkflowFiles,
    });
    const state = {
      projectRoot: '/project',
      workflowState: { id: 'before', volumeNumber: 1, chapterNumber: 1 },
      pendingProposal: null,
      pendingDecision: {
        reply: '确认完成？',
        decisionType: 'substep_confirmation' as const,
      },
    };

    const response = await service.handlePendingDecisionApproval(state);

    expect(syncWorkflowFiles).not.toHaveBeenCalled();
    expect(response).toEqual({
      reply: '已确认当前决策。',
      session,
      pendingDecision: null,
      pendingProposal: null,
    });
  });

  it('invalidates a pending proposal when a source read hash changed', async () => {
    const buildSessionResponse = vi.fn(() => session);
    const service = createProposalApprovalService({
      buildSessionResponse,
      readProjectFileIfExists: vi.fn(async () => 'changed source'),
      hashContent: vi.fn(() => 'current-hash'),
    });
    const state = {
      projectRoot: '/project',
      pendingProposal: { id: 'proposal' },
      pendingDecision: { id: 'decision' },
    };

    const response = await service.validatePendingProposalHashes(state, {
      sourceReads: [{ path: '1-边界/预期.md', baseHash: 'base-hash' }],
      proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', baseHash: null }],
    });

    expect(state).toEqual({
      projectRoot: '/project',
      pendingProposal: null,
      pendingDecision: null,
    });
    expect(response).toEqual({
      reply: '文件 1-边界/预期.md 在提案生成后已发生变化，当前提案已失效，请重新生成。',
      session,
      pendingDecision: null,
      pendingProposal: null,
    });
  });

  it('returns null when pending proposal source and write hashes still match', async () => {
    const buildSessionResponse = vi.fn(() => session);
    const readProjectFileIfExists = vi
      .fn()
      .mockResolvedValueOnce('same source')
      .mockResolvedValueOnce(null);
    const hashContent = vi.fn(() => 'source-hash');
    const service = createProposalApprovalService({
      buildSessionResponse,
      readProjectFileIfExists,
      hashContent,
    });
    const state = {
      projectRoot: '/project',
      pendingProposal: { id: 'proposal' },
      pendingDecision: null,
    };

    await expect(service.validatePendingProposalHashes(state, {
      sourceReads: [{ path: '1-边界/预期.md', baseHash: 'source-hash' }],
      proposedWrites: [{ path: '2-设定/2.1_创意脑暴.md', baseHash: null }],
    })).resolves.toBeNull();

    expect(state).toEqual({
      projectRoot: '/project',
      pendingProposal: { id: 'proposal' },
      pendingDecision: null,
    });
    expect(readProjectFileIfExists).toHaveBeenNthCalledWith(1, '/project', '1-边界/预期.md');
    expect(readProjectFileIfExists).toHaveBeenNthCalledWith(2, '/project', '2-设定/2.1_创意脑暴.md');
    expect(buildSessionResponse).not.toHaveBeenCalled();
  });
});
