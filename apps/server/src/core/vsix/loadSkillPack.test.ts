import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadSkillPack } from './loadSkillPack';

const skillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

describe('loadSkillPack', () => {
  it('exposes the workflow modules and core templates from the expanded skill pack', () => {
    const skillPack = loadSkillPack(skillPackPath);

    expect(Object.keys(skillPack.modules)).toEqual([
      'analyze',
      'define',
      'guide',
      'ideation',
      'outline',
      'review',
      'write',
    ]);

    expect(skillPack.skill.content).toContain('## Steps');
    expect(skillPack.templates.project.content).toContain('## 8. 项目路线图与里程碑');
    expect(skillPack.templates.master.content).toContain('## 1. 核心原则');
  });
});
