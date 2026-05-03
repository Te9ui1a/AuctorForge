## Why

During WebUI multi-chapter testing, a user request to review chapter 1 while the workflow was positioned at chapter 10 produced a chapter 10 review proposal instead. This blocks realistic batch review of already-written chapters.

## What Changes

- Route explicit chapter-review requests to the requested chapter number before building review prompts.
- Keep the existing current-chapter behavior when the user asks for review without naming a chapter.
- Add a server regression test for reviewing an earlier existing chapter while the workflow is on a later chapter.

## Capabilities

- Modified: `chapter-review-routing`

## Impact

- Affects `/api/chat` review routing and review proposal write targets.
- Prevents wrong-chapter review reports during WebUI chapter-by-chapter review.
