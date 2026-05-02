## Context

The project management panel exposes maintenance actions after the user selects a project. `repair` and `archive` are reversible or non-destructive enough for direct action, but `remove` deletes the project from the registry immediately. The file tree uses a custom overlay form for creating files/folders; it avoids `prompt`, but assistive technology sees it as a plain form rather than a dialog. Dirty editor tab close currently uses a native confirm with reversed expectations: cancel still closes the file without saving.

## Goals / Non-Goals

**Goals:**
- Prevent accidental project-list removal by requiring a deliberate second click.
- Keep the confirmation lightweight and local to the selected project detail card.
- Add dialog role, modal state, and stable labelling to the file create overlay.
- Replace dirty tab close confirm with a named in-app modal where cancel aborts the close.

**Non-Goals:**
- Change backend remove/archive/repair semantics.
- Add a new shared modal component.
- Redesign the file tree or project manager layout.
- Change document save APIs or editor tab layout.

## Decisions

- Use an inline confirmation state for project removal rather than a separate modal. This keeps the action near the project details and avoids stacking more overlays in the startup screen.
- Reset the pending removal confirmation when the selected project changes. This prevents a confirmation from carrying over to another project.
- Add semantic attributes to the existing file creation overlay instead of replacing its form. This preserves current keyboard submission and tests while improving accessibility.
- Add a small dedicated dirty-close dialog that reuses the app dialog primitives. It exposes explicit cancel, discard-and-close, and save-and-close actions.

## Risks / Trade-offs

- Inline confirmation is less forceful than a modal. Mitigation: change the destructive button label to a specific confirmation prompt and expose a visible cancel action.
- Adding dialog semantics to a custom overlay does not provide full focus trapping. Mitigation: the existing input autofocus remains, and this scoped change avoids introducing a new dependency or behavior shift.
- A new dirty-close overlay adds one more dialog path. Mitigation: keep it local to editor tab close and test cancel/save behavior in the integrated app flow.
