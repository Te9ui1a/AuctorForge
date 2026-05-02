export type WorkbenchCreativeSplitStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY = 'workbench:creative-split-ratio';
export const DEFAULT_ASSISTANT_RATIO = 0.18;
export const MIN_ASSISTANT_RATIO = 0.16;
export const MAX_ASSISTANT_RATIO = 0.42;
export const MIN_EDITOR_WIDTH = 560;
export const MIN_ASSISTANT_WIDTH = 240;
export const SPLIT_HANDLE_WIDTH = 10;

function resolveWorkbenchCreativeSplitStorage(storage?: WorkbenchCreativeSplitStorage) {
  if (storage) {
    return storage;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function getDefaultWorkbenchAssistantRatio() {
  return DEFAULT_ASSISTANT_RATIO;
}

export function clampWorkbenchAssistantRatio(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_ASSISTANT_RATIO;
  }

  return Math.min(MAX_ASSISTANT_RATIO, Math.max(MIN_ASSISTANT_RATIO, value));
}

function parseWorkbenchAssistantRatio(raw: string | null) {
  if (raw === null) {
    return DEFAULT_ASSISTANT_RATIO;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      return DEFAULT_ASSISTANT_RATIO;
    }

    return clampWorkbenchAssistantRatio(parsed);
  } catch {
    return DEFAULT_ASSISTANT_RATIO;
  }
}

export function readWorkbenchAssistantRatio(storage?: WorkbenchCreativeSplitStorage) {
  const resolvedStorage = resolveWorkbenchCreativeSplitStorage(storage);

  if (!resolvedStorage) {
    return DEFAULT_ASSISTANT_RATIO;
  }

  try {
    return parseWorkbenchAssistantRatio(resolvedStorage.getItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY));
  } catch {
    return DEFAULT_ASSISTANT_RATIO;
  }
}

export function persistWorkbenchAssistantRatio(value: number, storage?: WorkbenchCreativeSplitStorage) {
  const resolvedStorage = resolveWorkbenchCreativeSplitStorage(storage);

  if (!resolvedStorage) {
    return;
  }

  try {
    resolvedStorage.setItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY, JSON.stringify(clampWorkbenchAssistantRatio(value)));
  } catch {
    return;
  }
}

export function resetWorkbenchAssistantRatio(storage?: WorkbenchCreativeSplitStorage) {
  const resolvedStorage = resolveWorkbenchCreativeSplitStorage(storage);

  if (!resolvedStorage) {
    return;
  }

  try {
    resolvedStorage.removeItem(WORKBENCH_CREATIVE_SPLIT_STORAGE_KEY);
  } catch {
    return;
  }
}
