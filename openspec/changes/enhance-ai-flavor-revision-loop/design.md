## Context

The existing implementation already has the right skeleton: `lintAiFlavor` catches a few high-signal patterns, write prompts tell the model to avoid AI-style phrasing, and review prompts require an "AI味专项检查" plus "局部改写任务". The weak point is that the system still treats many problems as generic prohibited wording, so repair either becomes vague advice or drifts toward full regeneration.

The desired behavior is closer to an editor pass: identify exactly what feels artificial, explain the writing move that should replace it, patch only the affected local span, then verify that the patch did not introduce a new issue.

## Goals

- Make AI-flavor detection broad enough to catch recurring Chinese web-novel LLM artifacts.
- Keep detection explainable by grouping rules into named categories and returning matched evidence.
- Convert each issue into an actionable replacement strategy.
- Prefer sentence, paragraph, or scene-fragment repairs over whole-chapter rewrites.
- Verify repairs with the same rule system and report remaining issues.
- Keep chapter drafts visible: AI-flavor hits should not reject an otherwise valid draft proposal before the user can inspect and review it.

## Non-Goals

- No detector for whether a text is AI-generated in a forensic or platform-compliance sense.
- No wholesale style-profile/persona system in this change.
- No UI-heavy workflow for visual diff review in the first iteration.
- No requirement to automatically mutate user project files without an explicit approval/write step.

## Decisions

### 1. Use a categorized rule catalog instead of one flat regex list

Each rule should carry `id`, `label`, `category`, `severity`, `pattern`, `scope`, `explanation`, and `replacementStrategyId`. Categories should include:

- `cliche_phrase`
- `empty_emotion`
- `explanatory_narration`
- `mechanical_transition`
- `overused_simile`
- `bookish_dialogue`
- `low_density_paragraph`
- `english_mixing`
- `generic_intensifier`

This keeps current lint behavior compatible while allowing review reports and local repair tasks to explain why a span is problematic.

Alternative considered: keep adding regexes to the current array. Rejected because a larger flat list becomes hard to explain, tune, and connect to repair behavior.

### 2. Return evidence spans and sentence/paragraph context

The lint result should include matched text, approximate location, containing sentence or paragraph, severity, and whether the issue is blocking. Exact editor offsets are useful but not mandatory for the first server-side pass; stable text snippets are enough to build repair tasks and review reports.

The existing call sites should keep working during the migration. In particular, callers that currently read `blocked`, `hits`, `hit.label`, and `hit.pattern` should either receive backward-compatible fields or be updated in the same task group. `reviewReportAugment` currently extracts snippets from `hit.pattern`, so the implementation must not change the hit shape without updating that integration.

Alternative considered: only return hit labels as today. Rejected because local repair needs to know what to patch.

### 3. Replacement planning is strategy-based, not synonym-based

The replacement planner should not blindly replace a banned phrase with another phrase. It should choose a writing move:

- Replace explicit emotion with action, bodily behavior, object interaction, or dialogue subtext.
- Replace explanatory narration with the character's next action or a concrete consequence.
- Replace generic simile with physical detail, sensory cue, or delete it if it adds no information.
- Replace bookish dialogue with shorter role-appropriate speech and action beats.
- Replace mechanical transition with an event/action bridge.

This gives the assistant a compact but useful repair brief.

### 4. Local repair loop remains proposal-first

The system should generate a repair plan and proposed patched spans. It should not overwrite full chapters automatically. Existing pending-proposal and approval behavior should remain the control point for writing files.

The first implementation should trigger local repair through existing review/local-rewrite flows: review reports produce scoped "局部改写任务", and a user request such as "按审查报告修改" or "执行局部改写任务" should use those tasks to propose edits. The proposal may contain a rewritten chapter file, but generation instructions must restrict the model to changing only the targeted spans and preserving the rest of the chapter.

Alternative considered: auto-apply all lint repairs after generation. Rejected because prose repair is subjective and can damage tone.

### 5. AI-flavor diagnostics do not reject draft visibility

Chapter draft validation should continue to hard-fail contract and continuity problems: wrong chapter path, missing chapter plan, missing/mismatched heading, title drift, too-short prose, premature finale, and project-context drift. AI-flavor findings are different: they should be preserved as diagnostics and repair tasks after the draft is generated.

Review augmentation may use `lintAiFlavor` severity to prioritize local repair tasks, but it should not convert AI-flavor findings alone into a hard draft-generation rejection. In review reports, blocking AI-flavor diagnostics should raise the gate to `REVISE` rather than `BLOCK`; warning-only diagnostics can remain `PASS` while still adding local repair guidance. `BLOCK` remains reserved for structural, scope, or continuity failures.

Alternative considered: continue rejecting drafts that hit blocking AI-flavor rules. Rejected because it hides the generated text from the user and forces prompt guessing instead of letting the review loop produce concrete rewrite tasks.

### 6. Whole-chapter rewrite is an escalation, not the default

Whole-chapter rewrite should be recommended only when the chapter has dense blocking issues across multiple scenes, compressed-outline symptoms, or structural failures that cannot be fixed by local patches.

## Data Flow

1. Write or review command produces/loads chapter draft.
2. AI-flavor lint runs with the categorized rule catalog.
3. Draft-stage lint diagnostics may be summarized in the assistant reply, but they do not reject an otherwise valid chapter draft proposal.
4. The replacement planner groups hits by local span and attaches strategy guidance.
5. The repair task builder emits "局部改写任务" with original snippet, problem category, writing strategy, and acceptance check.
6. If a repair is requested, generation receives the affected snippets plus minimal surrounding context and an instruction to preserve non-target text.
7. The proposed patched text is linted again before approval/write.
8. The review/proposal reports PASS, REVISE with remaining local issues, or structural escalation to whole-chapter rewrite.

## Implementation Notes

- Keep pure functions in the write/review core where possible: rule catalog, linting, replacement planning, task building, and verification should be independently unit-testable.
- Avoid model calls inside deterministic lint/planning helpers.
- Cap emitted repair tasks and representative snippets so a noisy chapter produces a readable report.
- Treat `low_density_paragraph` as heuristic and warning-first; it should not block alone without additional evidence.
- Keep rule text and replacement strategy text in server code first. Workflow skill docs should summarize the behavior rather than becoming the source of truth.

## Risks / Trade-offs

- More rules can increase false positives. Mitigation: severity levels, non-blocking warnings, tests for clean prose, and category-specific thresholds.
- Regex-only detection cannot judge all style issues. Mitigation: combine deterministic lint with LLM review text, but keep deterministic evidence as the stable backbone.
- Local patching can create continuity seams. Mitigation: include adjacent paragraph context and require re-lint plus a short continuity check for patched spans.
- Report output may become noisy. Mitigation: cap repeated hits per category and summarize duplicates.
