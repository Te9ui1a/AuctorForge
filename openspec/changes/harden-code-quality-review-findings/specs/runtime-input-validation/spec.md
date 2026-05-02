## ADDED Requirements

### Requirement: File and folder creation names are basename-only
The server SHALL accept file and folder creation names only when they are non-empty single basenames without path separators or dot traversal names.

#### Scenario: Path-shaped file name is submitted
- **WHEN** the client submits a create-file request with `../x.md`, `nested/x.md`, `.` or an empty name
- **THEN** the server responds with HTTP 400
- **AND** the response error code is `invalid-project-entry-name`

#### Scenario: Valid basename is submitted
- **WHEN** the client submits a create-file or create-folder request with a valid basename such as `角色资料.md`
- **THEN** the entry is created under the requested parent path

### Requirement: Model settings writes are runtime validated
The server SHALL validate model settings request bodies before writing them to disk.

#### Scenario: Malformed model settings are submitted
- **WHEN** `/api/settings/model` receives an unknown active model ID, missing nested model config, invalid provider, invalid base URL, or non-finite temperature
- **THEN** the server responds with HTTP 400
- **AND** the response error code is `invalid-model-settings`
- **AND** the invalid settings are not persisted

#### Scenario: Valid model settings are submitted
- **WHEN** `/api/settings/model` receives a valid primary/secondary model settings payload
- **THEN** the server persists the normalized settings
- **AND** returns the persisted settings payload
