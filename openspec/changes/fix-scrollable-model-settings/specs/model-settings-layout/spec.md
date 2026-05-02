## ADDED Requirements

### Requirement: Viewport-Bounded Settings Dialog
The model settings dialog SHALL fit within the available viewport height and keep all configuration controls reachable.

#### Scenario: Short viewport model settings
- **WHEN** the model settings dialog is open on a viewport shorter than the natural form content
- **THEN** the dialog surface remains bounded to the viewport
- **AND** the settings body provides vertical scrolling for overflowing fields
- **AND** the footer actions remain reachable without requiring page-level scrolling
