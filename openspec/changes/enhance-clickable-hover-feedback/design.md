## Context

The shared `Button` primitive already centralizes visual tiers, but its base classes do not express pointer cursor behavior. Some local surfaces, such as startup navigation, already set `cursor: pointer`, while many buttons depend on browser defaults. Project cards are semantically clickable in both recent-project and management contexts, but their hover behavior is mostly limited to background/border changes.

## Goals / Non-Goals

**Goals:**
- Make enabled interactive controls show a pointer cursor consistently.
- Make disabled controls avoid the pointer affordance.
- Give buttons and clickable project cards a subtle hover lift/edge response.
- Keep the interaction feedback restrained and compatible with reduced-motion preferences.

**Non-Goals:**
- Introduce custom cursor images.
- Add large hover animations, bounce effects, glow-heavy treatments, or layout-shifting transforms.
- Change click behavior, accessibility names, routing, dialogs, or project data.
- Redesign every hover color in the application.

## Decisions

- Put cursor affordance in global CSS instead of adding per-component classes. This catches native buttons, links, role-button controls, and future controls without repeated code.
- Keep disabled affordance explicit via `button:disabled`, `[aria-disabled='true']`, and disabled form controls.
- Add a one-pixel upward hover transform only for enabled buttons and clickable project cards. This is enough to tell the user the surface is active without making the workbench feel playful.
- Use `@media (hover: hover) and (pointer: fine)` for hover lift so touch devices are not forced into desktop hover semantics.
- Keep `prefers-reduced-motion` respected by the existing global transition-duration reduction.

## Risks / Trade-offs

- Global button hover transforms could affect dense toolbars. Mitigation: the transform is only `translateY(-1px)` and does not change layout because transforms do not participate in document flow.
- Some controls already define custom transitions. Mitigation: use a broad but low-specificity global rule and keep existing component hover colors intact.
- Pointer cursor on `role="button"` relies on correct ARIA usage. Mitigation: disabled-like states are covered through `aria-disabled`.
