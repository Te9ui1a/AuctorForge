## 1. Tests

- [x] 1.1 Add project manager coverage proving remove requires a first confirmation click and only calls remove on the confirmation action.
- [x] 1.2 Add startup screen coverage proving removal confirmation appears in the integrated management flow.
- [x] 1.3 Update file tree coverage to assert create-file and create-folder overlays are named modal dialogs.
- [x] 1.4 Add app coverage proving dirty editor tab close uses an explicit dialog and cancel keeps the tab open.

## 2. Implementation

- [x] 2.1 Add local pending-removal confirmation state to project management actions.
- [x] 2.2 Reset pending removal when selection changes or the user cancels.
- [x] 2.3 Add dialog semantics to the file tree create overlay without changing submit behavior.
- [x] 2.4 Replace the dirty editor tab native confirm with an in-app save/discard/cancel dialog.

## 3. Verification

- [x] 3.1 Run targeted startup and file tree tests.
- [x] 3.2 Run relevant web tests/build checks.
- [x] 3.3 Validate the OpenSpec change.
