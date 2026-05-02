import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readSkillPackArchive } from './readSkillPackArchive';

const expandedSkillPackPath = fileURLToPath(
  new URL('../../../../../skill-packs/novel-flow-kit-0.1.5', import.meta.url),
);

describe('readSkillPackArchive', () => {
  it('loads the workflow markdown files from an expanded skill pack directory', () => {
    const archive = readSkillPackArchive(expandedSkillPackPath);

    expect(archive.entries).toEqual(
      expect.arrayContaining([
        'extension/assets/longformnovel/SKILL.md',
        'extension/assets/longformnovel/define.md',
        'extension/assets/longformnovel/ideation.md',
        'extension/assets/longformnovel/outline.md',
        'extension/assets/longformnovel/write.md',
        'extension/assets/longformnovel/review.md',
      ]),
    );

    expect(
      archive.readText('extension/assets/longformnovel/SKILL.md'),
    ).toContain('## Steps');
  });
});
