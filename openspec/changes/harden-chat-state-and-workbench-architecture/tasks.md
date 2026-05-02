## 1. Correctness Baseline

- [x] 1.1 Add failing server tests proving project A and project B cannot share pending proposal, pending decision, workflow state, discussion notes, or project root during overlapping requests.
- [x] 1.2 Add failing web/server tests proving stream fallback with the same user turn cannot execute `/api/chat` twice.
- [x] 1.3 Add request body and response typing for optional chat `requestId` while preserving legacy clients.

## 2. Project Runtime State Isolation

- [x] 2.1 Introduce a `ProjectRuntimeStateStore` keyed by registry project ID with normalized project root fallback.
- [x] 2.2 Move `initialized`, `workflowState`, `pendingProposal`, `pendingDecision`, and `discussionBuffer` into project runtime state objects.
- [x] 2.3 Update project open/import/create/repair/archive/remove flows to restore, clear, or select runtime state explicitly.
- [x] 2.4 Update `/api/session`, `/api/progress`, `/api/file`, and file creation/save routes to resolve project context once and pass it through explicitly.
- [x] 2.5 Verify cross-project project switching and chat session restoration tests pass.

## 3. Chat Turn Idempotency and Stream Safety

- [x] 3.1 Add a bounded per-project chat request registry for in-flight and completed `requestId` results.
- [x] 3.2 Wrap `/api/chat` turn execution so duplicate `requestId` calls reuse the original in-flight or completed result.
- [x] 3.3 Update `useChatStream` to generate one `requestId` per submit and reuse it for stream recovery.
- [x] 3.4 Change stream fallback so it does not replay the turn with a fresh request identity.
- [x] 3.5 Add regression tests for duplicate completed requests, duplicate in-flight requests, stream partial failure, and legacy no-`requestId` requests.

## 4. Backend Chat Routing Extraction

- [x] 4.1 Extract chat route context types and response helpers from `createApp.ts`.
- [x] 4.2 Extract a shared proposal generation helper for prompt generation, assistant call, augmentation, validation, and snapshotting.
- [x] 4.3 Extract command handlers for approval, guide, define, analyze, review, discussion hold, chapter continuation, and default proposal generation.
- [x] 4.4 Replace the long `/api/chat` conditional chain with a `ChatTurnService` that delegates to command handlers.
- [x] 4.5 Add handler-level tests for branches that previously relied only on the route-level integration test.

## 5. Frontend Workbench Boundary Extraction

- [x] 5.1 Extract route canonicalization and workbench route synchronization from `AppShell`.
- [x] 5.2 Extract project switching, snapshot/restore, dirty-draft blocking, and start-mode behavior into a project controller hook.
- [x] 5.3 Extract session refresh, file tree loading, and preferred document restoration into a session/document controller.
- [x] 5.4 Extract chat submit, retry, persistence, attachment handling, and mode shortcuts into a chat controller.
- [x] 5.5 Reduce `AppShell` to composition of controllers and presentational workbench/startup views.

## 6. Verification and Cleanup

- [x] 6.1 Run `pnpm -r test`.
- [x] 6.2 Run `pnpm -r build`.
- [x] 6.3 Run targeted browser smoke for project switching, chat submit, stream fallback, dirty draft switch dialog, and manual file save.
- [x] 6.4 Confirm generated `dist/`, `out/`, `test-results/`, and logs remain ignored or excluded from review scope.
