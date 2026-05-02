## Why

Creating a new story currently leaves the user on the launcher after project creation, forcing an extra selection step. The creation form also appears inline in the launcher instead of as a modal dialog, which makes the primary "start a new story" path feel like page content rather than a focused project setup flow.

## What Changes

- Present the "start a new story" project form in a modal dialog overlay.
- After a project is created from the new-story dialog, immediately enter the create-mode workbench for that new project.
- Preserve existing manual folder entry and native folder picker fallback behavior.

## Capabilities

### New Capabilities
- `startup-project-entry`: Covers launcher behavior for creating/importing/selecting a project before entering the workbench.

### Modified Capabilities

None.

## Impact

- Affected UI: `apps/web/src/features/startup/StartupScreen.tsx`
- Affected tests: `apps/web/src/features/startup/StartupScreen.test.tsx`
- No backend API or persistence changes expected.
