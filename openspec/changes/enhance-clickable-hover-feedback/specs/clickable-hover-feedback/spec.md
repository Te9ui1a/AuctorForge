## ADDED Requirements

### Requirement: Enabled Interactive Pointer Cursor
Enabled interactive controls SHALL show a pointer cursor to indicate they can be clicked.

#### Scenario: Hovering an enabled control
- **WHEN** the user hovers an enabled button, link, or role-button control with a pointer device
- **THEN** the system uses a pointer cursor for that control.

#### Scenario: Hovering a disabled control
- **WHEN** the user hovers a disabled or aria-disabled control
- **THEN** the system does not use the enabled pointer affordance
- **AND** the control presents a disabled cursor affordance.

### Requirement: Clickable Surface Hover Feedback
Clickable project cards SHALL provide restrained hover feedback in addition to the pointer cursor.

#### Scenario: Hovering a clickable project card
- **WHEN** the user hovers a clickable project card with a fine pointer device
- **THEN** the card uses a pointer cursor
- **AND** the card provides a subtle visual response that does not shift surrounding layout.

### Requirement: Restrained Motion
Hover feedback SHALL remain subtle and respect reduced-motion preferences.

#### Scenario: User prefers reduced motion
- **WHEN** the user has reduced motion enabled
- **THEN** hover feedback avoids prolonged or attention-grabbing motion.
