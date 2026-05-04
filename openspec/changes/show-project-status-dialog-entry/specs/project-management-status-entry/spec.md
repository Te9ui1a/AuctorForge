## ADDED Requirements

### Requirement: Management Project Status Dialog
The launcher project management view SHALL show a modal status dialog for a project when the user selects that project's management card.

#### Scenario: Opening a managed project
- **WHEN** the user opens project management
- **AND** selects a project card
- **THEN** the system displays a modal dialog named for that project
- **AND** the dialog shows the project's status information

### Requirement: Management Workbench Entry
The project status dialog SHALL provide a primary entry action that opens the selected project in the create-mode workbench.

#### Scenario: Entering a project from management
- **WHEN** the user opens a project's status dialog from project management
- **AND** selects "进入项目"
- **THEN** the system starts create mode for that project

### Requirement: Management Maintenance Actions
The project status dialog SHALL preserve project maintenance actions for the selected project.

#### Scenario: Maintaining a project from the status dialog
- **WHEN** the user opens a project's status dialog from project management
- **THEN** the dialog provides repair, archive or unarchive, and remove actions for that project
