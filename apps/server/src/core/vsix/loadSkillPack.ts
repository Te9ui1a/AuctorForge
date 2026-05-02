import { readSkillPackArchive } from './readSkillPackArchive';

type SkillAsset = {
  entryPath: string;
  content: string;
};

export type SkillPack = {
  skill: SkillAsset;
  modules: Record<string, SkillAsset>;
  templates: {
    project: SkillAsset;
    master: SkillAsset;
    expectation: SkillAsset;
    characterState: SkillAsset;
    foreshadowing: SkillAsset;
  };
};

const BASE_PATH = 'extension/assets/longformnovel';

const moduleEntries = {
  analyze: `${BASE_PATH}/analyze.md`,
  define: `${BASE_PATH}/define.md`,
  guide: `${BASE_PATH}/guide.md`,
  ideation: `${BASE_PATH}/ideation.md`,
  outline: `${BASE_PATH}/outline.md`,
  review: `${BASE_PATH}/review.md`,
  write: `${BASE_PATH}/write.md`,
} as const;

export function loadSkillPack(skillPackPath: string): SkillPack {
  const archive = readSkillPackArchive(skillPackPath);

  const modules = Object.fromEntries(
    Object.entries(moduleEntries).map(([name, entryPath]) => [
      name,
      {
        entryPath,
        content: archive.readText(entryPath),
      },
    ]),
  );

  return {
    skill: {
      entryPath: `${BASE_PATH}/SKILL.md`,
      content: archive.readText(`${BASE_PATH}/SKILL.md`),
    },
    modules,
    templates: {
      project: {
        entryPath: `${BASE_PATH}/docs/PROJECT.md`,
        content: archive.readText(`${BASE_PATH}/docs/PROJECT.md`),
      },
      master: {
        entryPath: `${BASE_PATH}/docs/MASTER.md`,
        content: archive.readText(`${BASE_PATH}/docs/MASTER.md`),
      },
      expectation: {
        entryPath: `${BASE_PATH}/docs/expectation_template.md`,
        content: archive.readText(`${BASE_PATH}/docs/expectation_template.md`),
      },
      characterState: {
        entryPath: `${BASE_PATH}/docs/TEMPLATE_CHARACTER_STATE.md`,
        content: archive.readText(`${BASE_PATH}/docs/TEMPLATE_CHARACTER_STATE.md`),
      },
      foreshadowing: {
        entryPath: `${BASE_PATH}/docs/TEMPLATE_FORESHADOWING.md`,
        content: archive.readText(`${BASE_PATH}/docs/TEMPLATE_FORESHADOWING.md`),
      },
    },
  };
}
