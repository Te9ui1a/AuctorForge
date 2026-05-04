## Why

The WebUI chapter-writing test showed that model drafts can satisfy the user's minimum length request but overshoot the former 3500-character upper bound, causing repeated dead-end retries. The product now needs the chapter draft validator to enforce only the minimum narrative length.

## What Changes

- Change chapter draft length validation from a 2800-3500 character band to a minimum-only rule.
- Keep rejecting chapter drafts below 2800 narrative characters.
- Stop rejecting otherwise valid chapter drafts solely because they exceed 3500 narrative characters.
- Update user-facing validation copy so retry guidance says the draft must be at least 2800 characters.

## Capabilities

### New Capabilities

- `chapter-draft-minimum-length-validation`: Defines minimum-only narrative length validation for chapter draft proposals.

### Modified Capabilities

- None.

## Impact

- Affected server code: `apps/server/src/core/write/chapterContract.ts`.
- Affected tests: `apps/server/src/core/write/chapterContract.test.ts`.
- API shape remains unchanged; validation responses change only for below-minimum drafts and over-minimum drafts.
