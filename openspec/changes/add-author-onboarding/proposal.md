## Why

First-time users currently land on a polished launcher, but the app does not yet make the safe trial path, local-file boundary, or model-request boundary explicit enough for writers evaluating AuctorForge with unpublished work. Open-source adoption needs a first-run flow that helps writers start with confidence before they bring real manuscripts into the workbench.

## What Changes

- Add a first-run onboarding surface on the startup screen that explains the safe trial path.
- Provide a fictional sample-content entry point so users can explore the workbench without private manuscript text.
- Make local project storage and remote model-request boundaries visible before users create/import a project or configure a provider.
- Add clear empty/error states when no project or model provider is configured.
- Preserve the existing create/import/recent-project flows and project file formats.

## Capabilities

### New Capabilities

- `author-onboarding`: Covers first-run guidance, safe trial entry points, local-storage messaging, model-request transparency, and startup empty states for new writers.

### Modified Capabilities

- None.

## Impact

- Affected frontend: startup screen, project creation/import dialog copy, product preview, model settings entry points, and tests around first-run rendering.
- Affected backend: sample project creation/import endpoint or project initialization path if the sample project is generated server-side.
- Affected docs: quick start, privacy notes, and release checklist.
- Affected data: no breaking changes to existing project file formats or `.novelkit` / `.novelflow` conventions.
