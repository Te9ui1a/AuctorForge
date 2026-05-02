export type { BackendProjectStatus, BackendProjectSummary, BackendProjectsResponse, CreateProjectInput } from 'shared';

export type ProjectStatus = 'active' | 'archived' | 'needs-repair' | 'missing-path' | 'uninitialized';

export interface ProjectInfo {
  id: string;
  name: string;
   rootPath?: string;
  lastModified: number;
  status: ProjectStatus;
   phase?: string | null;
   coreTask?: string | null;
}
