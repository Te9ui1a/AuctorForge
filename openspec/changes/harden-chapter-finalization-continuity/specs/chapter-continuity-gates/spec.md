## ADDED Requirements

### Requirement: Current chapter plan coverage

The system SHALL detect when a proposed chapter omits high-priority current chapter beats from the resolved chapter plan.

#### Scenario: Draft omits the current chapter's required object clue

- **GIVEN** chapter 4's plan requires the old-object clue "手术刀"
- **WHEN** the proposed chapter contains no matching clue or equivalent scene evidence
- **THEN** continuity findings include `missing-current-beat`
- **AND** review/finalization gate becomes `REVISE`

### Requirement: Future beat leakage detection

The system SHALL detect high-confidence use of later chapter core events, locations, reveals, old-object clues, or planned character entrances.

#### Scenario: Chapter 3 consumes chapter 5's core reveal

- **GIVEN** chapter 3 is current
- **AND** chapter 5's plan reveals the sister's location at the meat factory
- **WHEN** chapter 3 states that location and resolves the information trade
- **THEN** continuity findings include `future-beat-leak`
- **AND** the gate becomes `REVISE`

### Requirement: Unauthorized resource escalation detection

The system SHALL detect when a chapter grants material resources not supported by previous state or current plan.

#### Scenario: Low-level urban chapter suddenly grants military weapons

- **GIVEN** previous state and current plan do not include firearms, grenades, tactical gear, or military suppressants
- **WHEN** the chapter gives the protagonist a short assault rifle, high-explosive grenade, or military suppressant
- **THEN** continuity findings include `unauthorized-resource-escalation`
- **AND** the gate becomes `REVISE`

### Requirement: Review report continuity evidence

The system SHALL add service-side continuity findings to chapter review reports.

#### Scenario: Model self-review says continuity is perfect

- **GIVEN** the model review text says "连续性完美"
- **AND** service-side continuity gate found a future-beat leak
- **WHEN** the review report is augmented
- **THEN** the report contains a service-side continuity section
- **AND** the final review gate is at least `REVISE`
