## Why

The startup and workbench secondary controls still contain interactions that can surprise users: removing a project from the launcher registry happens immediately, the file creation overlay is visually modal without dialog semantics, and closing a dirty editor tab uses a native confirm where cancel discards changes. These are adjacent to the newly fixed project creation flow and should be made safer and clearer.

## What Changes

- Require an explicit confirmation state before removing a project from the project list.
- Keep repair and archive actions unchanged.
- Give the file/folder creation overlay dialog semantics and accessible naming while preserving its existing form behavior.
- Replace the dirty editor tab native confirm with an explicit in-app dialog where cancel keeps the file open.

## Capabilities

### New Capabilities
- `secondary-interaction-safety`: Covers safety and accessibility behavior for secondary project-management and file-tree interactions.

### Modified Capabilities

None.

## Impact

- Affected UI: `apps/web/src/features/startup/ProjectManagerPanel.tsx`, `apps/web/src/features/startup/StartupScreen.tsx`, `apps/web/src/features/files/FileTree.tsx`, `apps/web/src/App.tsx`, `apps/web/src/features/editor/UnsavedCloseDialog.tsx`, `apps/web/src/features/workbench/AppViews.tsx`
- Affected tests: `apps/web/src/features/startup/ProjectManagerPanel.test.tsx`, `apps/web/src/features/startup/StartupScreen.test.tsx`, `apps/web/src/features/files/FileTree.test.tsx`, `apps/web/src/App.test.tsx`
- No backend API changes expected.
