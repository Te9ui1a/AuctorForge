## 1. Request-Scoped Project Targeting

- [x] 1.1 Add failing cross-window server tests for session/progress reads, file content/tree reads, file save, chat session persistence, and chat turn targeting.
- [x] 1.2 Add `projectRequestContext` header parsing and registry resolution.
- [x] 1.3 Wire project-scoped routes to resolve state from request identity and reject unknown or mismatched explicit identity without active-project fallback.
- [x] 1.4 Add web API header helper and send project identity from project-scoped calls.
- [x] 1.5 Verify legacy requests still work when no project identity is supplied, while explicit headers take precedence or fail clearly.

## 2. File Safety and Runtime Validation

- [x] 2.1 Add failing prompt-read tests for ENOENT vs unsafe filesystem errors.
- [x] 2.2 Update `buildPrompt` to catch only missing-file errors.
- [x] 2.3 Add failing route tests for malformed `PUT /api/file` bodies.
- [x] 2.4 Add validated file-save body parsing and clear HTTP 400 response.

## 3. Chat Transport Semantics

- [x] 3.1 Add tests documenting current completed-turn SSE behavior and idempotent recovery.
- [x] 3.2 Add an early `ready` event carrying a completed-turn SSE transport marker, and update client parsing/tests to distinguish it from token streaming.
- [x] 3.3 Verify fallback still reuses `requestId` and never double-executes workflow mutation.

## 4. Backend Boundary Extraction

- [x] 4.1 Extract `proposalApprovalService` with tests.
- [x] 4.2 Extract `chatTurnService` with explicit dependencies and tests.
- [ ] 4.3 Move intent matching into a command-routing module or command definitions.
- [ ] 4.4 Keep `createApp.ts` responsible for app setup and route registration only.

## 5. Frontend Workbench Boundary Extraction

- [x] 5.1 Introduce `WorkbenchViewProps` grouped view models.
- [x] 5.2 Build `projectShell`, `editorPane`, `assistantPane`, `contextRail`, and `overlays` objects in `AppShell`.
- [x] 5.3 Update `WorkbenchView` to consume grouped props.
- [x] 5.4 Preserve existing `App.test.tsx` and focused component tests.

## 6. Verification

- [x] 6.1 Run `openspec validate --all`.
- [x] 6.2 Run `pnpm --filter server test`.
- [x] 6.3 Run `pnpm --filter web test`.
- [x] 6.4 Run `pnpm -r build`.
- [x] 6.5 Run `pnpm test:e2e`.
