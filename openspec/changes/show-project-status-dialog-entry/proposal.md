## Why

The project management view currently selects a project inline when a card is clicked, but it does not provide a focused status view or an obvious way to enter that project. This makes the management path feel like a dead end for writers who opened it to inspect and continue a project.

## What Changes

- Show a modal project status dialog when a user clicks a project card in project management.
- Add an "进入项目" primary action inside that dialog that opens the selected project in create mode.
- Keep repair, archive/unarchive, and remove actions available from the same status dialog.
- Preserve the recent-project list behavior, including its direct "选择并继续" action.

## Capabilities

### New Capabilities
- `project-management-status-entry`: Covers status review and workbench entry from the launcher project management view.

### Modified Capabilities

None.

## Impact

- Affected UI: `apps/web/src/features/startup/StartupScreen.tsx`, `apps/web/src/features/startup/ProjectManagerPanel.tsx`
- Affected tests: `apps/web/src/features/startup/StartupScreen.test.tsx`
- No backend API, data model, persistence, or routing changes expected.
