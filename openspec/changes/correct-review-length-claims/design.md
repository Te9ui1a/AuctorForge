## Context

Chapter review reports are assembled from model output and then augmented by the server. The current length correction logic only patches a few short phrases, so reports can still contain contradictory statements such as "当前正文约 4447 字，未达到 2800 字最低要求" even when the server-side count already proves the chapter is long enough.

## Goals

- Make the review body consistent with authoritative server-side length data.
- Correct the false length wording without erasing unrelated AI-flavor or continuity findings.
- Keep the existing review gate behavior unless other checks still require `REVISE` or `BLOCK`.

## Non-Goals

- Rewriting the entire review report generator.
- Changing the chapter length threshold itself.
- Reworking AI-flavor or continuity scoring.

## Decision

Use a line-aware correction pass in `reviewReportAugment.ts` that detects false short-length claims when the server count is at or above the minimum, rewrites only the length-related wording, and keeps the rest of the report intact.

### Why this approach

- It fixes the user-visible contradiction without a larger report-format refactor.
- It is easier to test against the actual review phrases produced in WebUI.
- It preserves unrelated sections and avoids destabilizing other review logic.

### Alternatives considered

1. **Simple phrase replacement**  
   Fast, but too brittle. It would keep missing variants like "略有不足" or mixed clauses that combine length and other issues.

2. **Full structured review regeneration**  
   Most robust long term, but too invasive for this bug and would touch more of the review pipeline than needed.

3. **Line-aware normalization**  
   Recommended. It corrects the false length claim at the report boundary while preserving the rest of the report.

## Risks

- Over-matching a line that contains both a false length claim and an unrelated finding.
- Under-matching a new phrasing not covered by current heuristics.

## Test Plan

- Add regression tests with real review-report wording from the WebUI output.
- Verify corrected reports keep unrelated AI-flavor text and service-side length verification.
- Run the focused review augmentation test file and the server build.
