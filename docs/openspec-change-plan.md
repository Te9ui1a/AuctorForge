# OpenSpec Change Plan

OpenSpec should track changes that affect product behavior, user workflows, data flow, or compatibility.

The current open-source readiness work is supplementary documentation and repository hygiene, so it does not require a new OpenSpec change.

## add-author-onboarding

Goal: help first-time writers understand how to start safely.

Scope:

- First-run guidance
- Sample content entry point
- Model configuration checks
- Local storage explanation
- Clear next actions when no project is open

Acceptance:

- A new user can create or open a project from the first screen.
- Missing model settings produce useful guidance.
- The UI distinguishes local project actions from model-provider calls.

## add-sample-project

Goal: let users try the workflow without private manuscript material.

Scope:

- Fictional sample project
- Sample characters, outline, and draft files
- Reset or duplicate sample project flow
- Documentation explaining that sample content is safe to edit

Acceptance:

- A user can load the sample and inspect the workbench.
- Sample content exercises project files, chat context, and review paths.
- No private or third-party copyrighted text is included.

## add-model-request-transparency

Goal: show what text may leave the machine before model calls.

Scope:

- Request scope preview
- Provider name and endpoint display
- Remote request enablement state
- Clear error states for missing configuration

Acceptance:

- Users can see which project materials are included in a model request.
- Users can avoid remote requests when they only want local editing.
- Tests cover disabled and misconfigured provider states.

## add-export-and-backup-controls

Goal: give writers confidence that their work is portable.

Scope:

- Export guidance or controls
- Backup reminders
- Project folder reveal action
- Safer overwrite messaging

Acceptance:

- Users can find project files from the UI.
- Users can export or back up project materials through a documented path.
- Destructive or overwriting actions are clearly labeled.

## add-template-library-management

Goal: make reusable writing workflows easier to inspect and evolve.

Scope:

- Template categories
- Template preview
- Template import/export
- User-defined templates
- Version notes for bundled templates

Acceptance:

- Users can inspect a template before using it.
- Users can create or modify a template without editing bundled assets directly.
- Templates use fictional examples.
