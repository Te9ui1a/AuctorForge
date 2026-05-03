## MODIFIED Requirements

### Requirement: Explicit Chapter Review Requests Are Authoritative

When the user explicitly names a chapter and asks to review, inspect, or quality-check that chapter's draft, the system SHALL route the review turn to that requested chapter before resolving review required reads, allowed writes, prompt context, and service-side review augmentation.

#### Scenario: Review earlier chapter from a later workflow chapter

- **GIVEN** the workflow is positioned at `review-chapter/chapter-review` for chapter 10
- **AND** `4-正文/第001章_草稿.md` exists
- **WHEN** the user asks "请审查第1章草稿"
- **THEN** the system SHALL set the review workflow chapter number to 1
- **AND** the pending proposal SHALL target `5-审查/第001章_审查报告.md`
- **AND** the service-side review augmentation SHALL inspect chapter 1 draft content.

#### Scenario: Review current chapter when no chapter is named

- **GIVEN** the workflow is positioned at `review-chapter/chapter-review` for chapter 10
- **WHEN** the user asks "请审查当前章草稿"
- **THEN** the system SHALL keep the review workflow chapter number at 10
- **AND** the pending proposal SHALL target `5-审查/第010章_审查报告.md`.
