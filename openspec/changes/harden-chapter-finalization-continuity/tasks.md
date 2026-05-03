## 1. OpenSpec

- [x] 1.1 Create proposal, design, specs, and task list for `harden-chapter-finalization-continuity`.
- [x] 1.2 Validate the OpenSpec change with `openspec validate harden-chapter-finalization-continuity --strict`.

## 2. Final Draft Path And Workflow Contract

- [x] 2.1 Add tests for `chapterFinalPath` and strict-context final write policy.
- [x] 2.2 Add `chapterFinalPath(chapterNumber)`.
- [x] 2.3 Add `chapter-finalize` workflow substep with current draft, current final draft, and `PROJECT.md` writes.
- [x] 2.4 Preserve ordinary `chapter-pause` allowed writes as `PROJECT.md` only.

## 3. Finalization Routing And Prompting

- [x] 3.1 Add API tests for "按审查报告局部修补，生成第001章定稿" from `chapter-pause`.
- [x] 3.2 Recognize explicit `_定稿.md`, "定稿", "最终稿", and review-driven final-draft wording as finalization intents while leaving ordinary local rewrite requests in draft revision mode.
- [x] 3.3 Route current-chapter finalization intents into `write/chapter-finalize`.
- [x] 3.4 Prefer final draft paths for finalization requests and draft paths for ordinary revision requests.
- [x] 3.5 Strengthen finalization generation instructions to preserve non-target text.

## 4. Continuity Gate

- [x] 4.1 Add tests for future-beat leakage, unauthorized resource escalation, missing current beat, and clean adjacent overlap.
- [x] 4.2 Implement `chapterContinuityGate.ts` with structured findings and conservative phrase scoring.
- [x] 4.3 Extend chapter plan resolution so validators can inspect current and future plan summaries, scenes, and hooks.

## 5. Validation And Review Integration

- [x] 5.1 Add chapter draft validation tests for the observed chapter 3 future-beat leak and chapter 4 weapon/resource escalation.
- [x] 5.2 Run the continuity gate from chapter manuscript validation.
- [x] 5.3 Add review augmentation tests where model `PASS` is upgraded to `REVISE` by service-side continuity findings.
- [x] 5.4 Add "连续性硬校验（服务端补充）" to review reports.

## 6. Memory And Workflow Docs

- [x] 6.1 Keep memory quality reporting consistent with chapter-level continuity findings.
- [x] 6.2 Update longform novel write docs with review-driven finalization behavior.
- [x] 6.3 Update longform novel review docs with deterministic continuity-gate behavior.

## 7. Verification

- [x] 7.1 Run targeted server tests for finalization routing, path policy, continuity gate, validation, review augmentation, and workflow contracts.
- [x] 7.2 Run `pnpm --filter server test`.
- [x] 7.3 Run `pnpm test`.
- [x] 7.4 Run a WebUI smoke test that generates a reviewed chapter, creates a final draft, then continues to the next chapter.
