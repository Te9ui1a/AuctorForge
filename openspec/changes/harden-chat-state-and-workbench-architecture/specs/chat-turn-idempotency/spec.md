## ADDED Requirements

### Requirement: Chat requests carry a request identity
The web client SHALL include a unique `requestId` for each user chat turn sent to `/api/chat` or `/api/chat/stream`.

#### Scenario: User submits a chat turn
- **WHEN** the user sends a new chat message
- **THEN** the request body includes a `requestId`
- **AND** retry or fallback attempts for the same user turn reuse that same `requestId`

### Requirement: Server deduplicates chat turns by project and request identity
The server SHALL execute at most one workflow mutation for a given project identity and chat `requestId`.

#### Scenario: Duplicate request arrives after completion
- **WHEN** a chat request with an already completed `requestId` is received for the same project
- **THEN** the server returns the stored chat result
- **AND** it does not generate a new proposal, advance workflow state, or write files again

#### Scenario: Duplicate request arrives while first request is in flight
- **WHEN** a second chat request with the same `requestId` arrives before the first finishes
- **THEN** the second request waits for or reuses the first request result
- **AND** only the first execution mutates runtime state

### Requirement: Stream fallback must not replay non-idempotent work
The client SHALL NOT submit a fresh non-stream chat request with a new request identity after `/api/chat/stream` has reached the server for the same user turn.

#### Scenario: Stream transport fails after server accepts the turn
- **WHEN** `/api/chat/stream` fails or ends without a complete `done` event
- **THEN** fallback recovery uses the same `requestId`
- **AND** the server returns the original result or in-flight result without re-executing the turn

### Requirement: Missing request identity remains backward compatible
The server SHALL accept legacy chat requests without `requestId` by assigning an internal request identity that is not reused across requests.

#### Scenario: Legacy client sends chat request
- **WHEN** a chat request has no `requestId`
- **THEN** the server processes it successfully
- **AND** the request is not incorrectly deduplicated with another legacy request
