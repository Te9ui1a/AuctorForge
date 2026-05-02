## Why

The full code-quality review found five risks in the current WebUI implementation: project file access can follow symlinks outside the active project root, the stream-compatible chat route can take longer than the frontend timeout before sending any SSE event, file/folder creation accepts path-shaped names, model settings are persisted without runtime validation, and prompt assembly injects full files/attachments without a size budget.

## What Changes

- Harden project file reads and writes so symlinked paths cannot escape the active project root.
- Align chat stream-compatible behavior with long-running backend generation so client fallback does not fire before the backend timeout.
- Validate create-file/create-folder input as a single basename and return structured 400 errors for invalid names.
- Validate model settings with runtime schemas before persistence.
- Add deterministic prompt content budgeting with visible truncation summaries for oversized project files and attachments.

## Capabilities

### New Capabilities

- `project-file-safety`: Project file access is constrained by real filesystem paths, not only lexical path checks.
- `chat-transport-reliability`: Chat transport behavior remains reliable for long-running generation and stream fallback.
- `runtime-input-validation`: Runtime API inputs are validated before filesystem or settings persistence side effects.
- `prompt-budgeting`: Prompt assembly enforces explicit size budgets and reports truncation.

### Modified Capabilities

- None.

## Impact

- Affected server code: `apps/server/src/core/files/fileGateway.ts`, `apps/server/src/core/files/createProjectEntry.ts`, `apps/server/src/core/settings/modelConfig.ts`, `apps/server/src/core/chat/buildPrompt.ts`, `apps/server/src/api/createApp.ts`, and related tests.
- Affected web code: `apps/web/src/features/chat/useChatStream.ts` and related tests.
- API impact: malformed file/folder names and malformed model settings return structured 400 responses instead of falling through to filesystem errors or persisted invalid config.
- No new external dependency is expected because `zod` is already available in the server package.
