## MODIFIED Requirements

### Requirement: Chat stream compatibility uses one idempotent completed-turn SSE transport

The stream-compatible chat endpoint SHALL execute at most one chat turn per `requestId` and SHALL make its completed-turn SSE transport semantics observable to the client with an early `ready` event before long-running chat work starts.

#### Scenario: Stream fallback does not duplicate execution

- **GIVEN** a client submits `/api/chat/stream` with a `requestId`
- **AND** the stream transport fails after the turn starts
- **WHEN** the client recovers with the same `requestId`
- **THEN** the server returns the in-flight or completed turn result
- **AND** workflow mutation happens once

#### Scenario: Compatibility stream identifies itself before completion

- **WHEN** `/api/chat/stream` is used as completed-turn SSE
- **THEN** the server emits `event: ready` with a completed-turn SSE transport marker before `event: done`
- **AND** tests and client handling distinguish it from upstream token streaming
