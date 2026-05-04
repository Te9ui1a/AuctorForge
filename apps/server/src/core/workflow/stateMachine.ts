import type {
  WorkflowContract,
  WorkflowMode,
  WorkflowResolvedStep,
  WorkflowStep,
  WorkflowSubstep,
  WorkflowTransitionTarget,
} from './contracts/types';
import {
  PREVIOUS_CHAPTER_TOKEN,
  chapterDraftPath,
  chapterFinalPath,
  chapterReviewPath,
  previousChapterDraftPath,
  VOLUME_CHAPTER_OUTLINE_PATH,
  VOLUME_OUTLINE_PATH,
} from '../paths/projectPaths';
import { DEFAULT_VOLUME_NUMBER, normalizeVolumeNumber } from '../paths/volumeContext';

export type WorkflowReturnTarget = {
  mode: WorkflowMode;
  stepId: string;
  substepId: string;
  chapterNumber: number;
  volumeNumber: number;
};

export type WorkflowState = {
  mode: WorkflowMode;
  currentModule: WorkflowStep['module'];
  currentStepId: string;
  currentSubstepId: string;
  waitingForApproval: boolean;
  pendingDecisionType: WorkflowResolvedStep['pendingDecisionType'];
  chapterNumber: number;
  volumeNumber: number;
  returnTarget: WorkflowReturnTarget | null;
};

type AdvanceOptions = {
  approved: boolean;
};

type JumpOptions = {
  mode?: WorkflowMode;
  substepId?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  returnTarget?: WorkflowReturnTarget | null;
};

export function createWorkflowState(contract: WorkflowContract): WorkflowState {
  const step = getStep(contract, contract.entryStepId);
  const substep = getSubstep(step, step.entrySubstepId);

  return {
    mode: contract.mode,
    currentModule: step.module,
    currentStepId: step.id,
    currentSubstepId: substep.id,
    waitingForApproval: substep.needsApproval,
    pendingDecisionType: substep.pendingDecisionType,
    chapterNumber: 1,
    volumeNumber: DEFAULT_VOLUME_NUMBER,
    returnTarget: null,
  };
}

export function advanceWorkflowState(
  contract: WorkflowContract,
  currentState: WorkflowState,
  options: AdvanceOptions,
): WorkflowState {
  const currentStep = getCurrentWorkflowStep(contract, currentState);

  if (currentStep.needsApproval && !options.approved) {
    return currentState;
  }

  if (currentState.returnTarget) {
      return jumpToWorkflowStep(contract, currentState, currentState.returnTarget.stepId, {
        mode: currentState.returnTarget.mode,
        substepId: currentState.returnTarget.substepId,
        chapterNumber: currentState.returnTarget.chapterNumber,
        volumeNumber: currentState.returnTarget.volumeNumber,
        returnTarget: null,
      });
  }

  if (!currentStep.nextTarget) {
    return {
      ...currentState,
      waitingForApproval: currentStep.needsApproval,
      pendingDecisionType: currentStep.pendingDecisionType,
    };
  }

  return jumpToWorkflowTarget(contract, currentState, currentStep.nextTarget);
}

export function getCurrentWorkflowStep(contract: WorkflowContract, state: WorkflowState): WorkflowResolvedStep {
  const step = getStep(contract, state.currentStepId);
  const substep = getSubstep(step, state.currentSubstepId);
  const requiredProjectReads = materializeWorkflowPaths(step.module, substep.requiredProjectReads, state.volumeNumber, state.chapterNumber);
  const allowedWrites = materializeWorkflowPaths(step.module, substep.allowedWrites, state.volumeNumber, state.chapterNumber);

  return {
    id: step.id,
    module: step.module,
    title: step.title,
    moduleTitle: step.title,
    substepId: substep.id,
    substepTitle: substep.title,
    requiredSkillAssetPaths: step.requiredSkillAssetPaths,
    requiredProjectReads,
    allowedWrites,
    needsApproval: substep.needsApproval,
    pendingDecisionType: substep.pendingDecisionType,
    nextTarget: substep.next,
    nextStepId: substep.next?.stepId ?? null,
    nextSubstepId: substep.next?.substepId ?? null,
  };
}

export function jumpToWorkflowStep(
  contract: WorkflowContract,
  state: WorkflowState,
  stepId: string,
  options: JumpOptions = {},
): WorkflowState {
  const step = getStep(contract, stepId);
  const substep = getSubstep(step, options.substepId ?? step.entrySubstepId);

  return {
    mode: options.mode ?? inferModeFromStep(step),
    currentModule: step.module,
    currentStepId: step.id,
    currentSubstepId: substep.id,
    waitingForApproval: substep.needsApproval,
    pendingDecisionType: substep.pendingDecisionType,
    chapterNumber: options.chapterNumber ?? state.chapterNumber,
    volumeNumber: options.volumeNumber ?? state.volumeNumber,
    returnTarget: options.returnTarget ?? null,
  };
}

export function jumpToWorkflowTarget(
  contract: WorkflowContract,
  state: WorkflowState,
  target: WorkflowTransitionTarget,
  options: { returnTarget?: WorkflowReturnTarget | null } = {},
) {
  const chapterNumber = target.chapterNumber ?? state.chapterNumber + (target.chapterDelta ?? 0);
  const volumeNumber = target.volumeNumber ?? state.volumeNumber + (target.volumeDelta ?? 0);

  return jumpToWorkflowStep(contract, state, target.stepId, {
    mode: target.mode,
    substepId: target.substepId,
    chapterNumber,
    volumeNumber,
    returnTarget: options.returnTarget ?? null,
  });
}

function getStep(contract: WorkflowContract, stepId: string): WorkflowStep {
  const step = contract.steps.find((candidate) => candidate.id === stepId);

  if (!step) {
    throw new Error(`Workflow step not found: ${stepId}`);
  }

  return step;
}

function getSubstep(step: WorkflowStep, substepId: string): WorkflowSubstep {
  const substep = step.substeps.find((candidate) => candidate.id === substepId);

  if (!substep) {
    throw new Error(`Workflow substep not found: ${step.id}:${substepId}`);
  }

  return substep;
}

function inferModeFromStep(step: WorkflowStep): WorkflowMode {
  if (step.module === 'guide') {
    return 'guide';
  }

  if (step.module === 'analyze') {
    return 'analyze';
  }

  return 'standard';
}

function materializeWorkflowPaths(module: WorkflowStep['module'], filePaths: string[], volumeNumber: number, chapterNumber: number) {
  if (!['outline', 'write', 'review'].includes(module)) {
    return filePaths;
  }

  return filePaths.flatMap((filePath) => {
    const materialized = materializeChapterPath(filePath, volumeNumber, chapterNumber);
    return materialized ? [materialized] : [];
  });
}

function materializeChapterPath(filePath: string, volumeNumber: number, chapterNumber: number) {
  if (filePath === `4-正文/${PREVIOUS_CHAPTER_TOKEN}草稿.md`) {
    return previousChapterDraftPath(chapterNumber);
  }

  return filePath
    .replace(VOLUME_OUTLINE_PATH(1), VOLUME_OUTLINE_PATH(volumeNumber))
    .replace(VOLUME_CHAPTER_OUTLINE_PATH(1), VOLUME_CHAPTER_OUTLINE_PATH(volumeNumber))
    .replace(chapterDraftPath(1), chapterDraftPath(chapterNumber))
    .replace(chapterFinalPath(1), chapterFinalPath(chapterNumber))
    .replace(chapterReviewPath(1), chapterReviewPath(chapterNumber));
}
