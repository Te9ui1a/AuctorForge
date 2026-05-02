## ADDED Requirements

### Requirement: Project file prompt content is budgeted
Prompt assembly SHALL cap oversized required project file content and include a visible truncation summary.

#### Scenario: Required project file is oversized
- **WHEN** a required project file exceeds the configured per-file character budget
- **THEN** the prompt includes the file path heading
- **AND** includes retained leading and trailing content
- **AND** includes a truncation marker with original and retained character counts

### Requirement: Attachment prompt content is budgeted
Prompt assembly SHALL cap oversized chat attachment content and preserve attachment metadata.

#### Scenario: Attachment is oversized
- **WHEN** a chat attachment exceeds the configured attachment character budget
- **THEN** the prompt includes the attachment name, MIME type, and byte size
- **AND** includes a truncation marker with original and retained character counts

### Requirement: Normal prompt content is unchanged
Prompt assembly SHALL not add truncation markers to content within budget.

#### Scenario: Required files and attachments fit within budget
- **WHEN** project files and attachments are within their budgets
- **THEN** their content appears without truncation markers
