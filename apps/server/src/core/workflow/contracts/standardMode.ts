import { loadSkillPack } from '../../vsix/loadSkillPack';
import { buildContractFromSkillPack } from '../reference/contractAdapter';
import type { WorkflowContract } from './types';

export function buildStandardModeContract(skillPackPath: string): WorkflowContract {
  const skillPack = loadSkillPack(skillPackPath);

  return buildContractFromSkillPack(skillPack);
}
