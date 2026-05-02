# AuctorForge

AuctorForge is an open-source creative workbench for Chinese long-form fiction writers.

It brings project setup, manuscript files, workflow guidance, review loops, assistant chat, and model configuration into one local-first Web UI, so writers can keep story context close instead of scattering drafts and prompts across disconnected chat windows.

## Who It Is For

- Chinese web-novel authors managing long projects with characters, outlines, drafts, reviews, and continuity notes
- Writers who want AI as a controllable assistant rather than an automatic replacement for authorship
- Developers building better creative tooling around local files, transparent model calls, and durable writing workflows
- Prompt and workflow designers who want to contribute reusable long-form fiction processes

## Current Shape

This repository is a pnpm workspace with three packages:

- `apps/web`: Vite + React Web UI
- `apps/server`: Fastify API server
- `packages/shared`: shared TypeScript contracts

The product currently focuses on a local writing workbench backed by project files and bundled workflow assets.

## Screenshot

![AuctorForge startup screen](docs/assets/screenshots/startup.png)

## Quick Start

Install dependencies:

```bash
pnpm install
```

Copy the environment template:

```bash
cp .env.example .env
```

Start the API server:

```bash
pnpm dev:server
```

In another terminal, start the Web UI:

```bash
pnpm dev:web
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Scripts

```bash
pnpm build       # build all workspace packages
pnpm test        # run unit tests across packages
pnpm test:e2e    # run Playwright end-to-end tests
pnpm dev:server  # start the API server on 127.0.0.1:3001
pnpm dev:web     # start the Vite web app
```

## Privacy And Manuscript Safety

Writers' drafts, settings, outlines, and unpublished ideas can be commercially sensitive. Read [Privacy And Manuscript Safety](docs/privacy.md) before using real work.

As a rule of thumb: test the app with fictional sample content first, then verify where files are saved and what is sent to any configured model provider.

For the product thinking behind this, see [What Writers Care About In AI Writing Tools](docs/author-trust-research.md). It summarizes common author concerns around privacy, copyright, control, consistency, and workflow fit, then shows how AuctorForge is responding.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the open-source readiness plan and product direction.

Near-term priorities:

1. Make the repository easy to run and audit.
2. Make the first writer journey clear: create/open a project, inspect files, chat with the assistant, and edit manuscript materials.
3. Make model and data-flow behavior explicit enough for authors to trust.
4. Grow reusable Chinese long-form fiction workflow templates.

## OpenSpec

This repository already uses OpenSpec for behavior-changing product work under `openspec/`.

Documentation, examples, issue templates, and other release-supporting files can ship without a new OpenSpec change. Product behavior changes should use a dedicated change record. See [OpenSpec Change Plan](docs/openspec-change-plan.md).

For a high-level map of the codebase, see [Architecture Overview](docs/architecture.md).

Draft release notes live in [docs/release-notes-v0.1.0-draft.md](docs/release-notes-v0.1.0-draft.md).

## Contributing

Contributions are welcome from writers, editors, workflow designers, and developers. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

Useful contribution types:

- Bug reports with reproduction steps
- Writer workflow feedback
- Prompt and review-template proposals
- Documentation improvements
- Small fixes with focused tests

## License

MIT License. See [LICENSE](LICENSE).
