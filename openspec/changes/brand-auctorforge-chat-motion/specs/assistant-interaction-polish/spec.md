## ADDED Requirements

### Requirement: Product Identity

The web workbench SHALL present the product identity as `AuctorForge` on startup and fallback workbench surfaces while retaining Chinese explanatory copy for writer tasks.

#### Scenario: Startup screen presents the product name

- **GIVEN** the user opens the startup screen
- **WHEN** the entry UI renders
- **THEN** the visible product identity includes `AuctorForge`
- **AND** the page does not expose the old working-title phrase.

#### Scenario: Workbench fallback name uses the product identity

- **GIVEN** the workbench has no active project name
- **WHEN** the top bar renders
- **THEN** the project identity fallback is `AuctorForge`.

### Requirement: Assistant Waiting Motion

The chat panel SHALL show an accessible, animated waiting state while the model is thinking.

#### Scenario: Assistant is thinking

- **GIVEN** the assistant status is `thinking`
- **WHEN** the chat panel renders
- **THEN** the waiting indicator has `role="status"` with an accessible label
- **AND** it exposes motion-specific structure for animated dots and a sweep highlight.

### Requirement: Assistant Output Motion

The chat panel SHALL show an accessible output state while the assistant is streaming.

#### Scenario: Assistant is outputting

- **GIVEN** the assistant status is `streaming`
- **WHEN** the chat panel renders
- **THEN** the output indicator is announced as a status
- **AND** it exposes a subtle animated progress line.

### Requirement: Reduced Motion

Chat motion SHALL respect the user's reduced-motion preference.

#### Scenario: Reduced motion is preferred

- **GIVEN** the user agent matches `prefers-reduced-motion: reduce`
- **WHEN** chat message, thinking, or streaming motion styles apply
- **THEN** those animations are disabled without hiding status text or controls.
