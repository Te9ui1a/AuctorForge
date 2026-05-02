## ADDED Requirements

### Requirement: Chat turn routing is handled by explicit command handlers
The server SHALL route chat turns through explicit command handlers for approval, guide, define, analyze, review, discussion, and proposal generation behavior.

#### Scenario: Analyze trigger is handled
- **WHEN** a chat turn is classified as an analyze trigger
- **THEN** the analyze command handler updates workflow state and returns the analyze response
- **AND** unrelated guide or review branches are not evaluated as inline route-handler conditionals

### Requirement: Proposal generation flow is shared
The server SHALL use a shared helper for the common proposal generation flow: build prompt, call assistant, augment current-step output, validate, snapshot, and return pending proposal.

#### Scenario: Review proposal is generated
- **WHEN** a review command needs an assistant proposal
- **THEN** it uses the shared generation helper
- **AND** validation and pending-proposal snapshot behavior matches the standard write proposal path

### Requirement: Route handlers remain thin
The Fastify chat route SHALL primarily parse request context, call the chat turn service, and shape HTTP responses.

#### Scenario: Chat route receives a valid request
- **WHEN** `/api/chat` receives a valid chat body
- **THEN** the route resolves active project context and invokes the chat turn service
- **AND** workflow branching is implemented outside the route handler

### Requirement: Extracted routing preserves current behavior
The extraction SHALL preserve existing chat, workflow, guide, analyze, review, and approval behavior unless a spec explicitly changes it.

#### Scenario: Existing tests run after extraction
- **WHEN** the routing extraction is complete
- **THEN** existing server tests pass
- **AND** new handler-level tests cover the high-risk branches moved out of `createApp.ts`
