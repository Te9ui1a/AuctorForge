import path from 'node:path';

export type RuntimeProjectKey = `id:${string}` | `root:${string}`;

export type RuntimeProjectIdentity = {
  projectId: string | null;
  rootPath: string;
} | null;

export function normalizeRuntimeProjectKey(identity: RuntimeProjectIdentity): RuntimeProjectKey | null {
  if (identity === null) {
    return null;
  }

  return identity.projectId
    ? `id:${identity.projectId}`
    : `root:${path.resolve(identity.rootPath)}`;
}

export function createProjectRuntimeStateStore<TState>() {
  const stateByProjectKey = new Map<RuntimeProjectKey, TState>();

  return {
    read(projectKey: RuntimeProjectKey | null) {
      return projectKey === null ? undefined : stateByProjectKey.get(projectKey);
    },
    save(projectKey: RuntimeProjectKey | null, state: TState) {
      if (projectKey === null) {
        return;
      }

      stateByProjectKey.set(projectKey, state);
    },
  };
}

type DeferredChatTurn<TResult> = {
  promise: Promise<TResult>;
  resolve: (response: TResult) => void;
  reject: (error: unknown) => void;
};

type StartedChatTurn<TResult> = {
  status: 'started';
  promise: Promise<TResult>;
};

type ExistingChatTurn<TResult> = {
  status: 'in-flight';
  promise: Promise<TResult>;
};

export function createChatTurnRegistry<TResult>({ maxCompletedTurns = 200 } = {}) {
  const completedTurnsByProjectKey = new Map<RuntimeProjectKey, Map<string, TResult>>();
  const inFlightTurnsByProjectKey = new Map<RuntimeProjectKey, Map<string, DeferredChatTurn<TResult>>>();

  function readCompleted(projectKey: RuntimeProjectKey | null, requestId: string | null) {
    if (!projectKey || !requestId) {
      return undefined;
    }

    return completedTurnsByProjectKey.get(projectKey)?.get(requestId);
  }

  function start(projectKey: RuntimeProjectKey, requestId: string): StartedChatTurn<TResult> | ExistingChatTurn<TResult> {
    let projectTurns = inFlightTurnsByProjectKey.get(projectKey);
    if (!projectTurns) {
      projectTurns = new Map<string, DeferredChatTurn<TResult>>();
      inFlightTurnsByProjectKey.set(projectKey, projectTurns);
    }

    const existingTurn = projectTurns.get(requestId);
    if (existingTurn) {
      return {
        status: 'in-flight',
        promise: existingTurn.promise,
      };
    }

    let resolve!: (response: TResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<TResult>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    promise.catch(() => undefined);

    projectTurns.set(requestId, { promise, resolve, reject });

    return {
      status: 'started',
      promise,
    };
  }

  function complete(projectKey: RuntimeProjectKey | null, requestId: string | null, response: TResult) {
    if (!projectKey || !requestId) {
      return;
    }

    let completedProjectTurns = completedTurnsByProjectKey.get(projectKey);
    if (!completedProjectTurns) {
      completedProjectTurns = new Map<string, TResult>();
      completedTurnsByProjectKey.set(projectKey, completedProjectTurns);
    }

    completedProjectTurns.set(requestId, response);
    while (completedProjectTurns.size > maxCompletedTurns) {
      const oldestKey = completedProjectTurns.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }

      completedProjectTurns.delete(oldestKey);
    }

    const inFlightProjectTurns = inFlightTurnsByProjectKey.get(projectKey);
    const inFlightTurn = inFlightProjectTurns?.get(requestId);
    if (!inFlightProjectTurns || !inFlightTurn) {
      return;
    }

    inFlightProjectTurns.delete(requestId);
    inFlightTurn.resolve(response);
  }

  function clear(projectKey: RuntimeProjectKey | null, requestId: string | null) {
    if (!projectKey || !requestId) {
      return;
    }

    inFlightTurnsByProjectKey.get(projectKey)?.delete(requestId);
  }

  function reject(projectKey: RuntimeProjectKey | null, requestId: string | null, error: unknown) {
    if (!projectKey || !requestId) {
      return;
    }

    const inFlightProjectTurns = inFlightTurnsByProjectKey.get(projectKey);
    const inFlightTurn = inFlightProjectTurns?.get(requestId);
    if (!inFlightProjectTurns || !inFlightTurn) {
      return;
    }

    inFlightProjectTurns.delete(requestId);
    inFlightTurn.reject(error);
  }

  return {
    clear,
    complete,
    readCompleted,
    reject,
    start,
  };
}
