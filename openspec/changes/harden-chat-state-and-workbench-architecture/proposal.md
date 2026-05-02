## Why

The current server and workbench architecture passes tests but concentrates high-risk mutable state and workflow branching in a few large modules. This change reduces duplicate chat execution, prevents cross-project state bleed, and creates maintainable boundaries before more workflow features are added.

## What Changes

- Introduce explicit per-project runtime state on the server instead of relying on mutable `createApp` closure fields for active project workflow, pending proposal, pending decision, and discussion notes.
- Make chat turns idempotent so stream fallback, retries, and duplicate submissions cannot execute the same non-idempotent workflow transition twice.
- Align `/api/chat/stream` with its actual behavior by either using a real streaming generation path or by removing automatic client replay after a partial stream has already reached the server.
- Split the frontend workbench shell into controller hooks and presentational views for route synchronization, project switching, session refresh, chat orchestration, document state, and layout state.
- Extract backend chat turn routing into explicit command/service modules with shared proposal-generation helpers instead of a single route-level conditional chain.
- Add focused regression coverage for concurrent project windows, duplicate chat request IDs, stream failure behavior, and controller boundaries.

## Capabilities

### New Capabilities

- `project-session-state-isolation`: Runtime workflow state is scoped to an explicit project/session identity and cannot bleed across projects or browser windows.
- `chat-turn-idempotency`: Chat turns have request identity and retry semantics that prevent duplicate workflow mutations.
- `workbench-controller-boundaries`: The workbench UI exposes stable controller boundaries so project, chat, document, route, and layout behavior can evolve independently.
- `chat-command-routing`: Backend chat behavior is routed through testable command handlers and shared generation helpers.

### Modified Capabilities

- None.

## Impact

- Affected server code: `apps/server/src/api/createApp.ts`, chat/session interop modules, workflow state restoration, project lifecycle endpoints, and related tests.
- Affected web code: `apps/web/src/App.tsx`, `apps/web/src/features/chat/useChatStream.ts`, workbench document/session hooks, and related tests.
- API impact: chat request bodies gain a request identity field; chat responses may expose enough request metadata for safe retry/recovery.
- No new external dependency is required.
