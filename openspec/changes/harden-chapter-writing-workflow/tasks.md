## 1. Reproduce and Guard the Observed Failures

- [x] 1.1 Add a server regression test for "继续生成第5章正文提案" while in chapter review proving it does not skip to the next chapter.
- [x] 1.2 Add a regression test for missing `第01卷_章纲.md` where master outline has per-chapter plans and drafting still resolves the correct chapter.
- [x] 1.3 Add a regression test proving no chapter draft can be generated when no chapter plan source exists.
- [x] 1.4 Add a regression test proving over-length chapter drafts are rejected even when volume chapter outline is missing.
- [x] 1.5 Add a regression test proving `/api/chat` workflow mutations persist to `.novelflow/chat/session.json`.

## 2. Fix Intent Routing

- [x] 2.1 Move explicit chapter-write routing before generic review continuation or add a pre-routing classifier that resolves target chapter intent once.
- [x] 2.2 Tighten `isContinueNextChapterTrigger` so `继续...第N章` only means next chapter when `N === current + 1`.
- [x] 2.3 Detect conflicting target paths such as `目标文件 4-正文/第005章_草稿.md` and prefer the target path chapter over generic continuation.
- [x] 2.4 Return a confirmation/blocking message when the user requests a previous chapter that already exists and would be overwritten.

## 3. Add Shared Chapter Plan Resolution

- [x] 3.1 Introduce a `chapterPlanResolver` helper that parses both `第NN卷_章纲.md` and per-chapter sections inside `3.1_全书结构总纲.md`.
- [x] 3.2 Return typed missing/unparsable/success results with chapter title, scene beats, conflict, turn, and hook.
- [x] 3.3 Replace local ad hoc parsing in `assistantLocalProposal.ts` and `chapterContract.ts` with the shared resolver.
- [x] 3.4 Update prompt building or proposal generation to block write-stage drafting when resolver status is missing/unparsable.

## 4. Harden Draft Proposal Validation

- [x] 4.1 Make `validateChapterDraftProposal` fail closed when no chapter plan is available.
- [x] 4.2 Always validate target write path and heading chapter number before content checks.
- [x] 4.3 Enforce narrative length upper/lower bounds with the resolved chapter plan, including master-outline fallback.
- [x] 4.4 Ensure AI-flavor blocking and context-drift checks run whenever a target draft exists.
- [x] 4.5 Add structured validation failure codes for tests and diagnostics.

## 5. Remove Project-Contaminating Fallback Behavior

- [x] 5.1 Remove hard-coded legacy fallback chapter prose and entities from production local chapter draft generation.
- [x] 5.2 Generate fallback chapter prose only from active project role/setting/plan/memory inputs.
- [x] 5.3 Return a blocking error when fallback lacks enough active project data for a safe draft.
- [x] 5.4 Keep any legacy sample prose only in test fixtures where explicitly named.

## 6. Persist Server-Owned Workflow State

- [x] 6.1 Add a server-side session persistence helper that writes workflow snapshot, discussion notes, and approval state after mutating chat turns.
- [x] 6.2 Ensure the helper preserves frontend messages without accepting client-supplied workflow fields.
- [x] 6.4 Add restore tests proving refresh/reopen uses the latest server-owned workflow snapshot.

## 7. Verification

- [x] 7.1 Run targeted server tests for chat routing, chapter plan resolution, draft validation, fallback, and session persistence.
- [x] 7.2 Run `pnpm test`.
- [x] 7.3 Run a WebUI/API smoke test that creates or opens a project, generates chapters through at least one review-to-next-chapter cycle, refreshes, and verifies the workflow chapter does not regress.
- [x] 7.4 Re-run a smaller multi-chapter generation test and confirm no skipped chapters, no wrong target paths, and no stale workflow session.
