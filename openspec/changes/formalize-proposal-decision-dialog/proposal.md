## Why

The current proposal flow hides critical write decisions inside chat text. Users can see that a proposal is pending, but they cannot clearly tell which proposal version they are about to confirm, whether an older proposal has been replaced, or what files will be written without relying on memory and careful reading.

This change formalizes proposal handling as an explicit, traceable decision moment while preserving the conversational writing experience: confirmation, revision, and discard actions appear only when the user initiates that action, not as permanent composer controls.

## What Changes

- Introduce a proposal package protocol with stable proposal identity, version, status, title, multi-file awareness, and approval transition preview.
- Show pending proposal state as lightweight context by default, without permanently rendering confirm/modify/discard action buttons.
- When the user expresses an approval, revision, or discard intent, open a focused decision dialog/card for that specific action.
- Require approval actions to carry the current proposal id so stale or superseded proposals cannot be written by accident.
- Support multi-file proposal packages with explicit file counts and file lists in the decision dialog.
- Extend conversational approval intent handling so phrases such as "满意，确认", "可以写入", and "就这样" can trigger the approval decision flow when a proposal is pending.
- Intercept ambiguous "继续" messages while a proposal is pending and guide the user to inspect, revise, approve, or discard the current proposal instead of silently generating unrelated content.

## Capabilities

### New Capabilities

- `proposal-decision-dialog`: Covers proposal package identity, pending proposal context, on-demand approval/revision/discard decision dialogs, stale proposal protection, and multi-file proposal confirmation.

### Modified Capabilities

None.

## Impact

- Affected shared contracts: `packages/shared/src/contracts.ts`.
- Affected backend code: proposal snapshotting and approval routing in `apps/server/src/api/createApp.ts`, proposal approval validation in `apps/server/src/api/proposalApprovalService.ts`, and chat intent handling where approval/revision/discard intent is derived.
- Affected frontend code: chat controller/strategy, chat panel pending proposal context, workflow panel pending proposal display, editor proposal preview metadata, and decision dialog/card UI.
- Affected tests: server proposal approval tests, chat turn strategy tests, chat panel tests, workflow panel tests, and app integration tests for pending proposals and multi-file proposal packages.
