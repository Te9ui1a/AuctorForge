# Contributing

Thank you for helping improve AuctorForge.

The project is for writers first. Technical improvements matter most when they make writing safer, clearer, faster, or more controllable.

## Ways To Contribute

- Report reproducible bugs
- Share writer workflow feedback
- Improve onboarding and documentation
- Contribute prompt, review, or workflow templates
- Add focused tests around existing behavior
- Improve UI polish without making the workspace harder to scan

## Before Opening An Issue

Please include:

- What you were trying to do
- What you expected
- What actually happened
- Steps to reproduce
- Your OS, browser, Node.js version, and pnpm version
- Whether a model provider was configured

Avoid posting unpublished manuscript text. Use fictional or redacted examples when possible.

## Code Changes

For product behavior changes:

1. Check existing OpenSpec changes under `openspec/changes`.
2. Create or update an OpenSpec change when the product behavior, workflow, data model, or UI behavior changes.
3. Keep pull requests focused.
4. Add or update tests for the behavior you changed.
5. Document verification commands in the PR.

For supplementary changes such as README updates, issue templates, examples, and release checklists, OpenSpec is usually unnecessary.

## Prompt And Workflow Contributions

Good templates should state:

- Target writing stage
- Required inputs
- Output format
- Constraints and failure modes
- Examples using fictional content

Templates should help writers make decisions. Avoid encouraging plagiarism, undisclosed copying, or bulk generation that removes author control.

## Local Development

```bash
pnpm install
pnpm dev:server
pnpm dev:web
```

Before submitting code, run:

```bash
pnpm test
pnpm build
```

Use Playwright for browser-level changes:

```bash
pnpm test:e2e
```
