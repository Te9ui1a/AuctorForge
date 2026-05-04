## Why

The launcher recent-project and project-management views underuse horizontal space on desktop displays. Recent projects are stacked vertically and project management tops out at two columns, so writers with several projects must scroll more than necessary.

## What Changes

- Render recent projects and project management project lists as compact responsive grids.
- Use four project cards per row on wide desktop viewports, then fall back to fewer columns on narrower screens.
- Tighten project card spacing and metadata presentation so the grid feels intentional rather than cramped.
- Preserve the existing management status dialog and recent-project continue behavior.

## Capabilities

### New Capabilities
- `launcher-project-grid-density`: Covers compact responsive project grids in the launcher recent-project and management views.

### Modified Capabilities

None.

## Impact

- Affected UI: `apps/web/src/features/startup/ProjectManagerPanel.tsx`, `apps/web/src/features/startup/ProjectCard.tsx`, `apps/web/src/styles.css`
- Affected tests: `apps/web/src/features/startup/ProjectManagerPanel.test.tsx`
- No backend API, persistence, routing, or project lifecycle behavior changes expected.
