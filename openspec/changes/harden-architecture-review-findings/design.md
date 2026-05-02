# Design

## Context

The app is local-first, but users can open multiple browser windows and switch projects independently. Server-side runtime state is now keyed per project, but route handlers still choose the project through a process-wide active project context.

## Goals / Non-Goals

**Goals:**

- Make project-scoped requests explicit and deterministic.
- Return clear request-boundary errors for malformed file-save input.
- Preserve tolerant missing-file behavior only for actual missing files.
- Avoid duplicate chat turns and clarify stream transport behavior.
- Reduce backend and frontend god-object boundaries in small, testable extractions.

**Non-Goals:**

- Multi-user authentication or authorization.
- Full rewrite of the workflow state machine.
- Full upstream token streaming unless it can be safely introduced behind the current idempotency contract.
- Visual redesign of the workbench.

## Decisions

### 1. Use request-scoped project identity

Project-scoped client requests will include `x-project-id` when the registry id is known. The server will resolve the header against the registry and select the corresponding runtime state for that request. Legacy requests without the header keep the current active-project fallback temporarily. Requests with an explicit but unknown or mismatched project identity fail with a clear 404/409 response and never fall back to the active project.

### 2. Validate at API boundaries

`PUT /api/file` will parse an unknown body and reject invalid `path` or `content` before calling workflow/file services. This follows the existing model-settings and create-entry validation approach.

### 3. Surface infrastructure errors from prompt reads

Prompt assembly may treat `ENOENT` as a missing required project file. It must not swallow symlink escapes, permission errors, malformed paths, or other file gateway failures.

### 4. Keep stream idempotency; clarify transport semantics

The current stream endpoint is completed-turn SSE, not token streaming. This change will add an early `ready` event before long work starts and assert in tests/client handling that the endpoint is compatibility SSE over one idempotent chat turn.

### 5. Extract orchestration after safety fixes

Backend extraction starts with pure services that receive explicit dependencies and project runtime state. Frontend extraction starts with view-model objects, not new global state.

## Risks / Trade-offs

- [Risk] Legacy clients without project headers still depend on active project fallback. -> Mitigation: keep fallback only while web client is migrated, and add tests proving header requests ignore later active-project changes.
- [Risk] More headers increase request plumbing. -> Mitigation: centralize header construction in the web API client.
- [Risk] Service extraction can become file shuffling. -> Mitigation: require handler-level tests and reduce `createApp.ts` responsibilities, not just move code.
