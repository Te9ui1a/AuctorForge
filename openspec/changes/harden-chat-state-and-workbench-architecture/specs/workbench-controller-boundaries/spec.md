## ADDED Requirements

### Requirement: Workbench shell composes focused controllers
The web workbench SHALL separate project switching, route synchronization, session refresh, chat orchestration, document state, and layout state into focused controllers or hooks.

#### Scenario: Project switching logic changes
- **WHEN** project switching behavior is modified
- **THEN** the change is implemented in a project-switching controller or hook
- **AND** chat submit, document editing, and layout rendering code do not need unrelated changes

### Requirement: Workbench view remains presentational
The main workbench view SHALL receive state and callbacks from controllers and avoid owning unrelated business workflows directly.

#### Scenario: Rendering workbench after extraction
- **WHEN** the workbench renders editor, assistant, context rails, settings, and switch dialog
- **THEN** rendering is driven by controller state and callbacks
- **AND** route/project/chat/document side effects are not embedded directly in the presentational JSX tree

### Requirement: Controller boundaries have regression tests
Each extracted controller SHALL include focused tests for its side effects and integration tests SHALL continue to cover project switching, chat persistence, document drafts, and route guards.

#### Scenario: Route guard behavior remains covered
- **WHEN** a dirty draft blocks project switching
- **THEN** tests verify the pending switch dialog behavior through the project-switching controller
- **AND** existing route guard behavior remains unchanged
