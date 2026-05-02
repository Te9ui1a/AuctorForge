## 1. File Safety

- [x] 1.1 Add failing tests proving reads through symlinks that escape the project root are rejected.
- [x] 1.2 Add failing tests proving writes through symlinked workflow targets are rejected and outside files remain unchanged.
- [x] 1.3 Add realpath/lstat checks in the file gateway.
- [x] 1.4 Verify normal project file reads and writes still pass.

## 2. Chat Transport Reliability

- [x] 2.1 Add a frontend regression test documenting that default chat timeout is at least as long as backend assistant generation timeout.
- [x] 2.2 Align the frontend default chat request timeout with backend generation timeout.
- [x] 2.3 Document `/api/chat/stream` as a compatibility SSE endpoint until true token streaming exists.
- [x] 2.4 Verify stream fallback still reuses the same request ID.

## 3. Runtime Input Validation

- [x] 3.1 Add unit and route tests for invalid file/folder names: empty, `.`, `..`, slash, and backslash.
- [x] 3.2 Validate file/folder names as a single basename and return `invalid-project-entry-name` with HTTP 400.
- [x] 3.3 Add zod model settings parser tests for invalid active model IDs and malformed nested configs.
- [x] 3.4 Validate `/api/settings/model` request bodies before persistence and return `invalid-model-settings` with HTTP 400.

## 4. Prompt Budgeting

- [x] 4.1 Add tests proving oversized required project files are truncated with visible summaries.
- [x] 4.2 Add tests proving oversized attachments are truncated with filename and size preserved.
- [x] 4.3 Add prompt budget helper and apply it to project file and attachment content.
- [x] 4.4 Verify prompt sections remain stable for normal-sized content.

## 5. Verification

- [x] 5.1 Run `openspec validate --all`.
- [x] 5.2 Run targeted server and web tests for changed modules.
- [x] 5.3 Run `pnpm -r test`.
- [x] 5.4 Run `pnpm -r build`.
- [x] 5.5 Run `pnpm test:e2e`.
