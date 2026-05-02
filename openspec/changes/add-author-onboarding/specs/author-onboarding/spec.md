## ADDED Requirements

### Requirement: Startup Onboarding Guidance

The startup screen SHALL present concise first-run guidance that helps writers understand the safe trial path without blocking existing launcher actions.

#### Scenario: First-run guidance is visible

- **WHEN** a user opens the startup screen
- **THEN** the screen shows guidance for trying AuctorForge with fictional or sample content before private manuscript material
- **AND** the existing create, import, recent-project, project-management, and model-settings actions remain available.

#### Scenario: Onboarding can be dismissed without removing core actions

- **WHEN** a user dismisses the onboarding guidance
- **THEN** the startup screen continues to expose project creation, project import, recent projects, and model settings.

### Requirement: Sample Project Entry

The system SHALL provide a sample-project entry point that opens a fictional project through the normal project lifecycle.

#### Scenario: User starts with sample content

- **WHEN** a user chooses the sample-project entry point
- **THEN** the system creates or opens a fictional sample project
- **AND** routes the user into the workbench for that project.

#### Scenario: Sample content avoids private or third-party text

- **WHEN** the sample project is created
- **THEN** its files contain fictional, project-owned example content
- **AND** they do not require the user to paste private manuscript material.

### Requirement: Local Storage Boundary

The startup and project setup flow SHALL explain that project materials are local files before the user creates, imports, or opens a project.

#### Scenario: User reviews project setup

- **WHEN** the create or import project dialog is shown
- **THEN** the UI explains that selected folders contain local project files
- **AND** the user can proceed without configuring a remote model provider.

### Requirement: Model Request Boundary

The onboarding experience SHALL distinguish local editing from remote model-provider requests.

#### Scenario: User has no model provider configured

- **WHEN** the startup screen or model settings are shown without a configured provider
- **THEN** the UI explains that local project inspection can continue
- **AND** model-assisted actions require provider configuration before remote requests are made.

#### Scenario: User opens model settings from onboarding

- **WHEN** a user follows onboarding guidance to model settings
- **THEN** the settings UI identifies provider configuration as the boundary for remote model calls.

### Requirement: Writer-Friendly Empty States

The onboarding experience SHALL use writer-facing empty states when no project is open or no recent projects exist.

#### Scenario: No recent projects exist

- **WHEN** the startup screen has no recent projects
- **THEN** it offers clear next actions to create a project, import a project, or try the sample project.
