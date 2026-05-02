## Why

Current AI-flavor handling can catch a small set of obvious banned phrases and can ask review reports to prefer local rewrites, but it does not yet provide enough structured diagnosis to reliably remove "AI taste" without washing an entire chapter into a new, overly polished draft.

This change makes AI-flavor reduction more actionable and less destructive by expanding detection, converting banned-word hits into concrete writing strategies, and closing the loop with targeted local repairs.

## What Changes

- Expand AI-flavor detection from a short hard-coded list into a categorized rule library covering cliche phrases, empty emotion words, explanatory narration, mechanical transitions, overused similes, bookish dialogue, low-density paragraphs, and improper English mixing.
- Introduce a writing replacement planner that maps each hit category to scene-aware rewrite strategies rather than only telling the model what not to say.
- Add a local repair loop that selects only affected sentence/paragraph spans, generates patch-sized rewrite tasks, reapplies lint after repair, and avoids whole-chapter rewrites unless local repair cannot preserve the chapter.
- Preserve the current review-report behavior while enriching "AI味专项检查" and "局部改写任务" with hit locations, rewrite strategy, and verification status.
- Add focused tests for rule categorization, replacement-plan generation, local repair scope, and regression cases where clean prose should not be blocked.

## Capabilities

### New Capabilities

- `ai-flavor-revision-loop`: Detect AI-flavor issues, propose writing-strategy replacements, and verify targeted local repairs without unnecessary whole-chapter rewrites.

### Modified Capabilities

- None.

## Impact

- Affected server code: `apps/server/src/core/write/aiFlavorLint.ts`, write/review chat generation helpers, review augmentation, and related tests.
- Affected workflow assets: `skill-packs/novel-flow-kit-0.1.5/extension/assets/longformnovel/review.md` and `write.md`.
- Potential new server modules: a rule catalog, rewrite-strategy planner, local repair task builder, and verification helper under `apps/server/src/core/write/` or `apps/server/src/core/review/`.
- API impact: none required initially; existing chat/review responses can include richer report text. A later UI change may expose hit locations and repair status as structured data.
- No new external dependency is required.
