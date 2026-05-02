## ADDED Requirements

### Requirement: Project file reads cannot escape through symlinks
The server SHALL reject project file reads when the real filesystem target resolves outside the active project root.

#### Scenario: Imported project contains escaping symlink
- **WHEN** a workflow-required file path inside the project is a symlink to a file outside the project root
- **THEN** reading that project file fails
- **AND** the outside file content is not returned to prompt assembly or API callers

### Requirement: Project file writes cannot follow symlinked targets
The server SHALL reject workflow writes when the target path is an existing symlink.

#### Scenario: Allowed write path is a symlink
- **WHEN** an approved proposal attempts to write an allowed workflow path that is a symlink
- **THEN** the write fails before modifying the symlink target
- **AND** the outside file remains unchanged

### Requirement: Normal project file access still works
The server SHALL continue to read and write ordinary files under the active project root.

#### Scenario: Allowed workflow file is a normal file
- **WHEN** a file under the project root is not a symlink and is in the allowed write list
- **THEN** the server can write it
- **AND** subsequent reads return the written content
