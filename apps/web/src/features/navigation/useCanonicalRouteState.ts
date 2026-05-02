import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  parseRoute,
  toLauncherPath,
  toWorkbenchPath,
} from './routeState';

type NavigationAdapter = {
  location: {
    pathname: string;
    search: string;
  };
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

export function useCanonicalRouteState(navigation: NavigationAdapter) {
  const isMountedRef = useRef(true);
  const routeState = useMemo(() => parseRoute(navigation.location), [navigation.location]);
  const canonicalRoutePath = useMemo(
    () =>
      routeState.kind === 'launcher'
        ? toLauncherPath({ projectId: routeState.projectId, panel: routeState.panel })
        : toWorkbenchPath({
            projectId: routeState.projectId,
            lens: routeState.lens,
            documentPath: routeState.documentPath,
          }),
    [routeState],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const navigateIfMounted = useCallback((to: string, options?: { replace?: boolean }) => {
    if (!isMountedRef.current) {
      return;
    }

    navigation.navigate(to, options);
  }, [navigation]);

  useEffect(() => {
    const currentPath = `${navigation.location.pathname}${navigation.location.search}`;

    if (currentPath !== canonicalRoutePath) {
      navigateIfMounted(canonicalRoutePath, { replace: true });
    }
  }, [canonicalRoutePath, navigateIfMounted, navigation.location.pathname, navigation.location.search]);

  return {
    canonicalRoutePath,
    navigateIfMounted,
    routeState,
  };
}
