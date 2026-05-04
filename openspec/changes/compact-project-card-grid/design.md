## Context

`ProjectManagerPanel` owns both the startup recent-project list and the project-management card list. It currently switches between an `editorial-stack` layout for recent projects and a two-column `editorial-grid` for management. `ProjectCard` renders taller list-like recent cards with a separate continue button, while management cards already behave as clickable cards that open the existing project status dialog.

## Goals / Non-Goals

**Goals:**
- Make both launcher project collections use a compact card grid on desktop.
- Reach four cards per row on wide desktop viewports.
- Keep project names, status, last-modified time, phase/task metadata, and management root path available.
- Preserve current click semantics: recent cards still support direct "选择并继续"; management cards still open the status dialog.
- Keep mobile and medium-width layouts readable by falling back to one or two columns.

**Non-Goals:**
- Replace the project status dialog with an inline detail rail.
- Add filtering, sorting, search, pagination, or virtual scrolling.
- Change project data models, API contracts, or workbench entry routing.
- Redesign the whole launcher page.

## Decisions

- Use one shared compact-grid layout mode in `ProjectManagerPanel` and distinguish recent versus management only where interaction requires it. This keeps the density behavior consistent across the two pages.
- Implement the desktop density with responsive CSS grid classes in the component, backed by `data-project-manager-layout="compact-grid"` for tests and page-specific CSS tuning.
- Keep the recent "选择并继续" button inside each card, but make it compact and full-width within the card rather than a horizontal list action. This preserves behavior while allowing four cards per row.
- Tighten typography and spacing in `ProjectCard` instead of hiding important metadata. Long names and paths will continue to wrap/break inside the card rather than overflow.

## Risks / Trade-offs

- Four desktop columns reduce per-card width, so long project names and paths can make individual cards taller. Mitigation: use compact spacing, smaller metadata text, and breakable text while accepting variable card height.
- Recent cards will look less like list rows. Mitigation: retain the direct continue button and selected-card state so the workflow remains clear.
- Visual density can make empty or low-project states feel sparse. Mitigation: leave empty states unchanged and let the grid matter only once projects exist.
