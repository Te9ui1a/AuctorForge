## Context

The current frontend distinguishes only `thinking`, `streaming`, and `idle`. In practice, chapter drafting often stays in `thinking` for minutes because `/api/chat/stream` sends `ready`, executes the complete `/api/chat` turn internally, then emits `proposal_item` and `done` only after the turn finishes. Tests intentionally assert that this compatibility stream has no fake token events.

This means the UI has no trustworthy intermediate signal for long-running generation. Users can see that the send button is disabled and that a small thinking indicator exists, but they cannot tell whether the backend is preparing context, calling the model, validating a draft, snapshotting a proposal, stuck, or disconnected.

## Goals / Non-Goals

**Goals:**

- Make long chat turns visibly alive within 10-15 seconds of starting.
- Show elapsed time and a human-readable phase while a generation turn is in progress.
- Distinguish active waiting, long waiting, transport failure, and backend/model failure.
- Preserve existing idempotent chat turn behavior and pending-proposal approval semantics.
- Add tests that prove progress events are emitted, consumed, and surfaced accessibly.

**Non-Goals:**

- No true token-by-token upstream model streaming in this change.
- No partial draft persistence or half-written proposal files.
- No redesign of the whole chat panel or workbench layout.
- No change to chapter validation rules, AI-flavor review rules, or confirmation requirements.

## Decisions

### 1. Add progress events to the existing SSE route

`/api/chat/stream` will remain the preferred endpoint when model streaming is enabled, but it will emit progress-specific events in addition to the current `done` and `error` events.

Initial event contract:

- `ready`: request accepted and stream established.
- `phase`: current server-side phase changed.
- `heartbeat`: server is still alive during a long phase.
- `done`: final chat response is available.
- `error`: terminal failure with structured error payload.

Alternatives considered:

- Poll `/api/progress` during generation. Rejected because it reports workflow state, not in-flight chat turn state, and polling would lag behind the actual request.
- Implement token streaming first. Rejected because it expands scope into model adapters, partial rendering, validation timing, and failure recovery.

### 2. Report coarse server phases, not implementation internals

The server should emit a small stable phase vocabulary:

- `preparing`: resolving project, mode, active document, and request context.
- `building_prompt`: gathering project files and constructing the assistant prompt.
- `calling_model`: waiting on the configured model provider.
- `validating`: parsing, augmenting, and validating the assistant response.
- `snapshotting`: creating pending proposal/session state and preparing the final response.

These phases are intentionally user-facing and coarse. They should not expose provider secrets, prompt content, file contents, or stack traces.

Alternatives considered:

- Emit very detailed internal steps. Rejected because those labels are brittle and can leak implementation details.
- Show only elapsed time. Rejected because elapsed time alone still leaves users unable to tell what kind of wait they are experiencing.

### 3. Keep heartbeat independent from token output

During any phase that may take more than a few seconds, the server will emit `heartbeat` at a bounded interval, defaulting to about 10 seconds. A heartbeat means the server process and response stream are still active; it does not imply model progress or generated text length.

Alternatives considered:

- Simulate generated tokens. Rejected because fake output creates misleading expectations and conflicts with existing tests.
- Use browser-only timers. Rejected because client timers cannot prove the backend connection is alive.

### 4. Add a frontend progress model separate from assistant messages

The frontend will track an in-flight progress state with:

- request start time and elapsed time,
- current phase label,
- last server event timestamp,
- connection status,
- terminal error state when applicable.

The progress UI should render as a compact status surface near the chat log/composer, with `role="status"` or equivalent accessible semantics. Existing final assistant messages and `thinkingDuration` remain unchanged.

Alternatives considered:

- Append progress as chat messages. Rejected because it pollutes the creative conversation history and persisted chat session.
- Put all progress in button text. Rejected because the state is too rich for a button and may be missed during long waits.

### 5. Preserve fallback and idempotency behavior

If the stream fails before any server-side progress beyond `ready`, existing fallback can recover with the same `requestId`. If progress has already been observed, the client must avoid starting a fresh non-idempotent turn; it should rely on same-request recovery or surface a retry-safe failure message.

Alternatives considered:

- Disable fallback entirely. Rejected because short transport failures should still be recoverable.
- Retry with a new request ID. Rejected because it can duplicate non-idempotent workflow mutations.

## Risks / Trade-offs

- [Risk] Phase events can become inaccurate if emitted too far from the actual work. -> Mitigation: emit them at component boundaries immediately before the corresponding operation starts.
- [Risk] Heartbeats could mask a model provider hang. -> Mitigation: keep the existing overall request timeout and surface long-wait copy after threshold timers.
- [Risk] More SSE events complicate tests. -> Mitigation: keep a narrow event schema and add focused parser/unit tests.
- [Risk] Users may still expect live draft text. -> Mitigation: copy should say "生成中/校验中" rather than implying text streaming.

## Migration Plan

1. Add server-side stream event helpers and tests for `ready`, phase, heartbeat, `done`, and `error` ordering.
2. Thread a progress reporter through the chat turn path at coarse boundaries without changing final response shapes.
3. Update frontend stream parsing to consume progress events and expose an in-flight progress model.
4. Render the compact progress UI and long-wait copy in the chat panel.
5. Verify stream fallback, timeout, reduced motion/accessibility, and a manual long-generation smoke test.

Rollback strategy: because final `done` and `error` payloads remain compatible, the progress events can be disabled or ignored client-side without changing the existing chat response contract.
