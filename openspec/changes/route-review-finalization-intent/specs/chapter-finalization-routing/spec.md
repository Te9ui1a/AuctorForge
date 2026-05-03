## ADDED Requirements

### Requirement: Review-state finalization requests route to final draft generation
When the workflow is in chapter review state and the user explicitly asks to generate, output, write, or form a chapter final draft from the review report or current revised draft, the system SHALL route the turn to chapter finalization instead of generating another review report.

#### Scenario: User requests final draft while in chapter review
- **GIVEN** the workflow is positioned at `review-chapter/chapter-review` for chapter 1
- **AND** `4-正文/第001章_草稿.md` and `5-审查/第001章_审查报告.md` exist
- **WHEN** the user asks "按第001章审查报告和刚才修订后的草稿生成第001章最终定稿，写入 4-正文/第001章_定稿.md"
- **THEN** the system SHALL enter `write-chapter/chapter-finalize`
- **AND** the pending proposal SHALL target `4-正文/第001章_定稿.md`
- **AND** the turn SHALL NOT target `5-审查/第001章_审查报告.md`.

#### Scenario: Normal review requests remain review requests
- **GIVEN** the workflow is positioned at `review-chapter/chapter-review` for chapter 1
- **WHEN** the user asks "请审查第001章草稿"
- **THEN** the system SHALL remain in chapter review
- **AND** the pending proposal SHALL target `5-审查/第001章_审查报告.md`.
