## ADDED Requirements

### Requirement: Project runtime state is scoped by active project identity
The server SHALL store workflow runtime state, pending proposals, pending decisions, and discussion notes in a runtime state object keyed by the resolved active project identity.

#### Scenario: Opening another project does not overwrite the previous project's pending proposal
- **WHEN** project A has a pending proposal and project B is opened in another request
- **THEN** project A's pending proposal remains associated with project A
- **AND** project B receives its own runtime state

#### Scenario: Legacy project root uses normalized root path as fallback identity
- **WHEN** a request operates on a project without a registry project ID
- **THEN** the runtime state key uses the normalized project root path

### Requirement: Route handlers use resolved project context explicitly
Server route handlers SHALL resolve the active project context before workflow operations and pass project identity, project root, and runtime state explicitly into chat/workflow services.

#### Scenario: Concurrent chat requests cannot switch each other's project root
- **WHEN** two chat requests for different projects overlap
- **THEN** each request reads and writes files under its own resolved project root
- **AND** neither request uses a mutable global project root changed by the other request

### Requirement: Project switching restores only the selected project's persisted session
The server SHALL restore persisted workflow and discussion state only into the runtime state for the selected project.

#### Scenario: Reopening project restores its own workflow state
- **WHEN** a user opens project A after previously opening project B
- **THEN** project A's workflow state is restored from project A's session data
- **AND** project B's runtime state is not mutated
