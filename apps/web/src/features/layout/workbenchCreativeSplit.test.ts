import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ASSISTANT_RATIO,
  MAX_ASSISTANT_RATIO,
  MIN_ASSISTANT_RATIO,
  WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY,
  clampWorkbenchAssistantRatio,
  getDefaultWorkbenchAssistantRatio,
  persistWorkbenchAssistantRatio,
  readWorkbenchAssistantRatio,
  resetWorkbenchAssistantRatio,
} from './workbenchCreativeSplit';

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workbenchCreativeSplit', () => {
  it('uses a namespaced global storage key', () => {
    expect(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY).toBe('workbench:creative-split-ratio');
  });

  it('clamps assistant ratio to safe product bounds', () => {
    expect(clampWorkbenchAssistantRatio(0)).toBe(MIN_ASSISTANT_RATIO);
    expect(clampWorkbenchAssistantRatio(1)).toBe(MAX_ASSISTANT_RATIO);
    expect(clampWorkbenchAssistantRatio(0.28)).toBe(0.28);
  });

  it('falls back to the default ratio for invalid values', () => {
    expect(clampWorkbenchAssistantRatio(Number.NaN)).toBe(DEFAULT_ASSISTANT_RATIO);
    expect(clampWorkbenchAssistantRatio(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ASSISTANT_RATIO);
    expect(getDefaultWorkbenchAssistantRatio()).toBe(DEFAULT_ASSISTANT_RATIO);
  });

  it('persists and restores a clamped global ratio', () => {
    const storage = createMemoryStorage();

    persistWorkbenchAssistantRatio(0.8, storage);

    expect(storage.setItem).toHaveBeenCalledWith(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY, JSON.stringify(MAX_ASSISTANT_RATIO));
    expect(readWorkbenchAssistantRatio(storage)).toBe(MAX_ASSISTANT_RATIO);
  });

  it('falls back to default when stored JSON is invalid', () => {
    const storage = createMemoryStorage();
    storage.setItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY, 'not-json');

    expect(readWorkbenchAssistantRatio(storage)).toBe(DEFAULT_ASSISTANT_RATIO);
  });

  it('resets the stored global ratio', () => {
    const storage = createMemoryStorage();

    persistWorkbenchAssistantRatio(0.3, storage);
    resetWorkbenchAssistantRatio(storage);

    expect(storage.removeItem).toHaveBeenCalledWith(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY);
    expect(readWorkbenchAssistantRatio(storage)).toBe(DEFAULT_ASSISTANT_RATIO);
  });

  it('keeps read persist and reset safe when localStorage is unavailable', () => {
    const storageGetter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });

    expect(readWorkbenchAssistantRatio()).toBe(DEFAULT_ASSISTANT_RATIO);
    expect(() => persistWorkbenchAssistantRatio(0.3)).not.toThrow();
    expect(() => resetWorkbenchAssistantRatio()).not.toThrow();

    storageGetter.mockRestore();
  });
});
