## Why

The 30-chapter WebUI writing test showed that long chapter generation leaves users unable to tell whether the assistant is actively working, stalled, disconnected, or failed. The current chat transport exposes only coarse waiting/output states, so multi-minute creative turns feel opaque and risky.

## What Changes

- Add observable progress for long chat generation turns, including elapsed time, current phase, connection heartbeat, and clear long-wait messaging.
- Extend `/api/chat/stream` from completed-turn SSE into a progress-aware SSE transport that emits `ready`, `phase`, `heartbeat`, `done`, and `error` events.
- Preserve the existing approval safety model: generated prose still becomes a pending proposal only after the full chat turn completes and validation succeeds.
- Surface transport/model/backend failures as explicit terminal states instead of leaving the user in an indefinite thinking state.
- Keep true token-by-token model streaming out of scope for this change; it can be layered on later behind the same progress contract.

## Capabilities

### New Capabilities

- `observable-chat-generation-progress`: Covers user-visible progress, heartbeat, phase reporting, and terminal states for long assistant generation turns.

### Modified Capabilities

- None.

## Impact

- Affected frontend code: `apps/web/src/features/chat/useChatStream.ts`, `useChatController.ts`, `ChatPanel.tsx`, chat-related styles, and focused chat/workbench tests.
- Affected server code: `apps/server/src/api/createApp.ts`, chat stream response helpers, chat generation/proposal orchestration hooks, and related stream tests.
- API impact: `/api/chat/stream` gains additional SSE event types while preserving existing `done` and `error` event semantics.
- No new external dependency is required.
