# Harden Architecture Review Findings

## Why

The architecture review found that project identity is still process-wide, required project reads hide infrastructure failures, file-save input is not runtime validated, chat stream semantics are misleading, and backend/frontend composition still relies on god-object boundaries.

## What Changes

- Make project-scoped API requests target a project explicitly instead of relying on a process-wide active project singleton; invalid explicit project identity fails clearly instead of falling back.
- Preserve missing-file tolerance in prompt assembly while surfacing filesystem safety and infrastructure errors.
- Validate file-save request bodies before side effects and return clear 400 responses.
- Clarify or harden the `/api/chat/stream` compatibility transport so clients do not mistake completed-response SSE for true streaming.
- Extract backend chat/proposal orchestration from `createApp.ts` behind focused services.
- Replace the workbench giant prop surface with smaller view-model boundaries.

## Capabilities

- `project-request-targeting`
- `project-file-safety`
- `chat-transport-reliability`
- `workbench-architecture`

## Impact

- Prevents cross-window project bleed for session/progress reads, file tree and file content reads, saves, chat session persistence, and chat turns.
- Avoids silently generating with unsafe or unreadable project context.
- Makes malformed file-save calls predictable.
- Lowers future workflow-change risk by reducing central orchestration files.
