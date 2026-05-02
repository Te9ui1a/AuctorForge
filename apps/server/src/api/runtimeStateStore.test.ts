import { describe, expect, it } from 'vitest';

import {
  createChatTurnRegistry,
  createProjectRuntimeStateStore,
  normalizeRuntimeProjectKey,
} from './runtimeStateStore';

describe('runtimeStateStore', () => {
  it('normalizes project ids and root paths into stable runtime keys', () => {
    expect(normalizeRuntimeProjectKey({ projectId: 'proj-alpha', rootPath: '/tmp/alpha' })).toBe('id:proj-alpha');
    expect(normalizeRuntimeProjectKey({ projectId: null, rootPath: 'relative/project' })).toContain('root:');
    expect(normalizeRuntimeProjectKey(null)).toBeNull();
  });

  it('stores and restores runtime state by project key', () => {
    const store = createProjectRuntimeStateStore<{ value: string }>();

    store.save('id:alpha', { value: 'alpha-state' });
    store.save('id:beta', { value: 'beta-state' });

    expect(store.read('id:alpha')).toEqual({ value: 'alpha-state' });
    expect(store.read('id:beta')).toEqual({ value: 'beta-state' });
    expect(store.read(null)).toBeUndefined();
  });

  it('deduplicates completed and in-flight chat turns per project key', async () => {
    const registry = createChatTurnRegistry<string>();
    const firstInFlight = registry.start('id:alpha', 'turn-1');
    const duplicateInFlight = registry.start('id:alpha', 'turn-1');

    expect(firstInFlight.status).toBe('started');
    expect(duplicateInFlight.status).toBe('in-flight');

    registry.complete('id:alpha', 'turn-1', 'result');
    await expect(duplicateInFlight.promise).resolves.toBe('result');
    expect(registry.readCompleted('id:alpha', 'turn-1')).toBe('result');
    expect(registry.readCompleted('id:beta', 'turn-1')).toBeUndefined();
  });
});
