# Quick Start

This guide gets AuctorForge running locally for development and evaluation.

## Requirements

- Node.js compatible with the current workspace dependencies
- pnpm 10.x
- A modern browser

The repository declares `pnpm@10.32.1` in `package.json`.

## Install

```bash
pnpm install
```

## Configure

```bash
cp .env.example .env
```

For the first run, you can leave model fields empty and inspect the local UI first. Add model-provider credentials only after you understand what requests the feature you are testing will make.

## Run

Start the API server:

```bash
pnpm dev:server
```

Start the web app in another terminal:

```bash
pnpm dev:web
```

Open the Vite URL printed in the terminal, usually:

```text
http://localhost:5173
```

The API server defaults to:

```text
http://127.0.0.1:3001
```

## Verify

```bash
pnpm test
pnpm build
```

For browser-level checks:

```bash
pnpm test:e2e
```

If Chromium is not installed for Playwright:

```bash
pnpm test:e2e:install
```

## First Trial

Use the built-in fictional sample for your first trial:

- Project: Lantern Road
- Protagonist: Lin Zhao, a young lantern keeper
- Goal: reopen a closed trade road
- First arc: investigate why every gate lantern in a border-town went dark

On the startup screen, choose **试用示例项目**. AuctorForge creates the sample under your local app configuration directory and opens it like a normal project. This lets you evaluate the workflow without exposing private manuscript material.
