import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadSkillPack } from '../../vsix/loadSkillPack';
import { buildContractFromSkillPack } from './contractAdapter';

const skillPackPath = fileURLToPath(
  new URL('../../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

describe('buildContractFromSkillPack', () => {
  it('builds a workflow contract from the skill pack references', () => {
    const skillPack = loadSkillPack(skillPackPath);
    const contract = buildContractFromSkillPack(skillPack);

    expect(contract.mode).toBe('standard');
    expect(contract.entryStepId).toBe('define-direction');
    expect(contract.steps.map((step) => step.id)).toEqual([
      'define-direction',
      'guide-entry',
      'analyze-entry',
      'ideation-build',
      'outline-plan',
      'write-chapter',
      'review-chapter',
    ]);
  });

  it('fails fast when a required anchor is missing from a skill pack workflow document', () => {
    const skillPack = loadSkillPack(skillPackPath);
    const brokenSkillPack = {
      ...skillPack,
      modules: {
        ...skillPack.modules,
        guide: {
          ...skillPack.modules.guide,
          content: skillPack.modules.guide.content.replace('## 📂 模式 A: 带资进组', '## 模式 A 已丢失'),
        },
      },
    };

    expect(() => buildContractFromSkillPack(brokenSkillPack)).toThrow(
      'Workflow reference anchor missing: extension/assets/longformnovel/guide.md -> ## 📂 模式 A: 带资进组',
    );
  });
});
