## ADDED Requirements

### Requirement: Chapter Drafts Require A Minimum Narrative Length

The system SHALL require chapter draft proposals to contain at least 3000 narrative characters and SHALL NOT reject an otherwise valid chapter draft solely because it exceeds a previous target upper bound.

#### Scenario: Draft below minimum is rejected

- **GIVEN** a chapter draft proposal has fewer than 3000 narrative characters
- **WHEN** chapter draft validation runs
- **THEN** the system SHALL reject the proposal
- **AND** the reply SHALL explain that the draft must be at least 3000 characters.

#### Scenario: Draft above former upper bound is accepted

- **GIVEN** a chapter draft proposal has more than 3500 narrative characters
- **AND** the draft satisfies heading, title, AI-flavor, early-finale, and project-context validation
- **WHEN** chapter draft validation runs
- **THEN** the system SHALL NOT reject the proposal for length.
