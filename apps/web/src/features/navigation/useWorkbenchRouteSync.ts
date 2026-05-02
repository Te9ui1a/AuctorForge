import { useEffect, useRef } from 'react';

import { toLauncherPath, toWorkbenchPath, type RouteState } from './routeState';

export type WorkbenchMode = 'create' | 'analyze';

type DraftStateMap = Record<string, { dirty: boolean }>;

type NavigationLocation = {
  pathname: string;
  search: string;
};

export function toWorkbenchModePath({ projectId, mode }: { projectId: string; mode: WorkbenchMode }) {
  return toWorkbenchPath({
    projectId,
    lens: mode === 'analyze' ? 'analyze' : undefined,
  });
}

export function useWorkbenchRouteSync({
  activeProjectId,
  currentWorkbenchMode,
  documentPath,
  draftStateByPath,
  executeSwitch,
  handleOpenFile,
  handleQuickMode,
  isStarting,
  navigateIfMounted,
  navigationLocation,
  routeState,
  sessionCurrentModule,
  setPendingSwitch,
}: {
  activeProjectId: string;
  currentWorkbenchMode: WorkbenchMode;
  documentPath: string;
  draftStateByPath: DraftStateMap;
  executeSwitch: (mode: WorkbenchMode, projectId: string, preferredDocumentPath?: string) => Promise<void>;
  handleOpenFile: (path: string) => Promise<void>;
  handleQuickMode: (mode: 'guide' | 'analyze') => Promise<void>;
  isStarting: boolean;
  navigateIfMounted: (to: string, options?: { replace?: boolean }) => void;
  navigationLocation: NavigationLocation;
  routeState: RouteState;
  sessionCurrentModule?: string;
  setPendingSwitch: (switchTarget: { mode: WorkbenchMode; projectId: string } | null | ((current: { mode: WorkbenchMode; projectId: string } | null) => { mode: WorkbenchMode; projectId: string } | null)) => void;
}) {
  const syncedWorkbenchRouteRef = useRef('');
  const previousWorkbenchModeRef = useRef<WorkbenchMode | null>(null);
  const executeSwitchRef = useRef(executeSwitch);
  const handleOpenFileRef = useRef(handleOpenFile);
  const handleQuickModeRef = useRef(handleQuickMode);

  executeSwitchRef.current = executeSwitch;
  handleOpenFileRef.current = handleOpenFile;
  handleQuickModeRef.current = handleQuickMode;

  useEffect(() => {
    if (routeState.kind !== 'workbench') {
      syncedWorkbenchRouteRef.current = '';
      previousWorkbenchModeRef.current = null;
      return;
    }

    const routeMode: WorkbenchMode = routeState.lens === 'analyze' ? 'analyze' : 'create';
    const routeKey = `${routeState.projectId}:${routeMode}:${routeState.documentPath ?? ''}`;
    const hasDirtyDrafts = Object.values(draftStateByPath).some((draft) => draft.dirty);
    const previousWorkbenchMode = previousWorkbenchModeRef.current;
    const isSameProjectCreateLens =
      routeState.projectId === activeProjectId &&
      routeMode === 'create' &&
      (previousWorkbenchMode === 'analyze' || currentWorkbenchMode === 'analyze');

    if (routeState.projectId !== activeProjectId) {
      if (hasDirtyDrafts) {
        const fallbackPath = activeProjectId
          ? toWorkbenchModePath({ projectId: activeProjectId, mode: currentWorkbenchMode })
          : toLauncherPath({});

        setPendingSwitch((current) =>
          current?.projectId === routeState.projectId && current.mode === routeMode
            ? current
            : { mode: routeMode, projectId: routeState.projectId },
        );

        if (`${navigationLocation.pathname}${navigationLocation.search}` !== fallbackPath) {
          queueMicrotask(() => {
            navigateIfMounted(fallbackPath, { replace: true });
          });
        }

        syncedWorkbenchRouteRef.current = '';
        return;
      }

      if (isStarting || syncedWorkbenchRouteRef.current === routeKey) {
        return;
      }

      syncedWorkbenchRouteRef.current = routeKey;
      previousWorkbenchModeRef.current = routeMode;
      void executeSwitchRef.current(routeMode, routeState.projectId, routeState.documentPath);
      return;
    }

    if (routeState.documentPath && routeState.documentPath !== documentPath) {
      syncedWorkbenchRouteRef.current = routeKey;
      previousWorkbenchModeRef.current = routeMode;
      void handleOpenFileRef.current(routeState.documentPath);
      return;
    }

    if (routeMode === 'analyze' && sessionCurrentModule !== 'analyze') {
      if (syncedWorkbenchRouteRef.current === routeKey) {
        return;
      }

      syncedWorkbenchRouteRef.current = routeKey;
      previousWorkbenchModeRef.current = routeMode;
      void handleQuickModeRef.current('analyze');
      return;
    }

    if (isSameProjectCreateLens) {
      syncedWorkbenchRouteRef.current = routeKey;
      previousWorkbenchModeRef.current = routeMode;
      return;
    }

    if (routeMode === 'create') {
      syncedWorkbenchRouteRef.current = routeKey;
      previousWorkbenchModeRef.current = routeMode;
      return;
    }

    syncedWorkbenchRouteRef.current = routeKey;
    previousWorkbenchModeRef.current = routeMode;
  }, [
    activeProjectId,
    currentWorkbenchMode,
    documentPath,
    draftStateByPath,
    isStarting,
    navigateIfMounted,
    navigationLocation.pathname,
    navigationLocation.search,
    routeState,
    sessionCurrentModule,
    setPendingSwitch,
  ]);
}
