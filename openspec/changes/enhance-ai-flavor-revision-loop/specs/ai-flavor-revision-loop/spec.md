## ADDED Requirements

### Requirement: AI-flavor lint uses categorized rule results

The system SHALL evaluate chapter prose with categorized AI-flavor rules and return structured hit results.

#### Scenario: Cliche phrase is detected
- **WHEN** a chapter contains a configured cliche phrase such as "倒吸一口凉气"
- **THEN** the lint result includes a hit with category `cliche_phrase`
- **AND** the hit includes the matched text, label, severity, and containing local context

#### Scenario: Clean prose is not blocked
- **WHEN** a chapter contains no blocking rules and stays below configured warning thresholds
- **THEN** the lint result is not blocked
- **AND** non-blocking metadata does not force a repair task

#### Scenario: Existing lint call sites remain compatible
- **WHEN** existing server code calls `lintAiFlavor(content)`
- **THEN** it can still determine `blocked` status and iterate `hits`
- **AND** integrations that need snippet extraction receive either a compatible `pattern` field or an updated evidence field that replaces `pattern` in the same change

### Requirement: AI-flavor lint supports threshold-based blocking

The system SHALL distinguish blocking rules from warning rules and SHALL support category-density thresholds.

#### Scenario: Multiple warning categories accumulate
- **WHEN** a chapter contains repeated warning-level hits across configured categories
- **THEN** the lint result may be blocked according to threshold configuration
- **AND** the result explains which categories caused the block

#### Scenario: Single severe rule blocks immediately
- **WHEN** a chapter contains a rule marked as blocking
- **THEN** the lint result is blocked
- **AND** the blocking hit is surfaced before lower-severity warnings

### Requirement: Replacement planner maps issues to writing strategies

The system SHALL convert lint hits into replacement-plan items that describe how to rewrite the affected prose.

#### Scenario: Explanatory narration is planned for repair
- **WHEN** a hit is categorized as `explanatory_narration`
- **THEN** the replacement plan instructs the assistant to replace explanation with concrete consequence, action, dialogue subtext, or observable detail
- **AND** the plan does not ask for a simple synonym substitution

#### Scenario: Empty emotion word is planned for repair
- **WHEN** a hit is categorized as `empty_emotion`
- **THEN** the replacement plan instructs the assistant to express the emotion through physical behavior, object interaction, sensory detail, or speech rhythm

### Requirement: Local repair tasks are span-scoped

The system SHALL generate local repair tasks scoped to the smallest useful sentence, paragraph, or scene fragment.

#### Scenario: Single paragraph has AI-flavor hits
- **WHEN** lint hits are concentrated in one paragraph
- **THEN** the repair task targets that paragraph and includes adjacent context only as reference
- **AND** unrelated chapter paragraphs are not included as rewrite targets

#### Scenario: Repeated issues are grouped
- **WHEN** multiple hits in the same local span share a compatible strategy
- **THEN** the system groups them into one local repair task
- **AND** the task lists each matched issue as evidence

### Requirement: Repair loop verifies patched prose

The system SHALL re-run AI-flavor lint after a local repair proposal is generated.

#### Scenario: Patch removes all blocking issues
- **WHEN** a patched span no longer triggers blocking rules or threshold blocks
- **THEN** the verification result marks the local repair as passing
- **AND** the review report may keep only non-blocking notes if present

#### Scenario: Patch introduces a new issue
- **WHEN** a patched span introduces a new AI-flavor hit
- **THEN** the verification result reports the new hit
- **AND** the repair loop may request another local patch for that span

#### Scenario: Non-target prose is preserved
- **WHEN** a local repair proposal is generated from scoped repair tasks
- **THEN** unchanged chapter spans outside the repair targets are preserved
- **AND** the proposal explains that repair is local rather than a whole-chapter rewrite

### Requirement: Whole-chapter rewrite is an escalation

The system SHALL recommend whole-chapter rewrite only when local repair is insufficient.

#### Scenario: Local repair is sufficient
- **WHEN** lint hits are limited to isolated spans
- **THEN** the system recommends local repair
- **AND** it does not recommend whole-chapter rewrite

#### Scenario: Chapter is structurally unsuitable for local repair
- **WHEN** blocking issues are dense across multiple scenes or the chapter reads as compressed outline rather than prose
- **THEN** the system may recommend whole-chapter rewrite
- **AND** it explains why local repair cannot preserve the chapter effectively

### Requirement: Review reports include actionable AI-flavor repair details

The system SHALL enrich AI-flavor review sections with evidence, category, strategy, and verification status.

#### Scenario: Review report is generated
- **WHEN** a review command evaluates a chapter with AI-flavor hits
- **THEN** the "AI味专项检查" section lists issue categories and representative original snippets
- **AND** the "局部改写任务" section includes scoped repair instructions and acceptance checks

#### Scenario: Single AI-flavor hit still produces repair guidance
- **WHEN** a review command evaluates a chapter with one AI-flavor hit
- **THEN** the service-side review supplement includes an "AI味命中明细" section
- **AND** the "局部改写任务" section contains a scoped repair instruction for that hit

#### Scenario: Synthesized review report still includes AI-flavor repair guidance
- **WHEN** the assistant proposes no chapter review report and the service synthesizes one for the current chapter
- **AND** the draft contains AI-flavor hits
- **THEN** the synthesized review report includes service-side AI-flavor details and local repair tasks

### Requirement: Local repair remains approval-controlled

The system SHALL propose local repairs through the existing approval/write flow and SHALL NOT automatically overwrite chapter files only because AI-flavor lint found issues.

#### Scenario: Lint finds repairable issues after writing
- **WHEN** a chapter draft triggers repairable AI-flavor hits
- **THEN** the system can produce repair tasks or a pending proposal
- **AND** the draft file is not automatically modified without the normal approval/write step

### Requirement: AI-flavor findings do not block draft generation

The system SHALL keep otherwise valid chapter draft proposals visible and editable when AI-flavor lint finds repairable issues.

#### Scenario: Draft proposal contains a blocking AI-flavor phrase
- **WHEN** a chapter draft proposal targets the current chapter, matches the chapter plan, satisfies the minimum narrative length, and contains a configured AI-flavor blocking phrase
- **THEN** chapter draft validation accepts the proposal
- **AND** the user can inspect and approve the draft instead of receiving a draft-generation failure

#### Scenario: Review maps blocking AI-flavor-only issues to revision
- **WHEN** a service-side review supplement finds blocking AI-flavor hits in an otherwise reviewable chapter
- **THEN** the review gate is raised to `REVISE` rather than `BLOCK` solely because of AI-flavor hits
- **AND** the report includes local repair tasks before the chapter is finalized

#### Scenario: Review keeps warning-level AI-flavor notes non-blocking
- **WHEN** a service-side review supplement finds only warning-level AI-flavor hits
- **THEN** the review gate can remain `PASS`
- **AND** the report still includes local repair guidance for those hits
