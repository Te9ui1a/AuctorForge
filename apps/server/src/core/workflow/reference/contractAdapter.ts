import type { SkillPack } from '../../vsix/loadSkillPack';
import type { WorkflowContract } from '../contracts/types';
import { buildWorkflowContractFromPatterns, buildWorkflowStepFromReference } from './stepPatterns';

export function buildContractFromSkillPack(skillPack: SkillPack): WorkflowContract {
  const patternContract = buildWorkflowContractFromPatterns();

  for (const reference of patternContract.references) {
    const moduleAsset = Object.values(skillPack.modules).find((asset) => asset.entryPath === reference.entryPath);

    if (!moduleAsset) {
      throw new Error(`Workflow reference missing module asset: ${reference.entryPath}`);
    }

    for (const anchor of reference.requiredAnchors) {
      if (!moduleAsset.content.includes(anchor)) {
        throw new Error(`Workflow reference anchor missing: ${reference.entryPath} -> ${anchor}`);
      }
    }
  }

  return {
    mode: patternContract.mode,
    entryStepId: patternContract.entryStepId,
    steps: patternContract.references.map(buildWorkflowStepFromReference),
  };
}
