## ADDED Requirements

### Requirement: Stream Provides Observable Progress Events

The system SHALL emit progress-aware SSE events for long chat generation turns while preserving the final `done` chat response contract.

#### Scenario: Stream emits phases before completion

- **WHEN** the user sends a chat request through `/api/chat/stream`
- **THEN** the stream SHALL emit `ready` after accepting the request
- **AND** the stream SHALL emit one or more `phase` events before `done`
- **AND** the stream SHALL emit `done` with the final chat response when generation completes.

#### Scenario: Stream emits heartbeat during long work

- **WHEN** a chat stream remains in progress for longer than the heartbeat interval
- **THEN** the stream SHALL emit `heartbeat` events until the turn completes or fails
- **AND** each heartbeat SHALL identify the active request and current phase without exposing prompt or model secrets.

#### Scenario: Stream emits structured terminal failure

- **WHEN** a chat stream fails after the request is accepted
- **THEN** the stream SHALL emit an `error` event with structured error details
- **AND** the stream SHALL end after the terminal error event.

### Requirement: Progress Phases Are Stable And User-Facing

The system SHALL use a stable coarse phase vocabulary for generation progress.

#### Scenario: Chapter draft generation reports model wait

- **WHEN** the assistant is waiting on the configured model provider for a chapter draft
- **THEN** the progress state SHALL use the `calling_model` phase
- **AND** the user-facing label SHALL communicate that model generation is in progress.

#### Scenario: Proposal validation reports validation phase

- **WHEN** the assistant response is being parsed, augmented, or validated before becoming a pending proposal
- **THEN** the progress state SHALL use the `validating` phase
- **AND** the user-facing label SHALL communicate that the draft is being checked.

#### Scenario: Unknown internal work stays coarse

- **WHEN** implementation details change inside a phase
- **THEN** the emitted phase names SHALL remain within the stable phase vocabulary unless the spec is updated.

### Requirement: Frontend Shows Long Generation Status

The chat UI SHALL show an accessible in-flight progress status for long assistant generation turns.

#### Scenario: Generation starts

- **WHEN** the user submits a chat message that starts assistant generation
- **THEN** the chat UI SHALL show an in-flight status with elapsed time
- **AND** the send control SHALL remain protected against duplicate submission.

#### Scenario: Progress event updates phase

- **WHEN** the frontend receives a `phase` event
- **THEN** the chat UI SHALL update the visible phase label without appending a new chat message.

#### Scenario: Heartbeat updates connection freshness

- **WHEN** the frontend receives a `heartbeat` event
- **THEN** the chat UI SHALL update the last-server-event freshness indicator
- **AND** it SHALL NOT treat heartbeat as generated assistant text.

#### Scenario: Long wait threshold is crossed

- **WHEN** a generation turn remains active beyond the configured long-wait threshold
- **THEN** the chat UI SHALL show copy that explains long chapter generation can take several minutes
- **AND** the UI SHALL continue to show elapsed time.

### Requirement: Progress Ends Cleanly

The progress UI SHALL enter a clear terminal state when a generation turn completes or fails.

#### Scenario: Generation completes successfully

- **WHEN** the frontend receives `done`
- **THEN** the progress UI SHALL clear its active in-flight state
- **AND** the final assistant reply and pending proposal behavior SHALL match the existing chat response behavior.

#### Scenario: Generation fails

- **WHEN** the frontend receives a stream `error` event or the request times out
- **THEN** the progress UI SHALL show a clear failure state
- **AND** the user's input SHALL remain recoverable for retry.

#### Scenario: Stream fallback reuses request identity

- **WHEN** stream recovery is attempted for an in-flight generation turn
- **THEN** the recovery request SHALL reuse the same `requestId`
- **AND** it SHALL NOT start a fresh workflow mutation for the same user turn.
