## MODIFIED Requirements

### Requirement: Project file operations reject unsafe input and surface infrastructure failures

Project file reads and writes SHALL remain inside the project root, SHALL reject symlink escapes, and SHALL surface infrastructure or safety errors instead of converting them into missing-file placeholders.

#### Scenario: Missing required prompt file is represented as missing

- **GIVEN** a workflow step requires a project file that does not exist
- **WHEN** the prompt is built
- **THEN** the file entry has `content: null`

#### Scenario: Unsafe required prompt file fails prompt assembly

- **GIVEN** a workflow step requires a project file that resolves through an unsafe symlink
- **WHEN** the prompt is built
- **THEN** prompt assembly fails with a file safety error
- **AND** assistant generation does not continue with incomplete context

### Requirement: File save requests validate runtime payloads

The file save endpoint SHALL reject malformed request bodies before filesystem or workflow side effects.

#### Scenario: Missing save path

- **WHEN** `PUT /api/file` receives a body without a string `path`
- **THEN** it returns HTTP 400 with code `invalid-file-save-payload`

#### Scenario: Non-string save content

- **WHEN** `PUT /api/file` receives a body whose `content` is not a string
- **THEN** it returns HTTP 400 with code `invalid-file-save-payload`
