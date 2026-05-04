## Why

The 10-chapter WebUI run exposed two coupled workflow gaps: after review there is no legal path to generate a final chapter file, and continuity checks rely on model self-review instead of deterministic chapter-plan alignment. This causes users to get stuck when asking for "按审查报告修补/生成定稿" and lets chapters pass review after consuming future outline beats.

## What Changes

- Add an explicit review-driven revision/finalization flow for the current chapter.
- Add a `第NNN章_定稿.md` path helper and allow it only in the finalization context.
- Route natural user intents such as "按审查报告局部修补", "生成定稿", and target paths ending in `_定稿.md`.
- Add deterministic continuity gates for current-plan coverage, future-beat leakage, previous-state consistency, and unauthorized resource escalation.
- Add continuity findings to review reports and block/pass/revise decisions before a chapter can be treated as final.
- Update workflow skill docs to describe draft -> review -> local repair -> final draft -> next chapter.

## Capabilities

### New Capabilities

- `chapter-finalization-flow`: Review-driven chapter revision and final-draft generation.
- `chapter-continuity-gates`: Deterministic chapter-plan alignment checks for drafts, reviews, and finalization.

### Modified Capabilities

- None.

## Impact

- Affected server code: workflow contracts, chat routing, write policy, preferred write paths, draft validation, review augmentation, and memory quality reporting.
- Affected workflow docs: longform novel write/review skill assets.
- API impact: existing endpoints remain compatible; progress and pending proposals may include final-draft write paths in the new finalization state.
- No new external dependency is required.
