## Why

Clickable controls and project cards do not consistently change the cursor or provide a stronger hover affordance. This makes it harder for writers to quickly tell which launcher and workbench surfaces are interactive.

## What Changes

- Add a shared pointer cursor rule for enabled buttons, links, role-button controls, and clickable project cards.
- Preserve non-interactive affordance for disabled or aria-disabled controls.
- Add restrained hover motion/edge feedback for enabled buttons and clickable project cards.
- Keep the hover treatment subtle and consistent with the existing dark, utilitarian UI.

## Capabilities

### New Capabilities
- `clickable-hover-feedback`: Covers cursor and hover affordances for interactive controls and clickable project cards.

### Modified Capabilities

None.

## Impact

- Affected UI styles: `apps/web/src/styles.css`
- Affected tests: `apps/web/src/components/ui/button.test.tsx`, `apps/web/src/features/startup/ProjectManagerPanel.test.tsx`
- No backend, routing, persistence, or data model changes expected.
