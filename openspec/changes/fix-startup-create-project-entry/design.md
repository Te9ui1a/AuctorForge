## Context

`StartupScreen` owns the launcher actions for creating, importing, selecting, and managing projects. The current create/import form is conditionally rendered as an inline `section` after the hero. `handleSubmitProject` creates or imports the project, stores it in local project state, selects it, clears the draft, and stops there. Existing recent-project and selected-project flows already enter the workbench via `onStart('create', project.id)`.

## Goals / Non-Goals

**Goals:**
- Make the create/import project form a true modal dialog with stable accessibility semantics.
- Route a successfully created new story directly into create-mode workbench via the existing `onStart` contract.
- Keep import behavior compatible with the current "导入并继续" label by continuing into the create-mode workbench after import.
- Keep folder picker timeout and manual path fallback intact.

**Non-Goals:**
- Redesign the entire startup page.
- Change backend project creation/import APIs.
- Change project management behavior for existing projects.

## Decisions

- Use the existing app-local dialog primitives from `components/ui/dialog` for the project setup overlay. This keeps the implementation consistent with the Radix dialog stack already available to the web app instead of hand-rolling focus trapping around an inline section.
- Call `onStart('create', project.id)` after a successful create or import. The launcher already uses this callback to enter the workbench, and reusing it avoids introducing a separate navigation path.
- Preserve local state updates before navigation. Adding the project to the local list and selecting it keeps the launcher state coherent if navigation is delayed, cancelled by a parent, or tested in isolation.

## Risks / Trade-offs

- Dialog semantics can affect tests that query by heading or section structure. Mitigation: update tests to assert user-visible behavior and modal accessibility hooks rather than the previous inline container.
- Calling `onStart` can make parent-controlled navigation asynchronous. Mitigation: await the existing callback inside the submit flow and keep the submitting state active until it resolves or rejects.
