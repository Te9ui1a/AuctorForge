import { normalizeProjectRootPath } from './projectRegistry';

export type ActiveProjectSelection = {
  projectId: string | null;
  rootPath: string;
  displayName: string | null;
};

export type ActiveProjectSwitchResult = {
  previous: ActiveProjectSelection | null;
  current: ActiveProjectSelection;
  changed: boolean;
};

export function createActiveProjectContext(initialProject: ActiveProjectSelection | null = null) {
  let activeProject = initialProject === null ? null : normalizeActiveProjectSelection(initialProject);

  return {
    get() {
      return activeProject;
    },
    switchActiveProject(nextProject: ActiveProjectSelection): ActiveProjectSwitchResult {
      const normalizedProject = normalizeActiveProjectSelection(nextProject);
      const previousProject = activeProject;
      const changed =
        previousProject === null
        || previousProject.projectId !== normalizedProject.projectId
        || previousProject.rootPath !== normalizedProject.rootPath;

      activeProject = normalizedProject;

      return {
        previous: previousProject,
        current: normalizedProject,
        changed,
      };
    },
    clear() {
      const previousProject = activeProject;
      activeProject = null;

      return {
        previous: previousProject,
        changed: previousProject !== null,
      };
    },
  };
}

function normalizeActiveProjectSelection(project: ActiveProjectSelection): ActiveProjectSelection {
  return {
    projectId: normalizeNullableNonEmptyString(project.projectId),
    rootPath: normalizeProjectRootPath(project.rootPath),
    displayName: normalizeNullableNonEmptyString(project.displayName),
  };
}

function normalizeNullableNonEmptyString(value: string | null) {
  if (value === null) {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? null : trimmedValue;
}
