## ADDED Requirements

### Requirement: Conversational Proposal Confirmation
When a pending proposal exists, the system SHALL guide users to confirm, revise, or continue discussing through chat text instead of relying on a prominent dedicated composer approval button.

#### Scenario: Pending proposal is visible
- **WHEN** the assistant has a pending proposal
- **THEN** the chat surface shows a pending proposal notice
- **AND** the composer does not show a primary `确认写入` button

#### Scenario: User confirms in conversation
- **WHEN** a pending proposal exists and the user sends an explicit confirmation message
- **THEN** the existing chat turn strategy treats the message as proposal approval

### Requirement: Direct Manual File Editing
The editor SHALL allow users to edit and save any loaded project file unless the editor is empty, locked by proposal preview, or the backend rejects the save request.

#### Scenario: Loaded non-proposal file outside workflow target
- **WHEN** a user opens a project file that is not part of the current workflow write target
- **AND** the file is not a proposal preview
- **THEN** the editor accepts changes
- **AND** the save action writes the edited content through the file save API

#### Scenario: Proposal preview remains protected
- **WHEN** the editor displays pending proposal preview content
- **THEN** the editor is read-only
- **AND** the save action is disabled

### Requirement: Integrated Assistant Composer
The assistant composer SHALL present a larger input frame with upload and send controls inside the same visual control group, and the send control SHALL be icon-only with an accessible label.

#### Scenario: Composer is idle
- **WHEN** the chat panel is rendered
- **THEN** the file upload trigger appears inside the composer frame
- **AND** the send button has the accessible name `发送`
- **AND** the send button does not render visible `发送` text

### Requirement: Reduced Editor Density
The document editor SHALL use smaller, calmer typography for editor chrome and manuscript text while preserving readable long-form writing line height.

#### Scenario: Editable document displayed
- **WHEN** a writable document is loaded
- **THEN** the manuscript textarea uses the reduced editor density contract
- **AND** toolbar/status controls remain visible without oversized text
