import { runChatTurnCommands, type ChatTurnCommandHandler } from './chatTurnRouter';

export type ChatTurnServiceHandler<TContext, TResult> = ChatTurnCommandHandler<TContext, TResult>;

type ChatTurnRunArgs<TState, TProjectKey, TBody, TReply> = {
  state: TState;
  projectKey: TProjectKey;
  body: TBody;
  routeReply: TReply;
};

type ChatTurnLifecycleArgs<TState, TProjectKey, TBody, TReply, TContext> =
  ChatTurnRunArgs<TState, TProjectKey, TBody, TReply> & {
    context: TContext;
  };

export function createChatTurnService<TState, TProjectKey, TBody, TReply, TContext, TResult>({
  runInScope,
  getRequestId = () => null,
  getActiveProjectKey = ({ projectKey }) => projectKey,
  readCompleted,
  buildContext,
  handlers,
  fallback,
  beforeRun,
  afterRun,
}: {
  runInScope?: (
    scope: { state: TState; projectKey: TProjectKey },
    run: () => Promise<TResult>,
  ) => Promise<TResult>;
  getRequestId?: (body: TBody) => string | null;
  getActiveProjectKey?: (args: ChatTurnRunArgs<TState, TProjectKey, TBody, TReply>) => TProjectKey;
  readCompleted?: (projectKey: TProjectKey, requestId: string | null) => TResult | undefined;
  buildContext: (args: ChatTurnRunArgs<TState, TProjectKey, TBody, TReply>) => TContext;
  handlers: Array<ChatTurnCommandHandler<TContext, TResult>>;
  fallback: (context: TContext) => Promise<TResult> | TResult;
  beforeRun?: (args: ChatTurnLifecycleArgs<TState, TProjectKey, TBody, TReply, TContext>) => Promise<void> | void;
  afterRun?: (args: ChatTurnLifecycleArgs<TState, TProjectKey, TBody, TReply, TContext> & { result: TResult }) => Promise<void> | void;
}) {
  return {
    run(state: TState, projectKey: TProjectKey, body: TBody, routeReply: TReply) {
      const runTurn = async () => {
        const args = { state, projectKey, body, routeReply };
        const chatRequestId = getRequestId(body);
        const activeProjectKey = getActiveProjectKey(args);
        const completedChatTurn = readCompleted?.(activeProjectKey, chatRequestId);

        if (completedChatTurn !== undefined) {
          return completedChatTurn;
        }

        const context = buildContext(args);
        await beforeRun?.({ ...args, context });

        const result = await runChatTurnCommands({
          context,
          handlers,
          fallback,
        });

        await afterRun?.({ ...args, context, result });

        return result;
      };

      return runInScope ? runInScope({ state, projectKey }, runTurn) : runTurn();
    },
  };
}
