## Context

`StartupScreen` owns launcher navigation and passes project actions into `ProjectManagerPanel`. Recent projects already expose a direct continue action through `onContinueProject`. Project management currently renders the selected project's details and maintenance controls inline below the grid after a card click. That inline detail area has no workbench entry action, so management users can repair/archive/remove but cannot continue from the focused project-management flow.

## Goals / Non-Goals

**Goals:**
- Make management card clicks open a modal status dialog for the clicked project.
- Provide a primary "进入项目" action that reuses the existing `onStart('create', project.id)` launcher contract.
- Keep existing maintenance actions in the status dialog.
- Keep recent project selection and direct continue behavior unchanged.

**Non-Goals:**
- Redesign the launcher or project card visual system.
- Add a new route, backend endpoint, or project status model.
- Change archive, repair, or remove API semantics.

## Decisions

- Use the existing Radix-backed dialog primitives already used by `StartupScreen`. This gives the status view proper dialog semantics, focus management, and testable accessibility without introducing new dependencies.
- Move the management detail surface into `ProjectManagerPanel` as a dialog controlled by the selected project. This keeps project-management behavior local while allowing `StartupScreen` to keep owning the actual workbench entry callback.
- Keep destructive removal confirmation inside the dialog. The confirmation belongs to the selected project status context and should disappear when the selected project changes or the dialog closes.
- Use create-mode entry for "进入项目" because the existing recent-project and newly created/imported project flows already treat continuing a project as `onStart('create', project.id)`.

## Risks / Trade-offs

- Dialog-based management changes tests that previously expected inline details. Mitigation: update tests to assert the user-visible modal and available actions.
- Removing a project while the dialog is open can leave a stale selected id in the parent. Mitigation: existing remove handling clears the selected project when needed, and the panel closes the dialog when the selected project no longer exists.
