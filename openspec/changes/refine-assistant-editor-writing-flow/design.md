## Context

Proposal approval already works through chat text: `useChatController` submits user messages, and `deriveChatTurnStrategy` treats explicit confirmation words as approval when a pending proposal exists. The UI currently duplicates that path with a dedicated `确认写入` button in `ChatPanel`.

Editor save behavior is currently stricter than manual authoring needs. `App.tsx` only enables saving when the current path is in workflow allowed writes or manual writable paths, even though the file API can save project files and users may need to update setting documents at any time.

## Goals / Non-Goals

**Goals:**

- Keep proposal approval in the conversation and let the model phrase the confirmation request naturally.
- Preserve explicit user control before writing proposals to disk.
- Let manually opened project files be edited and saved unless they are proposal previews.
- Make the assistant composer larger, integrated, and icon-driven.
- Reduce document editor text/chrome scale.

**Non-Goals:**

- Do not auto-write model proposals.
- Do not change backend proposal validation or approval semantics.
- Do not add autosave.
- Do not redesign the entire workbench layout.

## Decisions

1. Reuse chat approval text instead of adding a modal.
   - Rationale: the user wants model freedom and a conversational confirmation moment.
   - Alternative considered: a confirmation dialog. Rejected because it interrupts creative flow.
2. Manual save permission depends on loaded document and proposal-preview state.
   - Rationale: workflow write targets should guide assistant generation, not block human edits.
   - Alternative considered: expanding `manualWritablePaths` on the backend. Rejected because this is a UI manual-authoring affordance and does not need API changes.
3. Composer controls live inside a single visual frame.
   - Rationale: upload and send are part of one drafting action.
   - Alternative considered: keep separate action row. Rejected because it is visually fragmented and makes the input feel small.

## Risks / Trade-offs

- Users might save files that the workflow was not currently focused on. Mitigation: preserve proposal previews as read-only and keep existing project-scoped file save validation.
- Removing the approval button may reduce discoverability. Mitigation: keep the pending proposal notice and ensure assistant reply text asks for confirmation in chat.
- Typography changes can affect snapshots/layout assumptions. Mitigation: update focused tests and run browser/build verification.

## Migration Plan

No data migration is required. Existing pending proposals continue to approve through chat text such as `确认`.
