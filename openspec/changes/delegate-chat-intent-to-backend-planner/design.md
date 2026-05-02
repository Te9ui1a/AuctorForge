## Context

The web client currently derives a `ChatTurnStrategy` from user text before sending a chat request. That strategy sets `chatMode` to `plan` or `write`, which can prevent the backend from using workflow context and model reasoning to interpret ambiguous creative requests. The backend also has natural-language regular expressions (`isProposalIntent`, `shouldStayInDiscussion`) that duplicate the same decision.

The product needs the opposite shape: the frontend should stay thin, and the backend should decide turn intent from project state, workflow step, pending proposal state, active document, recent discussion, attachments, and the raw user message. File writes remain proposal-first and approval-gated.

## Goals / Non-Goals

**Goals:**
- Make backend turn planning the source of truth for ordinary chat intent.
- Let the configured model classify ambiguous creative turns when possible.
- Keep deterministic handling for explicit UI actions and safety-critical commands.
- Preserve all write safety guarantees: pending proposal approval, allowed-write filtering, stale hash checks, chapter validation, review validation, and no direct writes from discussion.
- Keep stream and non-stream chat transport behavior compatible.

**Non-Goals:**
- Do not allow the model to bypass workflow write scopes or write files directly.
- Do not remove explicit buttons such as "确认提案" or "继续讨论".
- Do not redesign the whole workflow state machine.
- Do not require a model key for the app to remain usable; fallback planning remains available when planner generation fails.

## Decisions

### 1. Frontend sends raw turns, not inferred intent

Ordinary chat submit will omit `chatMode` or send `auto`. The frontend can still render hints, but those hints must not choose the backend route. Explicit UI actions may still send an explicit mode/action:

- approval button: approval semantics
- continue discussion button: forced discussion
- future explicit command buttons: deterministic action semantics

Alternative considered: keep frontend heuristics but expand them. Rejected because it repeats the failure mode: every new natural-language phrasing requires another rule.

### 2. Backend planner owns ordinary intent

The backend will introduce a planner step for ordinary auto-mode turns. The planner returns one of:

- `discussion`
- `proposal`
- `approval`
- `workflow-action`

The planner input includes the current workflow module/substep, pending proposal status, pending decision status, active document, allowed write scope summary, recent discussion notes, and user message. The planner may call the configured model for ambiguous turns. If planner generation is unavailable or invalid, it falls back to conservative deterministic planning.

Alternative considered: send every turn first to discussion generation and let the model ask for proposal generation. Rejected because it adds another user-visible round trip when the user clearly delegated work.

### 3. Deterministic commands remain outside model freedom

Explicit approval, direct guide/analyze/define entry commands, review triggers, and chapter continuation commands remain deterministic command handlers. These actions mutate workflow state or approve writes, so they should not depend on a model classifier.

Alternative considered: planner decides every action. Rejected because it increases risk around approval and workflow transitions without improving creative freedom.

### 4. Safety validation remains after planning

Planner output only selects the next route. It never grants write permission. Proposal generation still filters paths, snapshots source hashes, validates current-step proposal requirements, and waits for explicit approval before writing.

Alternative considered: allow model-planned write actions to write immediately. Rejected because it breaks the app's reviewable proposal contract.

## Risks / Trade-offs

- Model planner adds latency for auto turns -> Use deterministic fallback and keep explicit buttons deterministic.
- Model planner can misclassify -> Preserve "继续讨论" override and avoid direct writes from planner output.
- Existing tests assume `plan` is the default -> Migrate tests to auto/default semantics around ordinary submit while keeping explicit plan-mode tests for forced discussion.
- Fallback heuristics can still feel rule-like -> Keep them backend-local and conservative; they are resilience, not the primary UX contract.

## Migration Plan

1. Add `auto` chat mode support in shared contracts and server normalization.
2. Change ordinary frontend chat submit to send auto/no mode; keep explicit discussion/approval actions.
3. Add backend planner service with model-first planning and deterministic fallback.
4. Route auto turns through the planner before discussion/proposal generation.
5. Update tests to prove frontend no longer constrains ordinary creative delegation and backend planner can choose proposal for phrasing not covered by frontend rules.
6. Remove or downgrade frontend natural-language write-intent regex behavior.
