## 1. Server Progress Events

- [x] 1.1 Add focused server tests for `/api/chat/stream` emitting `ready`, `phase`, `heartbeat`, and `done` in a successful long turn.
- [x] 1.2 Add focused server tests for `/api/chat/stream` emitting `ready`, `phase`, and structured `error` for accepted-turn failures.
- [x] 1.3 Introduce typed stream progress event helpers for `ready`, `phase`, `heartbeat`, `done`, and `error`.
- [x] 1.4 Thread a progress reporter through chat turn execution at coarse boundaries: preparing, building prompt, calling model, validating, and snapshotting.
- [x] 1.5 Add heartbeat emission during long phases without changing the final chat response payload.

## 2. Frontend Progress State

- [x] 2.1 Add `useChatStream` tests for parsing `phase` and `heartbeat` events without treating them as assistant text.
- [x] 2.2 Extend `useChatStream` to expose in-flight progress state including phase, start time, elapsed time, last event time, and terminal error.
- [x] 2.3 Update `useChatController` to pass progress state to the chat panel while preserving existing message persistence and retry behavior.
- [x] 2.4 Ensure stream fallback and timeout paths reuse the original `requestId` and surface a retry-safe failure state.

## 3. Chat UI

- [x] 3.1 Add `ChatPanel` tests for accessible active progress, elapsed time, phase label, heartbeat freshness, long-wait copy, and failure state.
- [x] 3.2 Render a compact progress status surface near the chat log or composer without appending progress messages to chat history.
- [x] 3.3 Add user-facing phase labels and long-wait copy for chapter-scale generation.
- [x] 3.4 Preserve reduced-motion behavior and avoid layout shift while progress status updates.

## 4. Verification

- [x] 4.1 Run focused server stream tests.
- [x] 4.2 Run focused frontend chat stream/controller/panel tests.
- [x] 4.3 Run web build and relevant package tests.
- [x] 4.4 Run `openspec validate add-observable-chat-generation-progress --strict`.
- [ ] 4.5 Run a manual WebUI smoke test with a chapter generation turn and confirm progress updates remain visible until completion or failure.
