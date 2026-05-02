import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveProjectRequestContext } from './projectRequestContext';
import type { ProjectRegistryEntry, ProjectRegistryStore } from '../core/projects/projectTypes';

function makeEntry(id: string, rootPath: string): ProjectRegistryEntry {
  return {
    id,
    rootPath: path.resolve(rootPath),
    displayName: id,
    createdAt: '2026-04-04T10:00:00.000Z',
    updatedAt: '2026-04-04T10:00:00.000Z',
    lastOpenedAt: null,
    favorite: false,
    archived: false,
    missing: false,
    lastMode: null,
    lastOpenedDocument: null,
    lastKnownStepId: null,
    lastKnownSubstepId: null,
    lastKnownChapterNumber: null,
  };
}

function makeStore(): ProjectRegistryStore {
  return {
    activeProjectId: 'proj_beta',
    projects: [
      makeEntry('proj_alpha', '/workspace/alpha'),
      makeEntry('proj_beta', '/workspace/beta'),
    ],
  };
}

describe('projectRequestContext', () => {
  it('returns legacy fallback when no explicit project identity is provided', () => {
    expect(resolveProjectRequestContext({}, makeStore())).toEqual({ kind: 'legacy' });
  });

  it('resolves an explicit x-project-id to the matching registry entry', () => {
    expect(resolveProjectRequestContext({ 'x-project-id': 'proj_alpha' }, makeStore())).toMatchObject({
      kind: 'project',
      entry: {
        id: 'proj_alpha',
        rootPath: path.resolve('/workspace/alpha'),
      },
    });
  });

  it('returns project-not-found for an unknown explicit project id without fallback', () => {
    expect(resolveProjectRequestContext({ 'x-project-id': 'proj_missing' }, makeStore())).toMatchObject({
      kind: 'error',
      statusCode: 404,
      payload: {
        error: {
          code: 'project-not-found',
          details: {
            projectId: 'proj_missing',
          },
        },
      },
    });
  });

  it('returns project-identity-mismatch when x-project-root does not match x-project-id', () => {
    expect(resolveProjectRequestContext({
      'x-project-id': 'proj_alpha',
      'x-project-root': '/workspace/beta',
    }, makeStore())).toMatchObject({
      kind: 'error',
      statusCode: 409,
      payload: {
        error: {
          code: 'project-identity-mismatch',
          details: {
            projectId: 'proj_alpha',
            expectedRootPath: path.resolve('/workspace/alpha'),
            requestedRootPath: path.resolve('/workspace/beta'),
          },
        },
      },
    });
  });
});
