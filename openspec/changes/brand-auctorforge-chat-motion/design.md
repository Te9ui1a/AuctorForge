## Context

The app is a local-first long-form writing workbench. Its UI already has an editorial, restrained design language with compact surfaces, dark workbench chrome, and lightweight motion tokens. The change should strengthen that direction rather than introduce marketing-page decoration or distracting animation.

## Goals

- Present the product as `AuctorForge` in visible startup and workbench fallback identity surfaces.
- Keep Chinese workflow copy usable for the current audience while giving the project a high-end English product name.
- Make model waiting and output states feel active, warm, and polished.
- Respect `prefers-reduced-motion` and avoid layout shifts in the chat log.

## Non-Goals

- Rename `.novelkit`, existing skill-pack directories, generated project content, or server workflow internals.
- Change chat transport behavior, model APIs, or true token streaming semantics.
- Redesign the startup page or workbench layout beyond identity copy and motion states.

## Decisions

### 1. Use AuctorForge as the product identity

`AuctorForge` reads as a premium creative-workbench name: `auctor` evokes authorship, and `forge` matches the product's iterative drafting and workflow-guided creation. The UI will pair it with short Chinese supporting copy instead of replacing all writer-facing Chinese labels.

### 2. Add chat motion as a visual contract, not business state

The existing `assistantStatus` values already distinguish `thinking` and `streaming`. The UI will add richer markup and CSS for those states while leaving controller state unchanged. Tests will assert stable data attributes, accessible status labels, and CSS animation contracts.

### 3. Make reduced motion explicit

Motion styles will use existing duration/easing tokens and a `prefers-reduced-motion: reduce` media query that removes animation for chat messages, thinking dots, and streaming shine.

## Risks / Trade-offs

- Renaming storage keys can lose a user's collapsed file-tree preference. This is acceptable because the key only stores UI collapse state, not project data.
- `AuctorForge` is an English brand name inside a Chinese UI. Supporting copy keeps the product purpose clear.
