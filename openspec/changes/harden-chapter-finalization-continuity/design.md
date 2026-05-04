## Context

Current review approval advances to `write/chapter-pause`, whose strict allowed writes contain only `PROJECT.md`. Soft writable paths include the current draft and review report, but not a final draft. Natural requests such as "按审查报告修补并生成定稿" do not route back to write generation because `chapter-pause` only recognizes exact current-chapter edit commands.

Continuity validation currently checks path, title, length, early finale wording, and limited setting drift. It does not compare generated prose to current and future chapter plans, so a chapter can pass after prematurely using future beats.

## Goals

- Make finalization a first-class workflow path.
- Keep draft/review/final files distinct and predictable.
- Preserve local-repair behavior: apply review tasks without whole-chapter rewrites by default.
- Fail closed when deterministic continuity checks detect future-beat leakage or resource escalation.
- Keep continuity helpers pure and independently testable.

## Non-Goals

- No UI redesign.
- No automatic rewriting without user approval.
- No replacement for model literary judgment; deterministic gates catch structural continuity failures only.
- No migration of existing project files.

## Decisions

### 1. Use a finalization substep instead of making `chapter-pause` broadly writable

Add a `chapter-finalize` context that allows the current draft, current final draft, current review report, and control panel. This keeps ordinary pause safe while giving finalization a legal write target.

### 2. Add `chapterFinalPath(chapterNumber)`

All path matching and preferred write logic should use a shared helper for `4-正文/第NNN章_定稿.md`. Do not string-build final paths in routers or tests.

### 3. Route natural finalization intent from pause

When current state is `write/chapter-pause`, messages containing "定稿", `_定稿.md`, "按审查报告", "根据审查意见", "局部修补", or "执行局部改写任务" should enter the finalization/revision context for the current chapter. If the message names a different chapter, existing explicit chapter safeguards apply.

### 4. Continuity gate compares draft content with chapter plans

The gate should emit structured findings:

- `missing-current-beat`: an important current chapter beat is absent.
- `future-beat-leak`: text strongly matches a later chapter's core event, old-object clue, location, or required character reveal.
- `previous-state-conflict`: text contradicts previous chapter state, injuries, object possession, or knowledge.
- `unauthorized-resource-escalation`: text grants weapons, allies, locations, or abilities not present in prior state or current chapter plan.

The first implementation can use deterministic phrase extraction and scoring from parsed chapter plans. It should be conservative: block high-confidence future-beat/resource failures, warn on weak matches.

### 5. Review reports include service-side continuity evidence

`reviewReportAugment` should add a "连续性硬校验（服务端补充）" section with findings and raise the gate to `REVISE` for blocking continuity issues. AI-flavor remains a revision diagnostic, not a draft visibility blocker.

## Risks / Trade-offs

- Deterministic continuity checks can false-positive when adjacent chapters share terms. Mitigation: require category-specific confidence thresholds and include exact evidence.
- Final draft files add one more artifact per chapter. Mitigation: only create them when the user asks for finalization or approves a finalization proposal.
- Existing tests expect pause allowed writes to be only `PROJECT.md`. Mitigation: preserve pause behavior and add a separate finalization context.
