## ADDED Requirements

### Requirement: Compact Launcher Project Grid
The launcher SHALL display both recent projects and project-management projects in a compact responsive grid that uses up to four cards per row on wide desktop viewports.

#### Scenario: Viewing recent projects on desktop
- **WHEN** the launcher shows the recent-project collection
- **AND** enough horizontal space is available for a wide desktop layout
- **THEN** the system presents project cards in a compact grid capable of four cards per row
- **AND** each recent project card still provides a direct continue action.

#### Scenario: Viewing project management on desktop
- **WHEN** the launcher shows the project-management collection
- **AND** enough horizontal space is available for a wide desktop layout
- **THEN** the system presents project cards in a compact grid capable of four cards per row
- **AND** selecting a management project card still opens that project's status dialog.

### Requirement: Responsive Project Card Density
Project cards in the compact launcher grid SHALL remain readable and usable across desktop, tablet, and mobile widths.

#### Scenario: Viewing projects on narrower screens
- **WHEN** the available width cannot comfortably fit four project cards
- **THEN** the system reduces the number of grid columns
- **AND** project names, status, date, and available phase or task metadata remain visible without horizontal overflow.
