## ADDED Requirements

### Requirement: Backend chat orchestration has focused service boundaries

Chat turn execution, proposal approval, and route registration SHALL be separated so workflow command behavior can be tested without full Fastify route setup.

#### Scenario: Approval behavior is tested at service level

- **GIVEN** a pending proposal and explicit approval
- **WHEN** the proposal approval service runs
- **THEN** it validates hashes, writes allowed files, advances workflow, and clears pending state

### Requirement: Workbench view composition uses feature view models

Workbench rendering SHALL receive grouped feature view models rather than a broad list of unrelated state, setters, refs, and handlers.

#### Scenario: Editor view model owns editor props

- **WHEN** `WorkbenchView` renders the editor area
- **THEN** editor state and editor handlers are supplied through an `editorPane` prop
- **AND** chat, project shell, context rail, and overlay props are separate objects
