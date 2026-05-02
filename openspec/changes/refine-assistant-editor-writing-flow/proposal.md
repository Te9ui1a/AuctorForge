## Why

The current assistant write-confirmation button feels mechanical and interrupts the creative dialogue. The editor also blocks direct saving for files outside the workflow write target, which prevents users from pasting or drafting known settings whenever they are ready.

## What Changes

- Replace the prominent `确认写入` composer button with conversational proposal confirmation: after a proposal is generated, the assistant asks the user to confirm, revise, or continue discussing in the chat.
- Allow users to edit and save any loaded project file unless the current editor content is a proposal preview or no document is loaded.
- Recompose the assistant input area as one larger composer that includes file upload and icon-only send controls inside the input frame.
- Reduce editor typography and chrome density so the writing area feels calmer and less oversized.

## Capabilities

### New Capabilities

- `assistant-editor-writing-flow`: Covers conversational proposal confirmation, direct manual file editing/saving, assistant composer layout, and editor density.

### Modified Capabilities

## Impact

- Affected frontend code: `apps/web/src/features/chat/ChatPanel.tsx`, `apps/web/src/features/chat/useChatController.ts`, `apps/web/src/features/workbench/AppViews.tsx`, `apps/web/src/App.tsx`, `apps/web/src/features/editor/DocumentEditor.tsx`, `apps/web/src/styles.css`.
- Affected tests: chat panel tests, document editor tests, and app integration tests.
- No backend API or data model change is intended.
