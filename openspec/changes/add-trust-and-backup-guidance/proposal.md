## Why

Chinese long-form fiction writers evaluating AI writing tools care about privacy, control, copyright, consistency, and whether their drafts remain portable. AuctorForge already has a local-first story, but GitHub visitors and first-time users need clearer proof points and in-product backup guidance before trusting it with real manuscript material.

## What Changes

- Add a writer-facing GitHub document that summarizes AI writing tool user concerns and maps them to AuctorForge product choices.
- Link that document from the README so new visitors can understand the project positioning quickly.
- Add a compact backup and manuscript-safety guidance entry to the startup experience.
- Keep the first-run flow local-first: users can inspect sample/local projects before configuring model providers.
- Do not add destructive export automation in this change.

## Capabilities

### New Capabilities

- `trust-and-backup-guidance`: Startup and documentation guidance that helps writers understand local files, backups, sample trials, and model-provider boundaries.

### Modified Capabilities

- None.

## Impact

- Affects startup UI copy and tests in `apps/web/src/features/startup`.
- Adds or updates public documentation under `README.md` and `docs/`.
- Adds an OpenSpec change record for trust and backup guidance.
- No API, database, dependency, or model-provider changes.
