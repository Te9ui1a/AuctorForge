## Context

Chapter draft validation currently enforces both a lower and upper narrative character bound. The real WebUI test hit a loop where the model alternated between slightly short and too long drafts, preventing any draft from reaching the approval UI.

## Goals

- Require chapter drafts to contain at least 3000 narrative characters.
- Allow longer drafts to proceed to later validation checks.
- Keep heading, title, AI-flavor, early-finale, and project-context validation unchanged.

## Non-Goals

- No prompt rewrite or UI redesign.
- No change to review-stage quality checks.
- No automatic repair of existing failed draft attempts.

## Decisions

- Preserve `MIN_CHAPTER_DRAFT_NARRATIVE_CHARS = 3000` as the authoritative hard threshold.
- Keep `TARGET_CHAPTER_DRAFT_NARRATIVE_CHARS` for prompt/metadata compatibility if other code imports it.
- Remove the validator branch that rejects drafts above the former maximum.
- Update below-minimum error text to avoid advertising a maximum band.

## Risks / Trade-offs

- Very long drafts can now reach approval. This matches the requested product behavior and lets review-stage tooling handle quality issues after generation.
- Existing tests that expected a too-long rejection must be replaced with a positive acceptance test for long but otherwise valid drafts.
