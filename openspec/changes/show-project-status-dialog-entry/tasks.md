## 1. Tests

- [x] 1.1 Add a startup screen test proving management card clicks open a modal project status dialog.
- [x] 1.2 Add a startup screen test proving the dialog's "进入项目" action invokes `onStart('create', project.id)`.
- [x] 1.3 Update management action coverage to use the status dialog.

## 2. Implementation

- [x] 2.1 Add a management-mode continue callback from `StartupScreen` to `ProjectManagerPanel`.
- [x] 2.2 Convert the management detail surface into a project status dialog.
- [x] 2.3 Keep repair, archive/unarchive, remove confirmation, and selected project reset behavior intact.

## 3. Verification

- [x] 3.1 Run targeted startup screen tests.
- [x] 3.2 Run relevant web checks.
- [x] 3.3 Validate the OpenSpec change.
