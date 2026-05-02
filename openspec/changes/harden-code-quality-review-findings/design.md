## Context

The reviewed codebase is a local-first novel workflow WebUI, but it still processes user-selected project roots and request bodies. That means the implementation must treat filesystem paths and persisted settings as untrusted runtime input even though the app runs locally.

## Goals / Non-Goals

**Goals:**

- Prevent symlink escapes for project file reads and writes.
- Keep long-running chat turns from failing due to frontend timeout being shorter than backend generation timeout.
- Return clear 400 responses for invalid file/folder names and invalid model settings payloads.
- Bound prompt size deterministically while preserving section labels and useful context.
- Preserve existing endpoint names and request-id idempotency behavior.

**Non-Goals:**

- Full upstream token-by-token model streaming.
- Authentication, authorization, or multi-user permission design.
- Rewriting the chat routing architecture.
- Changing the novel workflow contract or stage order.

## Decisions

### 1. Reject symlinked workflow write targets

`path.resolve` alone is insufficient because Node file operations follow symlinks. Reads will check the target realpath against the project root realpath. Writes will reject existing symlink targets and verify the parent directory realpath before writing.

Alternatives considered:

- Allow symlinks if they point inside the project. Rejected for the initial hardening pass because safe write semantics through symlinks are subtle and not needed by the workflow.
- Only validate user-created file names. Rejected because imported projects can already contain symlinks.

### 2. Treat `/api/chat/stream` as compatibility SSE until true streaming exists

The endpoint currently emits proposal metadata and final payload after the chat turn completes. This change will not pretend to add token streaming. It will align frontend timeout with backend generation timeout and preserve request-id reuse so fallback remains idempotent.

Alternatives considered:

- Implement true model streaming now. Rejected as larger than this hardening scope.
- Remove the stream endpoint. Rejected because existing UI/tests use it and fallback behavior is already guarded by request IDs.

### 3. Validate runtime inputs at API boundaries

TypeScript route generics do not validate JSON at runtime. File/folder creation and model settings writes must parse and reject malformed bodies before side effects. Model settings will use zod because the server already depends on zod.

### 4. Use deterministic truncation summaries

Prompt assembly will retain the beginning and end of oversized content and insert a summary marker with original and retained character counts. This keeps prompts debuggable while avoiding unbounded token growth.

## Risks / Trade-offs

- [Risk] Rejecting symlinked files may block a user who intentionally stores project files through symlinks. -> Mitigation: return clear errors and keep the policy strict for safety.
- [Risk] Increasing the frontend chat timeout means users wait longer before seeing a network failure. -> Mitigation: this matches backend reality; true progress/heartbeat streaming remains a future enhancement.
- [Risk] Prompt truncation can omit relevant middle content. -> Mitigation: preserve head and tail plus explicit truncation markers so behavior is observable.
