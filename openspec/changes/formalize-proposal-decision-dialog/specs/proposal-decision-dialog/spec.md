## ADDED Requirements

### Requirement: Proposal Package Identity
The system SHALL represent every pending write proposal as a proposal package with a stable id, version, status, title, package kind, and proposed write items.

#### Scenario: New pending proposal is returned
- **WHEN** the assistant generates a write proposal
- **THEN** the response includes a pending proposal package with a non-empty id
- **AND** the package status is `pending`
- **AND** the package version is at least `1`
- **AND** the package title is suitable for user-facing display
- **AND** the package lists every proposed write path

#### Scenario: Multi-file proposal is returned
- **WHEN** a proposal contains more than one proposed write
- **THEN** the package kind is `multi-file`
- **AND** the UI can display the package as a group with the correct file count

### Requirement: Lightweight Pending Proposal Context
When a proposal is pending, the system SHALL show lightweight proposal state by default without permanently displaying confirm, revise, or discard action buttons in the composer.

#### Scenario: Pending proposal is idle
- **WHEN** a pending proposal exists
- **AND** the user has not initiated an approval, revision, or discard action
- **THEN** the chat/workflow UI shows the pending proposal title, version, and unwritten status
- **AND** the latest assistant proposal message shows compact icon-only approve, revise, and discard affordances
- **AND** the composer does not permanently show confirm, revise, or discard buttons

#### Scenario: User wants to inspect proposal
- **WHEN** a pending proposal exists
- **THEN** the UI provides message-level icon actions to process the proposal without immediately approving, revising, or discarding it

### Requirement: On-Demand Approval Decision
The system SHALL show approval controls only after the user initiates approval intent for the current pending proposal.

#### Scenario: User expresses approval in chat
- **WHEN** a pending proposal exists
- **AND** the user sends a message that expresses approval, such as `确认`, `满意，确认`, `可以写入`, or `就这样`
- **THEN** the UI opens an inline approval confirmation row inside the latest assistant proposal message
- **AND** the proposal is not written until the user confirms the inline action

#### Scenario: User confirms approval row
- **WHEN** the approval confirmation row is open for the current proposal
- **AND** the user chooses the confirm-write action
- **THEN** the request sent to the backend includes the current proposal id
- **AND** the backend writes the proposal only if that id still matches a pending proposal
- **AND** the UI reports which files were written and what the next workflow step is

#### Scenario: Multi-file approval row
- **WHEN** the approval confirmation row is opened for a multi-file proposal
- **THEN** it displays the proposal package title and file count
- **AND** it lists the write paths included in the package
- **AND** the confirm-write action names the number of files to be written

### Requirement: On-Demand Revision Decision
The system SHALL show revision controls only after the user initiates revision intent for the current pending proposal.

#### Scenario: User requests proposal revision
- **WHEN** a pending proposal exists
- **AND** the user asks to revise, rewrite, adjust, or avoid confirming the current proposal
- **THEN** the UI opens an inline revision confirmation row inside the latest assistant proposal message
- **AND** the inline row explains that the current proposal will not be written if a new version is generated

#### Scenario: User submits revision instructions
- **WHEN** the revision confirmation row is open
- **AND** the user submits revision instructions
- **THEN** the system marks the previous proposal as superseded
- **AND** the assistant generates a new pending proposal version
- **AND** the UI makes clear that the new version replaced the old version

### Requirement: On-Demand Discard Decision
The system SHALL show discard controls only after the user initiates discard intent for the current pending proposal.

#### Scenario: User requests discard
- **WHEN** a pending proposal exists
- **AND** the user asks to discard, cancel, or abandon the proposal
- **THEN** the UI opens an inline discard confirmation row inside the latest assistant proposal message
- **AND** the proposal is not discarded until the user confirms the inline action

#### Scenario: User confirms discard
- **WHEN** the discard confirmation row is open for the current proposal
- **AND** the user chooses the discard action
- **THEN** the backend marks the pending proposal as discarded or clears it
- **AND** no proposal files are written
- **AND** the UI returns to discussion mode

### Requirement: Stale Proposal Protection
The system SHALL reject actions that target stale, superseded, discarded, invalidated, or non-current proposal ids.

#### Scenario: User tries to approve an old proposal
- **WHEN** the backend receives an approval action with a proposal id that is not the current pending proposal id
- **THEN** the backend rejects the action
- **AND** no files are written
- **AND** the response tells the user that the proposal is no longer current

#### Scenario: Proposal source file changed
- **WHEN** the current proposal's source reads or target write files changed after proposal generation
- **AND** the user confirms approval
- **THEN** the existing hash validation invalidates the proposal
- **AND** no files are written
- **AND** the user is asked to regenerate the proposal

### Requirement: Pending Proposal Continuation Guard
The system SHALL prevent ambiguous continuation commands from bypassing a pending proposal.

#### Scenario: User sends continue while proposal is pending
- **WHEN** a pending proposal exists
- **AND** the user sends an ambiguous continuation message such as `继续`
- **THEN** the system does not generate unrelated new content
- **AND** the response guides the user to inspect, revise, approve, or discard the current proposal first
