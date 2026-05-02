## Context

The root-cause investigation found five coupled failures:

- Intent routing treats messages like "继续生成第5章正文提案" as a generic next-chapter command while the workflow is in review.
- The write path builds prompts with `<missing>` required files and continues instead of blocking.
- Draft validation depends on parsing `3-大纲/第01卷_章纲.md`, but returns success when that file or parse result is missing.
- Local fallback generation contains hard-coded legacy prose and entities, so it can contaminate unrelated projects when model generation fails or credentials are absent.
- Runtime workflow state advances in memory, but `.novelflow/chat/session.json` is only updated by the frontend session-save endpoint, so refresh/reopen can restore stale chapter position.

The fix should make invalid states impossible to advance through, not merely detect bad write paths after the fact.

## Goals

- Preserve one-chapter-at-a-time writing and review flow.
- Make explicit chapter numbers authoritative and unambiguous.
- Block chapter draft generation when the required chapter plan source is missing or unparsable.
- Validate every proposed chapter draft before it can become pending approval.
- Ensure fallback generation is project-bound and never emits stale template characters, factions, or locations.
- Persist workflow state after server-side workflow mutations.
- Provide regression tests for the observed failure sequence and for safe recovery.

## Non-Goals

- No full rewrite of the workflow state machine.
- No change to the public project folder structure unless needed to persist an approved chapter-plan source.
- No automatic prose rewriting of already generated bad chapters as part of this change.
- No frontend redesign; UI changes should be limited to surfacing clearer server errors if needed.

## Decisions

### 1. Route explicit chapter writes before generic continuation

The command router should inspect explicit chapter-number requests before `continue-next-chapter-from-review`. A request that names a chapter and asks to generate/write/draft that chapter should route to chapter draft generation for that chapter, even if the message starts with "继续".

The generic continuation shortcut should only fire for:

- "下一章" style messages without a specific chapter number, or
- an explicit chapter number equal to current chapter + 1, and no conflicting target path.

If the message names a chapter that is not current + 1, the router should treat it as an explicit correction or ask for confirmation if it would move backward over existing drafts.

### 2. Introduce a chapter-plan resolver

Write validation and local proposal generation should share a single resolver that can locate chapter plans from approved project sources.

Resolution order:

1. `3-大纲/第NN卷_章纲.md` when present.
2. A structured section inside `3-大纲/3.1_全书结构总纲.md` when it contains per-chapter entries.

The resolver should return a typed result:

- `ok` with chapter title, scene beats, conflict, turn, and hook.
- `missing` when no acceptable plan source exists.
- `unparsable` when a source exists but no requested chapter can be extracted.

Write-stage generation should block on `missing` or `unparsable`; it should not pass `<missing>` into prompts and hope the model infers the plan.

### 3. Make validation independent of outline file presence

`validateChapterDraftProposal` should not return `ok` just because the chapter outline is absent. It should require a resolved chapter plan for current chapter before running content checks. The validator should always check:

- At least one draft write targets exactly `4-正文/第NNN章_草稿.md`.
- No draft write targets any other chapter file.
- Heading chapter number matches workflow chapter number.
- Heading title matches the resolved plan when a plan title is available.
- Narrative length is within the configured band.
- AI-flavor blocking rules and dense warning thresholds pass.
- Project-context consistency checks pass when role/setting files exist.

This turns "missing context" into a product error rather than a silent bypass.

### 4. Constrain fallback generation to active project data

Local fallback should be safe scaffolding, not a hidden story generator with fixed sample characters. It must derive names, factions, places, objects, and conflicts from active project files. If the project lacks enough data for a safe fallback chapter, the server should return a blocking proposal error rather than emitting legacy prose.

Legacy hard-coded terms like "陈渊", "毒蛇帮", "黑水仓", "刘三", and unrelated fallback scenes should be removed from production fallback chapter generation and kept only in tests/fixtures if still useful.

### 5. Persist workflow after mutating chat turns

After any successful `/api/chat` turn that changes workflow state, pending proposal, pending decision, or discussion notes, the server should write the server-owned session snapshot. This includes turns executed through `/api/chat/stream`, because stream is currently a transport over the same chat turn.

The persistence helper should keep frontend messages and server workflow state separate enough to avoid accepting client-supplied workflow fields, while still preventing stale workflow restoration after refresh/reopen.

### 6. Add observable diagnostics

The server should emit structured debug metadata in tests/logs for rejected chapter proposals:

- current workflow chapter
- requested chapter number
- selected command handler
- required source status
- proposed write paths
- validation failure code

This can be test-only or logger-level output, not necessarily part of the public API.

## Risks / Trade-offs

- Blocking when chapter plans are missing may interrupt current loose workflows. Mitigation: support parsing approved per-chapter sections from the master outline and provide clear remediation messages.
- Route precedence changes can affect existing "继续第2章" shortcuts. Mitigation: preserve behavior when the requested chapter is exactly current + 1.
- Fallback quality may drop when project data is sparse. Mitigation: fail with a useful setup message rather than generate contaminated prose.
- Persisting after every chat turn adds disk writes. Mitigation: only persist after state-mutating turns and keep payload small.
