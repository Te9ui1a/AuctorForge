## Context

The previous onboarding work gave first-time users a fictional sample project and basic local-storage guidance. The next trust gap is discoverability: GitHub visitors need a concise reason to care, and app users need a visible reminder that their work is a local folder they can copy before trying real drafts.

## Goals

- Make AuctorForge more attractive to authors who are cautious about AI writing tools.
- Explain user concerns with public references and map them to project choices.
- Add startup guidance for backup and local-file control without turning the launcher into a marketing page.
- Preserve the existing create/import/sample flow.

## Non-Goals

- No automatic zip export or backup scheduler.
- No OS-level folder reveal integration.
- No new model request preview in this change.
- No change to model-provider behavior.

## Decisions

### GitHub Positioning Document

Create `docs/author-trust-research.md` as a public-facing document. It should read like a project positioning page, not an internal report: start with the core concerns, then show how AuctorForge answers them today and what remains on the roadmap. README links to it near the privacy section.

### Startup Backup Guidance

Add a small "稿件安全与备份" module to the startup page. It should state:

- AuctorForge projects are normal local folders.
- Backups can be made by copying the full project folder.
- Use the Lantern Road sample before importing real manuscripts.
- Remote model providers may receive selected project text only when model-backed features are used.

The module is informational and should not replace create/import/sample actions.

### Scope Control

The UI should avoid promising one-click export until the product has actual export controls. The copy uses "备份建议" rather than "导出功能".

## Risks / Trade-Offs

- Too much warning copy can make the product feel scary. Keep it compact and action-oriented.
- Documentation sources can age. Use stable organization/product pages and phrase conclusions as current positioning, not permanent facts.
- Manual folder copying is less convenient than export automation, but it is honest and fits the current local-first architecture.
