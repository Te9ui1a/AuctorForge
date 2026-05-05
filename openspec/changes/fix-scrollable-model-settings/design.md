## Context

`ModelSettingsPanel` renders a custom fixed overlay with an `aside` dialog surface. The surface currently uses `max-height` and `overflow-hidden`, while the nested form and tabs use `h-full`, `min-h-0`, and `overflow-y-auto`. Since the dialog surface does not provide a definite height, the form resolves against natural content height; once that content exceeds the surface max-height, the panel clips instead of giving the tabs body an effective scrollport.

## Goals / Non-Goals

**Goals:**
- Keep the model settings dialog within the viewport on short screens.
- Preserve visible header and footer actions while the settings fields scroll.
- Preserve existing model configuration behavior, tab semantics, and visual treatment.

**Non-Goals:**
- Redesign the model settings form.
- Change provider/model settings data structures or save/test APIs.
- Introduce a new dialog primitive or dependency.

## Decisions

- Give the dialog surface a definite responsive height using the same viewport cap that was previously expressed as `max-height`. This lets the nested grid and scroll container compute a real available body height.
- Make the dialog surface a grid with explicit header and body rows. The form remains responsible for splitting the scrollable settings body from the fixed footer.
- Keep scrolling on the tabs/content region rather than the entire overlay so the title, close button, status area, and save/test actions stay reachable.

## Risks / Trade-offs

- Fixed viewport-bounded height can create extra empty space when content is short. Mitigation: keep width and viewport caps unchanged and let the existing surface styling absorb the stable frame.
- Class-level regression tests cannot measure browser scroll geometry in jsdom. Mitigation: assert stable layout hooks and use a definite-height scroll container structure that can be verified by build and targeted component tests.
