## Context

The WebUI currently treats proposal approval as a conversational convention. A pending proposal appears in the workflow panel and editor preview, while the user must type an approval word such as `确认` to write it. This keeps the composer lightweight, but it also hides the actual write contract: users cannot clearly see the proposal version, multi-file package, stale-proposal risk, or post-approval transition at the moment they commit.

The prior assistant-editor work intentionally removed a permanent `确认写入` composer button. This change keeps the composer lightweight. Proposal actions are now anchored to the assistant message that produced the pending proposal, using compact icon controls and inline confirmation rows inside the chat log rather than a separate card beneath the composer.

## Goals / Non-Goals

**Goals:**

- Preserve a conversational default: pending proposals show status and preview affordances, not composer-level action buttons.
- Make approval, revision, and discard explicit through a compact icon action row attached to the latest assistant proposal message.
- Give each pending proposal package a stable identity, version, status, and human-readable title.
- Support both single-file proposals and multi-file proposal packages.
- Ensure approval requests cannot accidentally write a stale, superseded, discarded, or invalidated proposal.
- Treat common natural-language approval phrases as intent to open the approval decision dialog when a proposal is pending.
- Prevent ambiguous `继续` from bypassing a pending proposal.

**Non-Goals:**

- Do not change chapter quality validation, word-count validation, or AI-flavor linting.
- Do not add full historical version browsing for all approved proposals.
- Do not add autosave or direct proposal editing inside the preview editor.
- Do not require the user to use buttons for every normal chat turn.

## Decisions

1. **Represent pending writes as proposal packages.**
   - Add proposal metadata (`id`, `version`, `status`, `title`, `kind`, optional transition preview) to the shared pending proposal contract.
   - Rationale: the UI needs a stable object to present and approve. File paths alone cannot explain whether the current preview is new, stale, superseded, or multi-file.
   - Alternative considered: infer version and status from chat messages. Rejected because chat history is ambiguous and cannot safely authorize writes.

2. **Anchor proposal actions to the assistant message, not the composer.**
   - The latest assistant message for a pending proposal shows a compact proposal strip: title/version/file count plus icon-only actions for approve, revise, and discard.
   - Clicking an icon or sending a natural-language action intent expands a small inline confirmation row inside that same assistant message.
   - Rationale: the action belongs to the proposal the assistant just produced, so the UI should read as contextual chat affordance rather than a separate form below the input box.
   - Alternative considered: a composer-bottom decision card. Rejected after screenshot review because it visually competed with the user's input and felt too heavy.
   - Alternative considered: direct icon execution with no second step. Rejected because approve and discard are state-changing actions with accidental-click risk.

3. **Route all proposal actions through explicit action payloads.**
   - Add an action path that carries `proposalId` and `action` (`approve`, `revise`, or `discard`).
   - Existing text approval remains supported, but when approval intent is detected in the UI it opens the dialog first; the final write request carries the proposal id.
   - Rationale: server-side approval must verify that the user is acting on the current proposal, not whichever pending object happens to exist after a refresh or replacement.
   - Alternative considered: continue sending `approved: true` without proposal id. Rejected because it cannot distinguish current and stale proposals.

4. **Supersede rather than mutate proposals.**
   - Revision requests create a new proposal version and mark the previous pending proposal as superseded before replacing it.
   - The UI states that the old proposal will not be written.
   - Rationale: users need confidence that "do not confirm the old proposal" actually changes the write target.
   - Alternative considered: mutate the pending proposal in place. Rejected because it obscures what changed and makes stale confirmation errors harder to explain.

5. **Keep the implementation scoped to the existing chat/workflow architecture.**
   - Frontend components will consume the expanded `pendingProposal` from existing progress/chat responses.
   - Backend proposal snapshotting and approval validation remain the write-safety foundation.
   - Rationale: this reduces migration risk and keeps the change focused on the proposal decision protocol.

## Risks / Trade-offs

- **Risk: More metadata increases API contract churn.** → Mitigation: keep fields additive and provide fallback labels for older proposal objects in tests and local development.
- **Risk: Inline controls can still feel too procedural.** → Mitigation: render them as small icon-only actions attached to the last assistant proposal message, with text only in the compact confirmation row.
- **Risk: Natural-language intent detection can over-trigger.** → Mitigation: detected approval/revision/discard intent opens a confirmation dialog; it does not immediately write or discard without the second click.
- **Risk: Multi-file proposals may feel heavier.** → Mitigation: show file count by default and expand full file list only inside the decision dialog or workflow details.
- **Risk: Existing tests expect no approval button.** → Mitigation: preserve that expectation for the idle pending state, then add tests that buttons appear inside action-specific dialog/card only.

## Migration Plan

No project-file migration is required. Existing runtime pending proposals created before this change can be adapted at response-build time with generated metadata (`id`, `version: 1`, `status: pending`, and title derived from proposed write paths). New proposals receive protocol metadata at snapshot time.

Rollback is straightforward: the backend can continue honoring legacy `approved: true` approval messages, and frontend dialogs can be disabled while retaining chat-based confirmation.

## Open Questions

- None. Screenshot review selected inline chat actions over composer-bottom cards.
