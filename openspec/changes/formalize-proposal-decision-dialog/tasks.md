## 1. Proposal Protocol Contract

- [x] 1.1 Extend the shared `PendingProposal` contract with package metadata, item labels, status, version, and transition preview fields while preserving compatibility with existing proposal responses.
- [x] 1.2 Generate proposal package metadata when backend snapshots assistant proposals.
- [x] 1.3 Add server-side proposal action handling for approve, revise, and discard requests that carry a proposal id.
- [x] 1.4 Reject stale proposal actions when the requested proposal id does not match the current pending proposal.

## 2. Chat Intent and Continuation Guard

- [x] 2.1 Expand approval intent detection for pending proposals to include natural phrases such as `满意，确认`, `可以写入`, and `就这样`.
- [x] 2.2 Detect revision and discard intent while a proposal is pending without immediately mutating files.
- [x] 2.3 Intercept ambiguous continuation messages while a proposal is pending and return guidance instead of generating unrelated content.

## 3. On-Demand Decision UI

- [x] 3.1 Keep the idle pending proposal UI lightweight and free of permanent confirm/revise/discard buttons.
- [x] 3.2 Add an approval decision dialog/card that appears only after approval intent and writes only after the user confirms.
- [x] 3.3 Add a revision decision dialog/card that appears only after revision intent and submits revision instructions to generate a new proposal version.
- [x] 3.4 Add a discard decision dialog/card that appears only after discard intent and clears the pending proposal only after confirmation.
- [x] 3.5 Display multi-file proposal package title, file count, and file list in decision dialogs/cards.
- [x] 3.6 Move proposal actions into the latest assistant proposal message as compact icon controls with inline confirmation rows.

## 4. Integration and Verification

- [x] 4.1 Add focused backend tests for proposal package metadata, stale proposal rejection, discard, approval payloads, and pending `继续` guard.
- [x] 4.2 Add focused frontend tests for idle pending state, action-triggered dialogs/cards, multi-file package display, and expanded approval phrase handling.
- [x] 4.3 Run OpenSpec validation and the relevant frontend/backend test suites.
