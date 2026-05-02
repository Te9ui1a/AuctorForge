import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DEFAULT_ASSISTANT_RATIO,
  MAX_ASSISTANT_RATIO,
  MIN_ASSISTANT_RATIO,
  MIN_ASSISTANT_WIDTH,
  MIN_EDITOR_WIDTH,
  SPLIT_HANDLE_WIDTH,
  clampWorkbenchAssistantRatio,
  persistWorkbenchAssistantRatio,
  readWorkbenchAssistantRatio,
  resetWorkbenchAssistantRatio,
} from './workbenchCreativeSplit';

type SplitDragState = {
  pointerId: number;
};

function roundRatio(value: number) {
  return Number(value.toFixed(3));
}

function clampRatioForRect(value: number, rect: DOMRect) {
  const availableWidth = Math.max(1, rect.width - SPLIT_HANDLE_WIDTH);
  const minByAssistantWidth = MIN_ASSISTANT_WIDTH / availableWidth;
  const maxByEditorWidth = 1 - MIN_EDITOR_WIDTH / availableWidth;
  const min = Math.max(MIN_ASSISTANT_RATIO, minByAssistantWidth);
  const max = Math.min(MAX_ASSISTANT_RATIO, Math.max(min, maxByEditorWidth));

  return roundRatio(Math.min(max, Math.max(min, value)));
}

function ratioFromClientX(clientX: number, rect: DOMRect) {
  const availableWidth = Math.max(1, rect.width - SPLIT_HANDLE_WIDTH);
  const assistantWidth = rect.right - clientX - SPLIT_HANDLE_WIDTH / 2;

  return assistantWidth / availableWidth;
}

export function useWorkbenchCreativeSplit() {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<SplitDragState | null>(null);
  const [assistantRatio, setAssistantRatio] = useState(() => readWorkbenchAssistantRatio());
  const [isDragging, setIsDragging] = useState(false);

  const updateRatioFromClientX = useCallback((clientX: number) => {
    const rect = workspaceRef.current?.getBoundingClientRect();

    if (!rect) {
      return assistantRatio;
    }

    const nextRatio = clampRatioForRect(ratioFromClientX(clientX, rect), rect);
    setAssistantRatio(nextRatio);

    return nextRatio;
  }, [assistantRatio]);

  const beginSplitDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = { pointerId: event.pointerId };
    setIsDragging(true);
    updateRatioFromClientX(event.clientX);
  }, [updateRatioFromClientX]);

  const moveSplitDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId || event.buttons === 0) {
      return;
    }

    event.preventDefault();
    updateRatioFromClientX(event.clientX);
  }, [updateRatioFromClientX]);

  const endSplitDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    const nextRatio = updateRatioFromClientX(event.clientX);

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    dragStateRef.current = null;
    setIsDragging(false);
    persistWorkbenchAssistantRatio(nextRatio);
  }, [updateRatioFromClientX]);

  const cancelSplitDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    dragStateRef.current = null;
    setIsDragging(false);
    setAssistantRatio(readWorkbenchAssistantRatio());
  }, []);

  const resetSplit = useCallback(() => {
    resetWorkbenchAssistantRatio();
    setAssistantRatio(DEFAULT_ASSISTANT_RATIO);
  }, []);

  const nudgeSplit = useCallback((direction: -1 | 1) => {
    setAssistantRatio((current) => {
      const next = clampWorkbenchAssistantRatio(roundRatio(current + direction * 0.02));
      persistWorkbenchAssistantRatio(next);
      return next;
    });
  }, []);

  const handleSplitKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nudgeSplit(1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      nudgeSplit(-1);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setAssistantRatio(MAX_ASSISTANT_RATIO);
      persistWorkbenchAssistantRatio(MAX_ASSISTANT_RATIO);
    }

    if (event.key === 'End') {
      event.preventDefault();
      setAssistantRatio(MIN_ASSISTANT_RATIO);
      persistWorkbenchAssistantRatio(MIN_ASSISTANT_RATIO);
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      resetSplit();
    }
  }, [nudgeSplit, resetSplit]);

  const workspaceStyle = useMemo(() => ({
    '--workbench-assistant-split-ratio': String(assistantRatio),
    '--workbench-editor-split-fr': String(roundRatio(1 - assistantRatio)),
    '--workbench-assistant-split-fr': String(assistantRatio),
    '--workbench-editor-split-column': `${roundRatio(1 - assistantRatio)}fr`,
    '--workbench-assistant-split-column': `${assistantRatio}fr`,
  }) as CSSProperties, [assistantRatio]);

  return {
    assistantRatio,
    beginSplitDrag,
    cancelSplitDrag,
    endSplitDrag,
    handleSplitKeyDown,
    isDragging,
    moveSplitDrag,
    resetSplit,
    workspaceRef,
    workspaceStyle,
  };
}
