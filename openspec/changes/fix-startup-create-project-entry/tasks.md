## 1. Tests

- [x] 1.1 Add a startup screen test proving the new story form opens as a modal dialog with the expected controls.
- [x] 1.2 Add a startup screen test proving successful project creation invokes `onStart('create', newProject.id)`.
- [x] 1.3 Update import coverage to prove successful import continues into create-mode workbench.

## 2. Implementation

- [x] 2.1 Convert the inline create/import sheet into a modal dialog using the existing dialog primitives.
- [x] 2.2 Update project submit handling so created and imported projects select the project and await `onStart('create', project.id)`.
- [x] 2.3 Preserve existing cancellation, picker timeout, manual path, and failure behavior.

## 3. Verification

- [x] 3.1 Run targeted startup screen tests.
- [x] 3.2 Run relevant web tests or build checks.
- [x] 3.3 Validate the OpenSpec change.
