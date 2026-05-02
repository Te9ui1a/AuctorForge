export type ChatTurnCommandHandler<TContext, TResult> = {
  name: string;
  handle: (context: TContext) => Promise<TResult | null> | TResult | null;
};

export async function runChatTurnCommands<TContext, TResult>({
  context,
  handlers,
  fallback,
}: {
  context: TContext;
  handlers: Array<ChatTurnCommandHandler<TContext, TResult>>;
  fallback: (context: TContext) => Promise<TResult> | TResult;
}) {
  for (const handler of handlers) {
    const response = await handler.handle(context);

    if (response !== null) {
      return response;
    }
  }

  return fallback(context);
}
