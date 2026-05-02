## Why

The chat experience currently depends on frontend and backend regular-expression routing to decide whether a user turn is discussion, proposal generation, approval, or workflow navigation. This makes the assistant feel brittle in creative conversations because natural delegation such as "you help me think of one" can be intercepted before the model can interpret the context.

## What Changes

- Introduce backend-owned chat turn planning as the source of truth for ordinary user chat turns.
- Remove frontend responsibility for classifying natural-language turns as "plan" or "write"; the client will only send explicit UI actions such as approve proposal or force continued discussion.
- Replace broad natural-language proposal/discussion routing heuristics with a backend planner that can use the active workflow state, pending proposal state, active document, attachments, and recent discussion context.
- Preserve hard safety gates: no file write without pending proposal approval, proposed paths remain filtered to allowed write scopes, stale-file hashes still invalidate proposals, and chapter/review validators still run before exposing proposals.
- Keep deterministic handling for explicit non-creative control actions where model freedom is not useful, including pending proposal approval and direct mode entry commands.

## Capabilities

### New Capabilities
- `model-led-chat-turn-planning`: Defines backend-led planning for chat turn intent while preserving proposal/write safety boundaries.

### Modified Capabilities

## Impact

- Affected frontend code: chat request strategy and chat controller request payload behavior.
- Affected backend code: chat route helpers, chat turn command routing, discussion/proposal turn selection, tests around plan/write mode behavior, and stream compatibility payloads.
- No external API dependency changes are required. The planner may use the configured model when available and must have a deterministic fallback for missing or failing planner calls.
