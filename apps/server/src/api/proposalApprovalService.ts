import type { SessionResponse } from 'shared';

export type ApprovalPendingState<TPendingProposal, TPendingDecision> = {
  pendingProposal: TPendingProposal | null;
  pendingDecision: TPendingDecision | null;
};

export type ApprovalTurnResponse<TPendingProposal, TPendingDecision> = {
  reply: string;
  session: SessionResponse;
  pendingDecision: TPendingDecision | null;
  pendingProposal: TPendingProposal | null;
};

type PendingDecisionApproval = {
  nextTarget?: unknown;
  returnTarget?: unknown;
};

type PendingProposalApproval = {
  sourceReads: Array<{
    path: string;
    baseHash: string | null;
  }>;
  proposedWrites: Array<{
    path: string;
    baseHash: string | null;
  }>;
};

type PendingDecisionApprovalState<TPendingProposal, TPendingDecision, TWorkflowState> =
  ApprovalPendingState<TPendingProposal, TPendingDecision> & {
    projectRoot: string;
    workflowState: TWorkflowState;
  };

type WorkflowStepLike = {
  id: string;
  title: string;
  substepId?: string;
  substepTitle?: string;
  nextStepId: string | null;
};

type SyncWorkflowFilesArgs = {
  projectRoot: string;
  stepId: string;
  substepId: string | undefined;
  volumeNumber: number;
  chapterNumber: number;
};

export function createProposalApprovalService<TPendingProposal, TPendingDecision extends PendingDecisionApproval, TWorkflowState>({
  buildSessionResponse,
  getCurrentStep,
  advanceWorkflowState,
  jumpToWorkflowTarget,
  syncWorkflowFiles,
  readProjectFileIfExists,
  hashContent,
}: {
  buildSessionResponse: () => SessionResponse;
  getCurrentStep?: () => WorkflowStepLike;
  advanceWorkflowState?: (workflowState: TWorkflowState, event: { approved: true }) => TWorkflowState;
  jumpToWorkflowTarget?: (
    workflowState: TWorkflowState,
    nextTarget: NonNullable<TPendingDecision['nextTarget']>,
    options: { returnTarget: TPendingDecision['returnTarget'] | null },
  ) => TWorkflowState;
  syncWorkflowFiles?: (args: SyncWorkflowFilesArgs) => Promise<void>;
  readProjectFileIfExists?: (projectRoot: string, relativePath: string) => Promise<string | null>;
  hashContent?: (content: string) => string;
}) {
  function requirePendingDecisionDependencies() {
    if (!getCurrentStep || !advanceWorkflowState || !jumpToWorkflowTarget || !syncWorkflowFiles) {
      throw new Error('Pending decision approval dependencies are not configured.');
    }

    return {
      getCurrentStep,
      advanceWorkflowState,
      jumpToWorkflowTarget,
      syncWorkflowFiles,
    };
  }

  return {
    handleNoPendingApproval(
      state: ApprovalPendingState<TPendingProposal, TPendingDecision>,
    ): ApprovalTurnResponse<TPendingProposal, TPendingDecision> | null {
      if (state.pendingProposal || state.pendingDecision) {
        return null;
      }

      return {
        reply: '当前没有待确认事项。请先描述你想推进的内容，我会先给出决策或提案。',
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    },

    async handlePendingDecisionApproval(
      state: PendingDecisionApprovalState<TPendingProposal, TPendingDecision, TWorkflowState>,
    ): Promise<ApprovalTurnResponse<TPendingProposal, TPendingDecision> | null> {
      const approvedDecision = state.pendingDecision;
      if (!approvedDecision) {
        return null;
      }

      const deps = requirePendingDecisionDependencies();
      const currentStep = deps.getCurrentStep();
      state.pendingDecision = null;
      state.pendingProposal = null;

      const returnsToContext = approvedDecision.returnTarget !== undefined && approvedDecision.returnTarget !== null;

      state.workflowState = approvedDecision.nextTarget
        ? deps.jumpToWorkflowTarget(state.workflowState, approvedDecision.nextTarget, {
            returnTarget: approvedDecision.returnTarget ?? null,
          })
        : deps.advanceWorkflowState(state.workflowState, { approved: true });

      const nextStep = deps.getCurrentStep();
      const workflowStateWithPointers = state.workflowState as TWorkflowState & {
        volumeNumber: number;
        chapterNumber: number;
      };

      if (!approvedDecision.nextTarget && currentStep.nextStepId === null) {
        if (returnsToContext) {
          await deps.syncWorkflowFiles({
            projectRoot: state.projectRoot,
            stepId: nextStep.id,
            substepId: nextStep.substepId ?? undefined,
            volumeNumber: workflowStateWithPointers.volumeNumber,
            chapterNumber: workflowStateWithPointers.chapterNumber,
          });

          return {
            reply: `已确认当前决策，并返回【${nextStep.title}】。`,
            session: buildSessionResponse(),
            pendingDecision: null,
            pendingProposal: null,
          };
        }

        return {
          reply: '已确认当前决策。',
          session: buildSessionResponse(),
          pendingDecision: null,
          pendingProposal: null,
        };
      }

      await deps.syncWorkflowFiles({
        projectRoot: state.projectRoot,
        stepId: nextStep.id,
        substepId: nextStep.substepId ?? undefined,
        volumeNumber: workflowStateWithPointers.volumeNumber,
        chapterNumber: workflowStateWithPointers.chapterNumber,
      });

      const nextStepLabel = nextStep.substepId === 'chapter-pause' ? nextStep.substepTitle : nextStep.title;

      return {
        reply: `已确认当前决策，并进入【${nextStepLabel}】。`,
        session: buildSessionResponse(),
        pendingDecision: null,
        pendingProposal: null,
      };
    },

    async validatePendingProposalHashes(
      state: ApprovalPendingState<TPendingProposal, TPendingDecision> & { projectRoot: string },
      proposal: PendingProposalApproval,
    ): Promise<ApprovalTurnResponse<TPendingProposal, TPendingDecision> | null> {
      if (!readProjectFileIfExists || !hashContent) {
        throw new Error('Pending proposal hash validation dependencies are not configured.');
      }

      for (const sourceRead of proposal.sourceReads) {
        const currentContent = await readProjectFileIfExists(state.projectRoot, sourceRead.path);
        const currentHash = currentContent === null ? null : hashContent(currentContent);

        if (currentHash !== sourceRead.baseHash) {
          state.pendingProposal = null;
          state.pendingDecision = null;
          return {
            reply: `文件 ${sourceRead.path} 在提案生成后已发生变化，当前提案已失效，请重新生成。`,
            session: buildSessionResponse(),
            pendingDecision: null,
            pendingProposal: null,
          };
        }
      }

      for (const proposedWrite of proposal.proposedWrites) {
        const currentContent = await readProjectFileIfExists(state.projectRoot, proposedWrite.path);
        const currentHash = currentContent === null ? null : hashContent(currentContent);

        if (currentHash !== proposedWrite.baseHash) {
          state.pendingProposal = null;
          state.pendingDecision = null;
          return {
            reply: `文件 ${proposedWrite.path} 在提案生成后已发生变化，当前提案已失效，请重新生成。`,
            session: buildSessionResponse(),
            pendingDecision: null,
            pendingProposal: null,
          };
        }
      }

      return null;
    },
  };
}
