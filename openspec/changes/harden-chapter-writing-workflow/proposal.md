## Why

The 30-chapter WebUI test exposed that chapter writing can proceed with missing outline inputs, misroute explicit chapter requests as "continue next chapter", accept invalid chapter drafts, leak source-embedded story material, and restore stale workflow state after refresh. These are workflow-integrity failures, not isolated UI glitches, so the fix must harden the write/review pipeline end to end.

## What Changes

- Make explicit chapter-number write requests take precedence over generic "continue next chapter" shortcuts.
- Require write-stage inputs, especially volume chapter outlines or an approved equivalent chapter-plan source, before generating chapter drafts.
- Treat missing chapter plan data as a blocking validation failure instead of bypassing draft checks.
- Validate draft proposals independently of model claims: target path, heading chapter number, chapter plan alignment, length band, AI-flavor blockers, and project-context consistency.
- Require a configured model for production creative proposal generation; missing or failed model generation now surfaces a structured error instead of substituting source-embedded story content.
- Move built-in sample novel content into a sample project asset directory copied at sample-open time.
- Persist workflow snapshots after server-side chat turns that mutate workflow state, so browser refresh or service restart cannot restore an outdated chapter position.
- Add diagnostics and regression tests for the exact failure chain observed in the 30-chapter test.

## Capabilities

### New Capabilities

- `chapter-writing-workflow-integrity`: Ensures chapter writing and review progress in order, with required context, safe proposal validation, sample-project asset isolation, and durable workflow state.

### Modified Capabilities

- None.

## Impact

- Affected server code: `apps/server/src/api/createApp.ts`, chat command routing, proposal generation, workflow validation, session persistence, and related tests.
- Affected core code: `apps/server/src/core/chat/buildPrompt.ts`, `generateAssistantReply.ts`, `resolvePreferredWritePaths.ts`, `apps/server/src/core/write/chapterContract.ts`, AI-flavor lint/review integration, and workflow file sync.
- Affected workflow assets: write/outline skill documents may need clearer expectations for approved chapter plans and exact chapter numbering.
- API impact: existing endpoints remain compatible. `/api/chat` may persist workflow state server-side after successful turns; responses may include clearer blocking messages for missing required files.
- No new external dependency is required.
