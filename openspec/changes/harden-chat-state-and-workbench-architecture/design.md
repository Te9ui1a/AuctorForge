## Context

The audit found two P1 risks and three P2 maintainability risks:

- Server runtime state is stored in `createApp` closure variables, so project switching and concurrent requests can mutate shared `projectRoot`, workflow state, pending proposals, and discussion notes.
- The web client retries `/api/chat` after `/api/chat/stream` fails, but the stream endpoint already invokes the non-idempotent chat route before emitting events.
- `/api/chat/stream` currently chunks a completed response rather than streaming generation.
- `AppShell` owns route, project, document, chat, settings, attachment, and layout state in one component.
- `createApp.ts` combines routing, workflow commands, AI generation, proposal snapshotting, and error shaping in one route handler.

The implementation should harden correctness first, then refactor boundaries in small reversible steps.

## Goals / Non-Goals

**Goals:**

- Prevent cross-project or cross-window workflow state bleed.
- Ensure retrying or falling back from a chat request cannot execute the same chat turn twice.
- Preserve current product behavior and existing endpoint names where possible.
- Create backend and frontend module seams that make future workflow changes local.
- Keep each phase testable with existing Vitest and Playwright infrastructure.

**Non-Goals:**

- Replacing Fastify, React, Vite, or the current model-provider abstraction.
- Rewriting the entire workflow state machine.
- Adding multi-user authentication.
- Shipping full token-by-token upstream model streaming unless it can be done without expanding scope; safe non-duplicate behavior is the required baseline.

## Decisions

### 1. Use explicit project runtime state objects

Create a `ProjectRuntimeStateStore` owned by `createApp` but keyed by project identity/root path. Route handlers will resolve an active project, then pass its runtime state object into services instead of reading and writing `projectRoot`, `workflowState`, `pendingProposal`, and `pendingDecision` from outer variables.

Alternatives considered:

- Persist every in-flight state change to disk immediately. Rejected for this phase because pending proposals and transient discussion buffers need fast in-memory coordination and can still snapshot durable workflow state at project boundaries.
- Keep the current singleton and add locks. Rejected because locks reduce races but still leave project identity implicit and fragile.

### 2. Make chat turns idempotent at the API boundary

Add a client-generated `requestId` to chat requests. The server records in-flight and completed chat turn results per project/session. A duplicate request with the same `requestId` returns the original result or waits for the in-flight result instead of re-executing workflow mutation.

Alternatives considered:

- Disable all fallback. Rejected as the only fix because users still need recovery from network failures.
- Only dedupe on message text. Rejected because repeated identical user messages can be legitimate.

### 3. Treat pseudo-streaming as a transport, not a second execution path

Short term, keep `/api/chat/stream` as an SSE transport over a single idempotent chat turn. Client fallback may call a recovery/read path with the same `requestId`, but it must not create a new chat turn. Longer term, upstream model streaming can replace chunked completed replies behind the same idempotency contract.

Alternatives considered:

- Remove `/api/chat/stream`. Rejected because the UI already models streaming status and tests cover the path.
- Implement full upstream streaming first. Rejected as too large for the correctness fix; it can be a later enhancement once duplicate execution is impossible.

### 4. Extract services before changing behavior

Backend extraction order:

1. Move runtime state and session restore helpers out of `createApp.ts`.
2. Move chat turn execution into a `ChatTurnService`.
3. Move mode/intent routing into command handlers.
4. Share the repeated `buildPrompt -> generateAssistantReply -> augment -> validate -> snapshot` flow through a proposal-generation helper.

Frontend extraction order:

1. Move project switching and route sync into controller hooks.
2. Move chat submit/persist/retry orchestration into a chat controller.
3. Keep `AppShell` as composition only after behavior is covered by tests.

Alternatives considered:

- Big-bang rewrite. Rejected because current tests are broad but the behavioral surface is high-risk.
- Only move files without behavior tests. Rejected because this would hide existing coupling rather than reduce it.

## Risks / Trade-offs

- [Risk] Idempotency cache can grow without bound. -> Mitigation: scope entries per project and evict old completed request IDs after a bounded TTL or maximum count.
- [Risk] In-flight duplicate requests can deadlock if a promise is not settled. -> Mitigation: always settle entries in `finally` and test failure paths.
- [Risk] Project runtime keys based only on root path can be awkward when registry IDs change. -> Mitigation: prefer project ID when available and normalize root path as fallback for legacy project roots.
- [Risk] Refactoring `AppShell` can break subtle route/project switching behavior. -> Mitigation: extract one controller at a time and preserve existing route guard tests.
- [Risk] Keeping pseudo-streaming may disappoint UX expectations. -> Mitigation: document the baseline as safe SSE transport; true upstream streaming remains a separate enhancement.

## Migration Plan

1. Add server-side request id parsing and runtime state store while preserving old request bodies by generating a server-side request ID when absent.
2. Update web chat requests to always include a request ID.
3. Change stream fallback so retry uses the same request ID and cannot execute a second mutation.
4. Extract backend and frontend modules behind existing tests.
5. Run `pnpm -r test`, `pnpm -r build`, and targeted chat/project-switching regression tests.

Rollback strategy: each phase preserves endpoint compatibility. If a refactor phase regresses behavior, revert that extraction while keeping the idempotency and runtime-state tests as guardrails.

## Open Questions

- What TTL/count should completed chat request records use in desktop usage? Proposed default: 30 minutes or 200 records per project, whichever evicts first.
- Should the client persist request IDs across page reload for in-flight recovery? Proposed answer for this phase: no; dedupe same-session retries only.
