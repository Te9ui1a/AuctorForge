import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildStandardModeContract } from './standardMode';

const skillPackPath = fileURLToPath(
  new URL('../../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

describe('buildStandardModeContract', () => {
  it('maps the standard mode into an approval-gated workflow contract', () => {
    const contract = buildStandardModeContract(skillPackPath);

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

    expect(contract.steps[0]).toMatchObject({
      module: 'define',
      requiredSkillAssetPaths: ['extension/assets/longformnovel/define.md'],
      entrySubstepId: 'direction-define',
    });
    expect(contract.steps[0].substeps).toHaveLength(1);
    expect(contract.steps[0].substeps[0]).toMatchObject({
      id: 'direction-define',
      allowedWrites: ['2-设定/2.1_创意脑暴.md', '1-边界/1.2_文风.md', 'PROJECT.md'],
      needsApproval: true,
      next: { stepId: 'ideation-build', substepId: 'setting-draft', mode: 'standard' },
    });

    expect(contract.steps[1]).toMatchObject({
      module: 'guide',
      requiredSkillAssetPaths: ['extension/assets/longformnovel/guide.md'],
      entrySubstepId: 'choose-guide-mode',
    });
    expect(contract.steps[1].substeps.map((substep) => substep.id)).toEqual([
      'choose-guide-mode',
      'scan-assets',
      'choose-entry-focus',
      'character-first',
      'idea-first',
      'draft-first',
    ]);

    expect(contract.steps[2]).toMatchObject({
      module: 'analyze',
      requiredSkillAssetPaths: ['extension/assets/longformnovel/analyze.md'],
      entrySubstepId: 'prepare-sample-book',
    });
    expect(contract.steps[2].substeps.map((substep) => substep.id)).toEqual([
      'prepare-sample-book',
      'choose-summary-mode',
      'await-env-confirmation',
      'style-analysis',
      'trope-analysis',
      'framework-analysis',
      'micro-analysis',
      'custom-analysis',
    ]);

    expect(contract.steps[3]).toMatchObject({
      module: 'ideation',
      entrySubstepId: 'setting-draft',
    });
    expect(contract.steps[3].substeps.map((substep) => substep.id)).toEqual([
      'setting-draft',
      'cheat-draft',
      'character-draft',
    ]);

    expect(contract.steps[4]).toMatchObject({
      module: 'outline',
      entrySubstepId: 'master-outline',
    });
    expect(contract.steps[4].substeps.map((substep) => substep.id)).toEqual([
      'master-outline',
      'volume-outline',
      'chapter-outline',
    ]);

    expect(contract.steps[5]).toMatchObject({
      module: 'write',
      requiredSkillAssetPaths: ['extension/assets/longformnovel/write.md'],
      entrySubstepId: 'chapter-draft',
    });
    expect(contract.steps[5].substeps.map((substep) => substep.id)).toEqual([
      'chapter-draft',
      'chapter-finalize',
      'chapter-pause',
    ]);
    expect(contract.steps[5].substeps[0]).toMatchObject({
      id: 'chapter-draft',
      requiredProjectReads: expect.arrayContaining([
        '1-边界/1.2_文风.md',
        '1-边界/1.5_微观节奏拆解.md',
        '2-设定/2.2_新书设定案.md',
        '2-设定/2.3_金手指设定.md',
        '.novelkit/constitution/MASTER.md',
        '3-大纲/3.1_全书结构总纲.md',
        '3-大纲/第01卷_完整卷纲.md',
        '3-大纲/第01卷_章纲.md',
        '4-正文/__PREV_CHAPTER__草稿.md',
      ]),
      needsApproval: true,
      next: { stepId: 'review-chapter', substepId: 'chapter-review', mode: 'standard' },
    });
    expect(contract.steps[5].substeps[1]).toMatchObject({
      id: 'chapter-finalize',
      allowedWrites: ['4-正文/第001章_草稿.md', '4-正文/第001章_定稿.md', 'PROJECT.md'],
      needsApproval: true,
      next: { stepId: 'write-chapter', substepId: 'chapter-pause', mode: 'standard' },
    });
    expect(contract.steps[5].substeps[2]).toMatchObject({
      id: 'chapter-pause',
      allowedWrites: ['PROJECT.md'],
      needsApproval: false,
      next: null,
    });

    expect(contract.steps[6]).toMatchObject({
      module: 'review',
      requiredSkillAssetPaths: ['extension/assets/longformnovel/review.md'],
      entrySubstepId: 'chapter-review',
    });
    expect(contract.steps[6].substeps.map((substep) => substep.id)).toEqual([
      'setting-review',
      'outline-review',
      'chapter-review',
    ]);
    expect(contract.steps[6].substeps.find((substep) => substep.id === 'setting-review')).toMatchObject({
      allowedWrites: ['5-审查/设定审查报告.md', 'PROJECT.md'],
      needsApproval: true,
      next: null,
    });
    expect(contract.steps[6].substeps.find((substep) => substep.id === 'outline-review')).toMatchObject({
      allowedWrites: ['5-审查/大纲审查报告.md', 'PROJECT.md'],
      needsApproval: true,
      next: null,
    });
    expect(contract.steps[6].substeps.find((substep) => substep.id === 'chapter-review')).toMatchObject({
      allowedWrites: ['5-审查/第001章_审查报告.md', 'PROJECT.md'],
      needsApproval: true,
      next: { stepId: 'write-chapter', substepId: 'chapter-pause', mode: 'standard' },
    });
  });
});
