## Why

Some review reports still describe long chapters as being below the 2800-word minimum because the model's own length estimate leaks through the report body. That creates contradictory output for authors and can trigger unnecessary rewrites even when the server-side chapter length check already passed.

## What Changes

- Normalize chapter review length claims against the server-side narrative character count.
- Rewrite false short-length statements in review reports to a factual service-side length verification statement.
- Preserve unrelated review findings, including AI-flavor and continuity notes, when length claims are corrected.
- Keep review gate decisions aligned with the authoritative server-side length result.
- Add regression coverage for real review wording that falsely reports long chapters as too short.

## Capabilities

### New Capabilities

- `review-report-length-correction`: Review augmentation must replace false short-length claims with server-side length verification and keep other review findings intact.

### Modified Capabilities

- None.

## Impact

- Affected server code: `apps/server/src/core/review/reviewReportAugment.ts` and related tests.
- Affected WebUI output: chapter review reports shown to users.
- No API shape change is required.
