## Why

The current product still presents itself with a working-title identity and the model waiting state feels mechanical. A more intentional English product name and richer chat motion make the writing workbench feel like a polished creative tool without changing the underlying workflow.

## What Changes

- Rename user-facing and package-level project identity from the working-title WebUI phrasing to `AuctorForge`.
- Keep existing project file formats and `.novelkit` workflow conventions compatible.
- Upgrade chat waiting and streaming states with subtle, accessible motion that communicates the assistant is actively composing.
- Preserve reduced-motion behavior for users who prefer minimal animation.

## Capabilities

- `assistant-interaction-polish`: Covers brand presentation and assistant waiting/output motion in the web workbench.

## Impact

- Affected frontend code: `apps/web/src/features/startup/StartupScreen.tsx`, `apps/web/src/features/workbench/AppViews.tsx`, `apps/web/src/features/chat/ChatPanel.tsx`, and `apps/web/src/styles.css`.
- Affected metadata: root `package.json` and web storage keys that still expose the old working-title slug.
- Affected tests: ChatPanel, StartupScreen, and focused package/build checks.
