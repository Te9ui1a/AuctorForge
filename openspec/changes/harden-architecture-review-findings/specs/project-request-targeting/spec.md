## ADDED Requirements

### Requirement: Project-scoped requests target an explicit project

Project-scoped API requests SHALL be able to identify their target project by registry project id without relying on the server process-wide active project.

Project-scoped routes include session reads, chat session load/save, progress reads, file content reads, file tree reads, file/folder creation, file saves, chat turns, and chat stream turns.

#### Scenario: Save after another window switches projects

- **GIVEN** project A and project B are registered
- **AND** window 1 has project A open
- **AND** window 2 opens project B
- **WHEN** window 1 saves a file with `x-project-id` for project A
- **THEN** the server writes inside project A
- **AND** project B files and runtime state remain unchanged

#### Scenario: Chat turn after another window switches projects

- **GIVEN** window 1 has project A open with a pending proposal
- **AND** window 2 opens project B
- **WHEN** window 1 submits a chat turn with `x-project-id` for project A
- **THEN** the chat turn uses project A runtime state
- **AND** project B pending proposal and workflow state remain unchanged

#### Scenario: Session and file reads after another window switches projects

- **GIVEN** project A and project B are registered
- **AND** project A has distinct session/progress/file content
- **AND** window 2 opens project B
- **WHEN** window 1 reads session, progress, file tree, or file content with `x-project-id` for project A
- **THEN** the response is resolved from project A
- **AND** project B runtime state and files are not used

#### Scenario: Chat session persistence after another window switches projects

- **GIVEN** project A and project B are registered
- **AND** window 2 opens project B
- **WHEN** window 1 saves chat session messages with `x-project-id` for project A
- **THEN** the chat session is persisted under project A
- **AND** project B chat session remains unchanged

### Requirement: Legacy active project fallback remains temporary

Requests without explicit project identity MAY use the active project fallback for compatibility, but explicit identity SHALL take precedence when present.

#### Scenario: Header takes precedence over active project

- **GIVEN** the process active project is project B
- **WHEN** a request includes `x-project-id` for project A
- **THEN** the server resolves project A for that request

#### Scenario: Unknown explicit project id fails without fallback

- **GIVEN** the process active project is project B
- **WHEN** a project-scoped request includes unknown `x-project-id` `proj_missing`
- **THEN** the server returns HTTP 404 with code `project-not-found`
- **AND** the request does not read or mutate project B

#### Scenario: Mismatched explicit project identity fails without fallback

- **GIVEN** project A and project B are registered
- **WHEN** a project-scoped request includes project A's `x-project-id` with project B's `x-project-root`
- **THEN** the server returns HTTP 409 with code `project-identity-mismatch`
- **AND** the request does not read or mutate either project
