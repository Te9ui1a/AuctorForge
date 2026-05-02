import type { BackendProjectSummary, BackendProjectsResponse, CreateProjectInput, ProjectInfo } from './projectTypes';
import { ensureOk } from '../api/apiClient';

function mapBackendProject(backend: BackendProjectSummary): ProjectInfo {
  const status =
    backend.status === 'archived'
      ? 'archived'
      : backend.status === 'needs-repair'
        ? 'needs-repair'
        : backend.status === 'missing-path'
          ? 'missing-path'
          : backend.status === 'uninitialized'
            ? 'uninitialized'
            : 'active';

  return {
    id: backend.id || backend.projectId || backend.rootPath,
    name: backend.displayName || '未命名项目',
    rootPath: backend.rootPath,
    lastModified: backend.lastOpenedAt ? new Date(backend.lastOpenedAt).getTime() : Date.now(),
    status,
    phase: backend.phase,
    coreTask: backend.coreTask,
  };
}

export async function fetchRecentProjects(): Promise<ProjectInfo[]> {
  const response = await fetch('/api/projects');
  await ensureOk(response, 'Failed to fetch projects');
  const data = await response.json() as BackendProjectsResponse | BackendProjectSummary[];
  const projects = Array.isArray(data) ? data : data.projects;
  return projects.map(mapBackendProject);
}

export async function createProject(input: CreateProjectInput): Promise<ProjectInfo> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await ensureOk(response, 'Failed to create project');
  const data = await response.json() as { project: BackendProjectSummary } | BackendProjectSummary;
  return mapBackendProject('project' in data ? data.project : data);
}

export async function pickProjectFolder(input: { purpose: 'create' | 'import'; defaultPath?: string }): Promise<string | null> {
  const response = await fetch('/api/projects/pick-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  await ensureOk(response, 'Failed to pick folder');

  const data = await response.json() as { path: string | null };
  return data.path;
}

export async function importProject(input: { rootPath: string; displayName?: string; entryMode?: 'create' | 'analyze' }): Promise<ProjectInfo> {
  const response = await fetch('/api/projects/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  await ensureOk(response, 'Failed to import project');

  const data = await response.json() as { project: BackendProjectSummary } | BackendProjectSummary;
  return mapBackendProject('project' in data ? data.project : data);
}

export async function repairProject(projectId: string): Promise<ProjectInfo> {
  const response = await fetch('/api/projects/repair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });

  await ensureOk(response, 'Failed to repair project');

  const data = await response.json() as { project: BackendProjectSummary };
  return mapBackendProject(data.project);
}

export async function archiveProject(projectId: string, archived = true): Promise<ProjectInfo | null> {
  const response = await fetch('/api/projects/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, archived }),
  });

  await ensureOk(response, 'Failed to archive project');

  const data = await response.json() as { project: BackendProjectSummary | null };
  return data.project ? mapBackendProject(data.project) : null;
}

export async function removeProject(projectId: string): Promise<{ removedProjectId: string; activeProjectId: string | null }> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });

  await ensureOk(response, 'Failed to remove project');

  return await response.json() as { removedProjectId: string; activeProjectId: string | null };
}
