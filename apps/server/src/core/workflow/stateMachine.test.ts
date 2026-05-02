import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildStandardModeContract } from './contracts/standardMode';
import {
  advanceWorkflowState,
  createWorkflowState,
  getCurrentWorkflowStep,
  jumpToWorkflowStep,
} from './stateMachine';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

describe('workflow state machine', () => {
  it('starts at the standard mode entry substep', () => {
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    expect(state.mode).toBe('standard');
    expect(state.currentModule).toBe('define');
    expect(state.currentStepId).toBe('define-direction');
    expect(state.currentSubstepId).toBe('direction-define');
    expect(state.pendingDecisionType).toBe('proposal_approval');
    expect(state.waitingForApproval).toBe(true);
    expect(state.returnTarget).toBeNull();
  });

  it('blocks advancement until the current substep is approved', () => {
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    const unchanged = advanceWorkflowState(contract, state, { approved: false });

    expect(unchanged.currentStepId).toBe('define-direction');
    expect(unchanged.currentSubstepId).toBe('direction-define');
    expect(unchanged.waitingForApproval).toBe(true);
  });

  it('advances into ideation setting draft after define approval', () => {
    const contract = buildStandardModeContract(skillPackPath);
    const state = createWorkflowState(contract);

    const next = advanceWorkflowState(contract, state, { approved: true });

    expect(next.currentStepId).toBe('ideation-build');
    expect(next.currentModule).toBe('ideation');
    expect(next.currentSubstepId).toBe('setting-draft');
    expect(next.pendingDecisionType).toBe('proposal_approval');
    expect(next.waitingForApproval).toBe(true);
  });

  it('moves through ideation and outline substeps before reaching write', () => {
    const contract = buildStandardModeContract(skillPackPath);
    let state = createWorkflowState(contract);

    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });

    expect(state.currentStepId).toBe('write-chapter');
    expect(state.currentSubstepId).toBe('chapter-draft');
    expect(state.waitingForApproval).toBe(true);
    expect(state.chapterNumber).toBe(1);
  });

  it('loops back to the next chapter write substep after review approval', () => {
    const contract = buildStandardModeContract(skillPackPath);
    let state = createWorkflowState(contract);

    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });
    state = advanceWorkflowState(contract, state, { approved: true });

    const currentStep = getCurrentWorkflowStep(contract, state);

    expect(state.currentStepId).toBe('write-chapter');
    expect(state.currentSubstepId).toBe('chapter-pause');
    expect(state.chapterNumber).toBe(1);
    expect(currentStep.allowedWrites).toContain('PROJECT.md');
  });

  it('materializes previous chapter context only from chapter 2 onward', () => {
    const contract = buildStandardModeContract(skillPackPath);
    const chapterOne = jumpToWorkflowStep(contract, createWorkflowState(contract), 'write-chapter', {
      substepId: 'chapter-draft',
      chapterNumber: 1,
    });
    const chapterTwo = jumpToWorkflowStep(contract, createWorkflowState(contract), 'write-chapter', {
      substepId: 'chapter-draft',
      chapterNumber: 2,
    });

    const stepOne = getCurrentWorkflowStep(contract, chapterOne);
    const stepTwo = getCurrentWorkflowStep(contract, chapterTwo);

    expect(stepOne.requiredProjectReads).not.toContain('4-正文/第000章_草稿.md');
    expect(stepOne.requiredProjectReads).not.toContain('4-正文/第001章_草稿.md');
    expect(stepTwo.requiredProjectReads).toContain('4-正文/第001章_草稿.md');
    expect(stepTwo.allowedWrites).toContain('4-正文/第002章_草稿.md');
  });

  it('returns to a stored target after an inserted review finishes', () => {
    const contract = buildStandardModeContract(skillPackPath);
    const baseState = createWorkflowState(contract);

    const reviewState = jumpToWorkflowStep(contract, baseState, 'review-chapter', {
      mode: 'standard',
      returnTarget: {
        mode: 'standard',
        stepId: 'outline-plan',
        substepId: 'chapter-outline',
        chapterNumber: 1,
      },
    });
    const next = advanceWorkflowState(contract, reviewState, { approved: true });

    expect(next.currentStepId).toBe('outline-plan');
    expect(next.currentSubstepId).toBe('chapter-outline');
    expect(next.returnTarget).toBeNull();
  });

  it('resolves setting review reads and writes without chapter materialization', () => {
    const contract = buildStandardModeContract(skillPackPath);
    const baseState = createWorkflowState(contract);

    const reviewState = jumpToWorkflowStep(contract, baseState, 'review-chapter', {
      mode: 'standard',
      substepId: 'setting-review',
      returnTarget: {
        mode: 'standard',
        stepId: 'ideation-build',
        substepId: 'character-draft',
        chapterNumber: 1,
      },
    });
    const currentStep = getCurrentWorkflowStep(contract, reviewState);

    expect(currentStep.allowedWrites).toContain('5-审查/设定审查报告.md');
    expect(currentStep.requiredProjectReads).toContain('2-设定/2.2_新书设定案.md');
    expect(currentStep.requiredProjectReads).not.toContain('4-正文/第001章_草稿.md');
  });
});
