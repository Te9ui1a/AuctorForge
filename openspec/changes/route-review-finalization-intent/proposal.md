## Why

WebUI testing found that after a user confirms a revised chapter draft, the workflow can land in `review-chapter/chapter-review`. If the user then asks to generate the final draft from the review report, the request is routed back into review and produces another review report instead of `4-正文/第XXX章_定稿.md`.

## What Changes

- Treat explicit final-draft requests from chapter review state as chapter finalization work.
- Preserve existing review behavior for normal review requests.
- Add a server regression test for the review-report → revised draft → final draft path.

## Capabilities

- Added: `chapter-finalization-routing`

## Impact

- Affects `/api/chat` routing for explicit finalization requests.
- Prevents users from being trapped in repeated review-report generation when they ask for a final draft.
