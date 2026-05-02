# AuctorForge v0.1.0 Draft Release Notes

This is the first public-readiness draft for AuctorForge.

## What It Is

AuctorForge is a local-first creative workbench for Chinese long-form fiction writers. It combines a React workbench, Fastify local API server, project files, bundled writing workflow assets, and OpenSpec-backed product development.

## Highlights

- Local project workflow for long-form writing materials
- Launcher and workbench surfaces under the AuctorForge brand
- First-run guidance with a dismissible onboarding module
- Built-in fictional Lantern Road sample project for safe evaluation
- Public author-trust research page that maps AI writing tool concerns to AuctorForge choices
- Startup manuscript-safety and manual backup guidance
- Project file navigation, document editing, chat, workflow progress, and model settings
- OpenSpec change records for behavior-changing product work
- Public documentation for setup, architecture, privacy, contribution, and release readiness

## For Writers

Start with fictional sample content while evaluating the app. Confirm where project files are saved and how model settings are configured before using valuable unpublished manuscripts.

## For Developers

Run locally with:

```bash
pnpm install
pnpm dev:server
pnpm dev:web
```

Verify with:

```bash
openspec validate --all
pnpm test
pnpm build
pnpm test:e2e
```

## Known Gaps Before Public Release

- Add screenshots or a short demo GIF.
- Build stronger export and backup controls beyond current manual guidance.
- Decide the first release tag plan.
