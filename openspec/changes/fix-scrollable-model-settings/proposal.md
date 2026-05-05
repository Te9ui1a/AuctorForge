## Why

The model settings dialog can be clipped on shorter viewports because the panel only has a maximum height while hiding overflow, leaving the lower controls unreachable. Users must be able to review and save the full model configuration regardless of viewport height.

## What Changes

- Make the model settings panel allocate a bounded viewport height instead of relying on natural content height.
- Keep the header and footer visible while the settings body scrolls.
- Add regression coverage for the scrollable viewport-fit layout hooks.

## Capabilities

### New Capabilities
- `model-settings-layout`: Covers model settings dialog layout and viewport accessibility behavior.

### Modified Capabilities

None.

## Impact

- Affected UI: `apps/web/src/features/settings/ModelSettingsPanel.tsx`
- Affected tests: `apps/web/src/features/settings/ModelSettingsPanel.test.tsx`
- No backend API, persistence, or dependency changes expected.
