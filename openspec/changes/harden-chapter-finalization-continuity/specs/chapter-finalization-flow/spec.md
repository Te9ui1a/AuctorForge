## ADDED Requirements

### Requirement: Review-driven finalization state

After a chapter review, the system SHALL support entering a write-capable finalization state for the current chapter when the user asks to apply review feedback, perform local repair, or generate a final draft.

#### Scenario: User asks for final draft from chapter pause

- **GIVEN** the workflow is at `write/chapter-pause` for chapter 1
- **AND** `5-审查/第001章_审查报告.md` exists
- **WHEN** the user says "按审查报告局部修补，生成第001章定稿"
- **THEN** the system enters a current-chapter finalization context
- **AND** the assistant may propose `4-正文/第001章_定稿.md`
- **AND** the assistant may not propose unrelated chapter files

### Requirement: Final draft path policy

The system SHALL allow `4-正文/第NNN章_定稿.md` writes only for the active chapter during finalization.

#### Scenario: Model proposes a final path outside finalization

- **GIVEN** the workflow is ordinary draft writing for chapter 1
- **WHEN** the model proposes `4-正文/第001章_定稿.md`
- **THEN** the write is filtered or rejected
- **AND** the user receives a clear message if no legal writes remain

### Requirement: Local repair before finalization

Finalization prompts SHALL instruct the model to apply review/local-repair tasks and preserve non-target text unless a structural rewrite is explicitly required.

#### Scenario: Review contains local AI-flavor tasks

- **GIVEN** the review report contains local rewrite tasks
- **WHEN** the user asks for finalization
- **THEN** the generated final draft applies those tasks
- **AND** unchanged paragraphs remain materially identical
