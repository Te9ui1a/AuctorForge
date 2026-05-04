## Context

The chat command router checks finalization before review, but the current finalization handler only accepts `write/chapter-draft` and `write/chapter-pause`. After a revised draft is approved, the workflow may advance to `review/chapter-review`, so a finalization request in that state falls through to the review handler.

## Decision

Allow `handleChapterFinalizationCommand` to recognize explicit final-draft intent from `review/chapter-review` as well as the existing write states. It should jump to `write-chapter/chapter-finalize`, sync revision-mode files, and generate a proposal using the finalization write policy.

## Non-Goals

- Do not auto-finalize immediately after draft revision approval.
- Do not change review report generation or review gate behavior.
- Do not change finalization prompt construction beyond routing the request to the existing finalization path.

## Risks

- Over-broad detection could steal legitimate review requests. The fix relies on the existing `isChapterFinalizationIntent` guard, which requires explicit final-draft/定稿 wording.
