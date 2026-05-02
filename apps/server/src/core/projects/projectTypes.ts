import { PROJECT_MODES, type ProjectMode } from 'shared';

export type { ProjectMode } from 'shared';

export { PROJECT_MODES };

export function isProjectMode(value: unknown): value is ProjectMode {
  return typeof value === 'string' && PROJECT_MODES.includes(value as ProjectMode);
}

export type ProjectRegistryEntry = {
  id: string;
  displayName: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  favorite: boolean;
  archived: boolean;
  missing: boolean;
  lastMode: ProjectMode | null;
  lastOpenedDocument: string | null;
  lastKnownStepId: string | null;
  lastKnownSubstepId: string | null;
  lastKnownChapterNumber: number | null;
};

export type ProjectRegistryStore = {
  activeProjectId: string | null;
  projects: ProjectRegistryEntry[];
};

export type ProjectRegistryMetadataUpdate = Partial<
  Pick<
    ProjectRegistryEntry,
    | 'displayName'
    | 'updatedAt'
    | 'lastOpenedAt'
    | 'favorite'
    | 'archived'
    | 'missing'
    | 'lastMode'
    | 'lastOpenedDocument'
    | 'lastKnownStepId'
    | 'lastKnownSubstepId'
    | 'lastKnownChapterNumber'
  >
>;

export type ProjectManifest = {
  projectId: string;
  displayName: string;
  createdAt: string;
  scaffoldVersion: string;
  vsixVersion: string;
  entryMode: ProjectMode;
};
