## ADDED Requirements

### Requirement: Author Trust Research Documentation

AuctorForge SHALL provide a public documentation page that summarizes common AI writing tool user concerns and maps them to current project choices.

#### Scenario: GitHub visitor evaluates fit

- **WHEN** a visitor reads the repository README
- **THEN** the README links to the author trust research document
- **AND** the document explains privacy, copyright/control, consistency, output quality, and workflow fit concerns
- **AND** the document describes how AuctorForge currently addresses those concerns

### Requirement: Startup Backup Guidance

AuctorForge SHALL expose backup and manuscript-safety guidance on the startup screen without blocking project launch actions.

#### Scenario: Writer reviews startup trust guidance

- **WHEN** the startup screen renders
- **THEN** it includes a "稿件安全与备份" region
- **AND** the region states that project files are normal local folders
- **AND** the region tells writers to copy the full project folder before major experiments
- **AND** create, import, and sample-project actions remain available

#### Scenario: Writer distinguishes local editing from model calls

- **WHEN** a writer reads startup trust guidance
- **THEN** it explains that local browsing and editing can happen before model-provider configuration
- **AND** it avoids implying that every local project action sends manuscript text to a remote model provider
