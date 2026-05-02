## ADDED Requirements

### Requirement: Explicit Chapter Requests Are Authoritative

The system SHALL route a user request that explicitly names a chapter and asks to write, draft, generate, or return to that chapter as an explicit chapter-write request before applying generic next-chapter continuation shortcuts.

#### Scenario: Explicit chapter request while in review

- **GIVEN** the workflow is in `review-chapter/chapter-review` for chapter 6
- **WHEN** the user says "继续生成第5章正文提案" or "请回到第5章正文写作"
- **THEN** the system SHALL NOT advance to chapter 7
- **AND** the system SHALL enter `write-chapter/chapter-draft` for chapter 5 or return a confirmation/blocking message if overwriting existing chapter 5 would be unsafe.

#### Scenario: Generic next chapter shortcut

- **GIVEN** the workflow is in `review-chapter/chapter-review` for chapter 6
- **WHEN** the user says "先不修，继续下一章"
- **THEN** the system SHALL enter `write-chapter/chapter-draft` for chapter 7.

#### Scenario: Explicit next chapter remains convenient

- **GIVEN** the workflow is in `review-chapter/chapter-review` for chapter 6
- **WHEN** the user says "继续，开始写第7章正文"
- **THEN** the system MAY treat the request as next-chapter continuation
- **AND** it SHALL enter `write-chapter/chapter-draft` for chapter 7.

### Requirement: Chapter Draft Generation Requires A Resolved Chapter Plan

The system SHALL require a resolvable chapter plan for the requested chapter before generating a chapter draft.

#### Scenario: Standard volume chapter outline exists

- **GIVEN** `3-大纲/第01卷_章纲.md` contains a parseable entry for chapter 8
- **WHEN** the user requests chapter 8 drafting
- **THEN** the system SHALL use that entry as the chapter plan.

#### Scenario: Master outline contains per-chapter plan

- **GIVEN** `3-大纲/第01卷_章纲.md` is missing
- **AND** `3-大纲/3.1_全书结构总纲.md` contains a parseable per-chapter section for chapter 8
- **WHEN** the user requests chapter 8 drafting
- **THEN** the system SHALL use the master-outline chapter entry as the chapter plan.

#### Scenario: No chapter plan exists

- **GIVEN** no approved project file contains a parseable plan for chapter 8
- **WHEN** the user requests chapter 8 drafting
- **THEN** the system SHALL refuse to generate a draft
- **AND** the reply SHALL explain which plan source is missing or unparsable.

### Requirement: Chapter Draft Proposals Are Validated Before Approval

The system SHALL validate chapter draft proposals before exposing them as pending proposals.

#### Scenario: Proposed write targets wrong chapter file

- **GIVEN** the workflow is drafting chapter 8
- **WHEN** the assistant returns a proposed write for `4-正文/第005章_草稿.md`
- **THEN** the system SHALL reject the proposal
- **AND** no pending proposal SHALL be created.

#### Scenario: Proposed draft exceeds target length

- **GIVEN** the target narrative length band is 3000 to 3500 characters
- **WHEN** the proposed chapter draft has narrative length greater than 3500 characters
- **THEN** the system SHALL reject the proposal before approval.

#### Scenario: Proposed draft contains blocking AI-flavor issues

- **GIVEN** the assistant proposes a chapter draft with blocking AI-flavor hits or warning thresholds above the configured limit
- **WHEN** validation runs
- **THEN** the system SHALL reject the proposal before approval
- **AND** include actionable failure information in the reply.

### Requirement: Local Fallback Is Project-Bound

Local fallback chapter generation SHALL derive prose and entities only from the active project's approved setting, role, outline, and memory files.

#### Scenario: Project data is sufficient

- **GIVEN** the active project has role names, setting terms, and a resolved chapter plan
- **WHEN** local fallback generates a chapter draft
- **THEN** the draft SHALL use active project entities and chapter beats
- **AND** SHALL NOT include legacy fallback-only terms unrelated to the project.

#### Scenario: Project data is insufficient

- **GIVEN** the active project lacks enough setting, role, or chapter-plan data for safe fallback drafting
- **WHEN** model generation is unavailable and fallback would be used
- **THEN** the system SHALL return a blocking generation error
- **AND** SHALL NOT emit hard-coded sample-world prose.

### Requirement: Workflow State Is Persisted After Server-Side Chat Mutations

The system SHALL persist server-owned workflow state after successful chat turns that mutate workflow position or approval state.

#### Scenario: Chat advances workflow

- **GIVEN** the workflow is in chapter 8 draft generation
- **WHEN** a chat turn advances the workflow to chapter 8 review
- **THEN** `.novelflow/chat/session.json` SHALL record chapter 8 review as the workflow snapshot.

#### Scenario: Browser refresh after long workflow

- **GIVEN** the user has advanced to chapter 30 review
- **WHEN** the browser refreshes or the server restores the active project
- **THEN** the restored workflow SHALL be chapter 30 review
- **AND** SHALL NOT fall back to an older saved chapter position.
