## ADDED Requirements

### Requirement: Server-side length verification overrides false short-length claims
When a chapter's server-side narrative character count is at or above the minimum length threshold, the review augmentation system MUST replace any model-generated claim that the chapter is below the minimum length with a factual server-side length verification statement.

#### Scenario: Long chapter with a false short-length claim
- **WHEN** the server determines a chapter is at or above the minimum length
- **AND** the model review text says the chapter is too short
- **THEN** the augmented review MUST state the server-side length result instead of the false shortage claim

### Requirement: Length correction preserves unrelated review findings
When correcting a false short-length claim in a review report, the system MUST preserve unrelated AI-flavor findings, continuity findings, and other review sections that do not depend on the false length claim.

#### Scenario: Report contains a false length claim and an AI-flavor issue
- **WHEN** a review report includes both a false short-length statement and an AI-flavor finding
- **THEN** the augmented report MUST correct the length statement
- **AND** MUST keep the AI-flavor finding intact
