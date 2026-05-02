## ADDED Requirements

### Requirement: Confirm Project List Removal
The project manager SHALL require a deliberate confirmation before removing a selected project from the launcher project list.

#### Scenario: First removal click asks for confirmation
- **WHEN** the user selects a project in project management
- **AND** clicks "从列表移除"
- **THEN** the system does not call the removal action yet
- **AND** the selected project detail shows a confirmation action and a cancellation action

#### Scenario: Confirming project removal
- **WHEN** the selected project detail is asking for removal confirmation
- **AND** the user clicks the confirmation action
- **THEN** the system calls the removal action for the selected project

### Requirement: File Creation Overlay Semantics
The file tree SHALL expose its create-file and create-folder overlay as a named modal dialog.

#### Scenario: Opening create file overlay
- **WHEN** the user clicks "新建文件"
- **THEN** the system displays a dialog named "创建新文件"
- **AND** the dialog is marked modal
- **AND** the existing file name input, cancel action, and confirm action remain available

#### Scenario: Opening create folder overlay
- **WHEN** the user clicks "新建文件夹"
- **THEN** the system displays a dialog named "创建新文件夹"
- **AND** the dialog is marked modal
- **AND** the existing folder name input, cancel action, and confirm action remain available

### Requirement: Dirty Editor Tab Close Safety
The editor SHALL use an explicit in-app modal before closing a dirty editor tab.

#### Scenario: Canceling dirty tab close
- **WHEN** a document tab has unsaved changes
- **AND** the user clicks the tab close action
- **THEN** the system displays a dialog named "未保存的更改"
- **AND** the dialog is marked modal
- **AND** clicking "取消" keeps the tab open without saving

#### Scenario: Saving before dirty tab close
- **WHEN** the dirty close dialog is open
- **AND** the user clicks "保存并关闭"
- **THEN** the system saves the dirty document
- **AND** closes the tab after the save succeeds
