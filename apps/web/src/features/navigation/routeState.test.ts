import { describe, expect, it } from 'vitest';

import {
  parseRoute,
  toLauncherPath,
  toWorkbenchPath,
  type RouteState,
} from './routeState';

function expectLauncherRoute(route: RouteState, expected: { projectId?: string; panel?: 'manage' }) {
  expect(route).toEqual({
    kind: 'launcher',
    projectId: expected.projectId,
    panel: expected.panel,
  });
}

describe('routeState', () => {
  it('parses the startup homepage route', () => {
    expectLauncherRoute(parseRoute({ pathname: '/', search: '' }), {});
  });

  it('parses launcher management without a selected project', () => {
    expectLauncherRoute(parseRoute({ pathname: '/', search: '?panel=manage' }), {
      panel: 'manage',
    });
  });

  it('parses launcher state with a selected project', () => {
    expectLauncherRoute(parseRoute({ pathname: '/', search: '?projectId=proj-1' }), {
      projectId: 'proj-1',
    });
  });

  it('parses launcher state with a selected project and management panel', () => {
    expectLauncherRoute(parseRoute({ pathname: '/', search: '?projectId=proj-1&panel=manage' }), {
      projectId: 'proj-1',
      panel: 'manage',
    });
  });

  it('parses a create-mode workbench route', () => {
    expect(parseRoute({ pathname: '/projects/proj-1', search: '' })).toEqual({
      kind: 'workbench',
      projectId: 'proj-1',
    });
  });

  it('parses an analyze lens workbench route', () => {
    expect(parseRoute({ pathname: '/projects/proj-1', search: '?lens=analyze' })).toEqual({
      kind: 'workbench',
      projectId: 'proj-1',
      lens: 'analyze',
    });
  });

  it('parses a project file deep link', () => {
    expect(parseRoute({ pathname: '/projects/proj-1/files/4-%E6%AD%A3%E6%96%87/%E7%AC%AC005%E7%AB%A0_%E8%8D%89%E7%A8%BF.md', search: '' })).toEqual({
      kind: 'workbench',
      projectId: 'proj-1',
      documentPath: '4-正文/第005章_草稿.md',
    });
  });

  it('keeps legacy create and analyze workbench routes parseable for redirects', () => {
    expect(parseRoute({ pathname: '/projects/proj-1/create', search: '' })).toEqual({
      kind: 'workbench',
      projectId: 'proj-1',
    });

    expect(parseRoute({ pathname: '/projects/proj-1/analyze', search: '' })).toEqual({
      kind: 'workbench',
      projectId: 'proj-1',
      lens: 'analyze',
    });
  });

  it('normalizes unknown paths back to launcher state', () => {
    expectLauncherRoute(parseRoute({ pathname: '/something/else', search: '' }), {});
  });

  it('falls back to launcher state when projectId decoding is invalid', () => {
    expectLauncherRoute(parseRoute({ pathname: '/projects/%E0%A4%A/create', search: '' }), {});
  });

  it('normalizes empty launcher projectId query values', () => {
    const route = parseRoute({ pathname: '/', search: '?projectId=&panel=manage' });

    expectLauncherRoute(route, { panel: 'manage' });
    expect(toLauncherPath(route)).toBe('/?panel=manage');
  });

  it('formats launcher paths canonically', () => {
    expect(toLauncherPath({})).toBe('/');
    expect(toLauncherPath({ panel: 'manage' })).toBe('/?panel=manage');
    expect(toLauncherPath({ projectId: 'proj-1' })).toBe('/?projectId=proj-1');
    expect(toLauncherPath({ projectId: 'proj-1', panel: 'manage' })).toBe('/?projectId=proj-1&panel=manage');
  });

  it('formats workbench paths canonically', () => {
    expect(toWorkbenchPath({ projectId: 'proj-1' })).toBe('/projects/proj-1');
    expect(toWorkbenchPath({ projectId: 'proj-1', lens: 'analyze' })).toBe('/projects/proj-1?lens=analyze');
    expect(toWorkbenchPath({ projectId: 'proj-1', documentPath: '4-正文/第005章_草稿.md' })).toBe('/projects/proj-1/files/4-%E6%AD%A3%E6%96%87/%E7%AC%AC005%E7%AB%A0_%E8%8D%89%E7%A8%BF.md');
  });

  it('round-trips canonical workbench routes', () => {
    expect(parseRoute({ pathname: toWorkbenchPath({ projectId: 'proj 1' }), search: '' })).toEqual({
      kind: 'workbench',
      projectId: 'proj 1',
    });

    expect(parseRoute({ pathname: '/projects/proj%201', search: '?lens=analyze' })).toEqual({
      kind: 'workbench',
      projectId: 'proj 1',
      lens: 'analyze',
    });
  });
});
