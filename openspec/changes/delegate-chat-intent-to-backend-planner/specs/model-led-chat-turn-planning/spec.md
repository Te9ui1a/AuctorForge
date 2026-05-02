## ADDED Requirements

### Requirement: Frontend Does Not Classify Ordinary Natural-Language Turns
The web client SHALL NOT decide whether an ordinary typed chat message is discussion or proposal generation based on natural-language pattern matching.

#### Scenario: Submitting ordinary chat
- **WHEN** the user submits text through the chat composer
- **THEN** the request does not force plan or write mode from frontend text classification
- **AND** the raw message, attachments, active document path, and request identity are still sent

#### Scenario: Explicit continue discussion action
- **WHEN** the user activates an explicit continue-discussion control
- **THEN** the request may force discussion semantics
- **AND** this forced action is independent of natural-language pattern matching

### Requirement: Backend Plans Auto Chat Turns
The server SHALL plan ordinary auto-mode chat turns before choosing discussion or proposal generation.

#### Scenario: Planner chooses discussion
- **WHEN** the backend planner classifies an auto chat turn as discussion
- **THEN** the server returns a discussion response
- **AND** no pending proposal is created

#### Scenario: Planner chooses proposal
- **WHEN** the backend planner classifies an auto chat turn as proposal generation
- **THEN** the server runs the normal proposal generation flow
- **AND** any generated proposal remains pending until explicit approval

### Requirement: Planner Uses Model Context When Available
The backend planner SHALL be able to use the configured model to classify ambiguous creative intent from workflow context and the user's raw message.

#### Scenario: Ambiguous delegated creative request
- **WHEN** the user delegates creative choice in an auto chat turn
- **AND** the configured planner model returns proposal intent
- **THEN** the server routes the turn to proposal generation even if the frontend did not force write mode

#### Scenario: Planner model unavailable
- **WHEN** the planner model is unavailable, returns invalid output, or lacks credentials
- **THEN** the server falls back to deterministic backend planning
- **AND** the chat turn still completes without relying on frontend natural-language classification

### Requirement: Planner Cannot Bypass Write Safety
The backend planner SHALL only select the chat turn route and SHALL NOT grant file-write authority.

#### Scenario: Proposal route still requires approval
- **WHEN** the planner selects proposal intent
- **THEN** the server exposes proposed writes only as a pending proposal
- **AND** files are not written until the user explicitly approves the proposal

#### Scenario: Proposed writes remain scoped
- **WHEN** proposal generation returns paths outside the current allowed write scope
- **THEN** the server filters or rejects those writes using the existing write-safety rules
- **AND** planner output does not expand the allowed write scope

### Requirement: Explicit Safety-Critical Commands Remain Deterministic
The server SHALL handle explicit approval and workflow-control commands without delegating authority to the planner model.

#### Scenario: Explicit approval with pending proposal
- **WHEN** a pending proposal exists
- **AND** the user sends explicit approval
- **THEN** the server processes approval through the existing approval flow
- **AND** the planner model is not required to approve the write

#### Scenario: Forced discussion mode
- **WHEN** a request explicitly forces discussion semantics
- **THEN** the server returns a discussion response
- **AND** does not create a pending proposal from that turn
