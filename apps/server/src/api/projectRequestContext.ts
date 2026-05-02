import type { IncomingHttpHeaders } from 'node:http';

import { normalizeProjectRootPath } from '../core/projects/projectRegistry';
import type { ProjectRegistryEntry, ProjectRegistryStore } from '../core/projects/projectTypes';

type ProjectRequestErrorPayload = {
  error: {
    code: 'project-not-found' | 'project-identity-mismatch';
    message: string;
    details: Record<string, string>;
  };
};

export type ProjectRequestContext =
  | { kind: 'legacy' }
  | { kind: 'project'; entry: ProjectRegistryEntry }
  | { kind: 'error'; statusCode: 404 | 409; payload: ProjectRequestErrorPayload };

function readSingleHeader(headers: IncomingHttpHeaders | Record<string, unknown>, name: string) {
  const rawValue = headers[name];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readExplicitProjectId(headers: IncomingHttpHeaders | Record<string, unknown>) {
  return readSingleHeader(headers, 'x-project-id');
}

export function readExplicitProjectRoot(headers: IncomingHttpHeaders | Record<string, unknown>) {
  return readSingleHeader(headers, 'x-project-root');
}

export function buildProjectRequestHeaders(headers: IncomingHttpHeaders | Record<string, unknown>) {
  const projectId = readExplicitProjectId(headers);
  const projectRoot = readExplicitProjectRoot(headers);
  const nextHeaders: Record<string, string> = {};

  if (projectId) {
    nextHeaders['x-project-id'] = projectId;
  }

  if (projectRoot) {
    nextHeaders['x-project-root'] = projectRoot;
  }

  return nextHeaders;
}

export function resolveProjectRequestContext(
  headers: IncomingHttpHeaders | Record<string, unknown>,
  store: ProjectRegistryStore,
): ProjectRequestContext {
  const projectId = readExplicitProjectId(headers);
  if (projectId === null) {
    return { kind: 'legacy' };
  }

  const entry = store.projects.find((project) => project.id === projectId) ?? null;
  if (entry === null) {
    return {
      kind: 'error',
      statusCode: 404,
      payload: {
        error: {
          code: 'project-not-found',
          message: `Project "${projectId}" is not registered.`,
          details: { projectId },
        },
      },
    };
  }

  const explicitRoot = readExplicitProjectRoot(headers);
  if (explicitRoot !== null) {
    const requestedRootPath = normalizeProjectRootPath(explicitRoot);
    const expectedRootPath = normalizeProjectRootPath(entry.rootPath);

    if (requestedRootPath !== expectedRootPath) {
      return {
        kind: 'error',
        statusCode: 409,
        payload: {
          error: {
            code: 'project-identity-mismatch',
            message: `Project "${projectId}" is registered for a different root path.`,
            details: {
              projectId,
              expectedRootPath,
              requestedRootPath,
            },
          },
        },
      };
    }
  }

  return { kind: 'project', entry };
}
