export type WorkflowMode = 'standard' | 'guide' | 'analyze';

export type WorkflowModule = 'define' | 'guide' | 'analyze' | 'ideation' | 'outline' | 'write' | 'review';

export type PendingDecisionType = 'proposal_approval' | 'substep_confirmation';

export type WorkflowTransitionTarget = {
  stepId: string;
  substepId?: string;
  mode?: WorkflowMode;
  chapterNumber?: number;
  chapterDelta?: number;
  volumeNumber?: number;
  volumeDelta?: number;
};

export type WorkflowSubstep = {
  id: string;
  title: string;
  requiredProjectReads: string[];
  allowedWrites: string[];
  needsApproval: boolean;
  pendingDecisionType: PendingDecisionType | null;
  next: WorkflowTransitionTarget | null;
};

export type WorkflowStep = {
  id: string;
  module: WorkflowModule;
  title: string;
  requiredSkillAssetPaths: string[];
  entrySubstepId: string;
  substeps: WorkflowSubstep[];
};

export type WorkflowResolvedStep = {
  id: string;
  module: WorkflowModule;
  title: string;
  moduleTitle: string;
  substepId: string;
  substepTitle: string;
  requiredSkillAssetPaths: string[];
  requiredProjectReads: string[];
  allowedWrites: string[];
  needsApproval: boolean;
  pendingDecisionType: PendingDecisionType | null;
  nextTarget: WorkflowTransitionTarget | null;
  nextStepId: string | null;
  nextSubstepId: string | null;
};

export type WorkflowContract = {
  mode: 'standard';
  entryStepId: string;
  steps: WorkflowStep[];
};
