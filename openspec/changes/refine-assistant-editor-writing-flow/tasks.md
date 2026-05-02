## 1. OpenSpec Artifacts

- [x] 1.1 Write the proposal.
- [x] 1.2 Write the design.
- [x] 1.3 Write the assistant-editor-writing-flow spec.
- [x] 1.4 Validate the OpenSpec change.

## 2. Chat Proposal Confirmation and Composer

- [x] 2.1 Add failing ChatPanel tests for conversational proposal confirmation and integrated composer controls.
- [x] 2.2 Verify the ChatPanel tests fail for the current implementation.
- [x] 2.3 Remove the prominent proposal approval button and build the integrated composer frame.
- [x] 2.4 Remove unused approval-button props and handler plumbing if TypeScript reports it as unused.
- [x] 2.5 Verify the ChatPanel tests pass.

## 3. Manual Editing and Saving

- [x] 3.1 Add a failing App integration test for saving a manually opened file outside workflow write targets.
- [x] 3.2 Verify the App integration test fails for the current implementation.
- [x] 3.3 Loosen frontend manual save gating to any loaded non-proposal document.
- [x] 3.4 Verify the App integration test passes.

## 4. Editor Density

- [x] 4.1 Add a failing DocumentEditor density test.
- [x] 4.2 Verify the DocumentEditor density test fails for the current implementation.
- [x] 4.3 Reduce manuscript and editor chrome density.
- [x] 4.4 Verify the DocumentEditor tests pass.

## 5. Focused Integration Verification

- [x] 5.1 Run focused ChatPanel and DocumentEditor tests.
- [x] 5.2 Run affected App tests.
- [x] 5.3 Build the web app.
- [x] 5.4 Validate OpenSpec after implementation.

## 6. Manual Browser Check

- [x] 6.1 Start local app servers.
- [x] 6.2 Verify browser entry with the existing Playwright smoke covering workbench entry, chat submit, save, and dirty-switch protection.

## 7. Completion Notes

- [x] 7.1 Update OpenSpec task completion status.
- [x] 7.2 Record verification evidence and workflow deviations.
