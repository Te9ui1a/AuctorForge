## ADDED Requirements

### Requirement: New Story Dialog
The launcher SHALL present the new story project setup form as a modal dialog when the user chooses to start a new story.

#### Scenario: Opening the new story form
- **WHEN** the user selects "开始一个新故事" from the launcher
- **THEN** the system displays a modal dialog named "开始一个新故事"
- **AND** the dialog contains controls for story name, project directory, folder selection, cancellation, and project creation

### Requirement: New Project Workbench Entry
After successfully creating a new story project, the launcher SHALL enter the create-mode workbench for the newly created project without requiring another project selection step.

#### Scenario: Creating a project from the dialog
- **WHEN** the user submits a valid new story project form
- **AND** the project creation request succeeds
- **THEN** the system selects the created project
- **AND** the system starts create mode for the created project

### Requirement: Import Continues Into Workbench
After successfully importing an existing project from the startup project dialog, the launcher SHALL enter the create-mode workbench for the imported project.

#### Scenario: Importing a project from the dialog
- **WHEN** the user submits a valid import project form
- **AND** the project import request succeeds
- **THEN** the system selects the imported project
- **AND** the system starts create mode for the imported project
