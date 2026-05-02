## ADDED Requirements

### Requirement: Frontend timeout covers backend chat generation timeout
The web client SHALL use a default chat request timeout that is at least as long as the backend assistant generation timeout.

#### Scenario: Long chapter generation exceeds seventy seconds
- **WHEN** a chat generation takes longer than seventy seconds but remains within backend timeout
- **THEN** the frontend does not abort and retry solely because of the previous shorter client timeout

### Requirement: Stream compatibility endpoint remains idempotent
The web client SHALL reuse the same chat request ID when recovering from a stream-compatible transport failure.

#### Scenario: Stream-compatible request falls back
- **WHEN** `/api/chat/stream` fails before a complete done event
- **THEN** fallback uses the same request ID
- **AND** the server returns or waits for the original turn result instead of executing a new turn

### Requirement: Stream compatibility behavior is explicit
The server SHALL document that `/api/chat/stream` is a compatibility SSE endpoint until true token streaming is implemented.

#### Scenario: Maintainer reads stream route
- **WHEN** a maintainer inspects the route implementation
- **THEN** the code states that it emits final/proposal events after the chat turn completes
- **AND** does not imply upstream token streaming is present
