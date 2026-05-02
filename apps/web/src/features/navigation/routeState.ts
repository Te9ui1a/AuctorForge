export type LauncherPanel = 'manage';
/**
 * Compatibility-shaped workbench entry lens preserved by the route layer.
 * App/workbench behavior can reinterpret this more softly than a long-lived mode.
 */
export type WorkbenchLens = 'analyze';

export type LauncherRouteState = {
  kind: 'launcher';
  projectId?: string;
  panel?: LauncherPanel;
};

export type WorkbenchRouteState = {
  kind: 'workbench';
  projectId: string;
  lens?: WorkbenchLens;
  documentPath?: string;
};

export type RouteState = LauncherRouteState | WorkbenchRouteState;

type LocationLike = {
  pathname: string;
  search: string;
};

export function parseRoute(location: LocationLike): RouteState {
  const projectFileMatch = location.pathname.match(/^\/projects\/([^/]+)\/files\/(.+)$/);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)$/);
  const legacyWorkbenchMatch = location.pathname.match(/^\/projects\/([^/]+)\/(create|analyze)$/);
  const params = new URLSearchParams(location.search);

  if (projectFileMatch) {
    try {
      return {
        kind: 'workbench',
        projectId: decodeURIComponent(projectFileMatch[1]),
        documentPath: decodePathSegments(projectFileMatch[2]),
      };
    } catch {}
  }

  if (projectMatch) {
    try {
      const lens = params.get('lens') === 'analyze' ? 'analyze' : undefined;

      return {
        kind: 'workbench',
        projectId: decodeURIComponent(projectMatch[1]),
        lens,
      };
    } catch {}
  }

  if (legacyWorkbenchMatch) {
    try {
      return {
        kind: 'workbench',
        projectId: decodeURIComponent(legacyWorkbenchMatch[1]),
        lens: legacyWorkbenchMatch[2] === 'analyze' ? 'analyze' : undefined,
      };
    } catch {}
  }

  const rawProjectId = params.get('projectId');
  const projectId = rawProjectId && rawProjectId.length > 0 ? rawProjectId : undefined;
  const panel = params.get('panel') === 'manage' ? 'manage' : undefined;

  return {
    kind: 'launcher',
    projectId,
    panel,
  };
}

export function toLauncherPath({ projectId, panel }: { projectId?: string; panel?: LauncherPanel }): string {
  const params = new URLSearchParams();

  if (projectId) {
    params.set('projectId', projectId);
  }

  if (panel) {
    params.set('panel', panel);
  }

  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export function toWorkbenchPath({
  projectId,
  lens,
  documentPath,
}: {
  projectId: string;
  lens?: WorkbenchLens;
  documentPath?: string;
}): string {
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;

  if (documentPath) {
    return `${projectPath}/files/${encodePathSegments(documentPath)}`;
  }

  return lens === 'analyze' ? `${projectPath}?lens=analyze` : projectPath;
}

function encodePathSegments(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function decodePathSegments(path: string) {
  return path.split('/').map(decodeURIComponent).join('/');
}
