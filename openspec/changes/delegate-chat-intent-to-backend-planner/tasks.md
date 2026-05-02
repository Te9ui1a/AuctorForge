## 1. Contracts And Frontend Exit

- [x] 1.1 Add auto/default chat mode semantics to shared chat request contracts.
- [x] 1.2 Change ordinary composer submits to avoid frontend natural-language plan/write forcing.
- [x] 1.3 Keep explicit continue-discussion and approval actions deterministic.
- [x] 1.4 Update frontend tests to prove ordinary delegated creative text is not classified by frontend rules.

## 2. Backend Planner

- [x] 2.1 Add a backend chat turn planner module with typed decisions for discussion, proposal, approval, and workflow-action.
- [x] 2.2 Add model-backed planner parsing for OpenAI-compatible and Gemini-native configured providers.
- [x] 2.3 Add deterministic fallback planning for missing or invalid planner model output.
- [x] 2.4 Inject current workflow, pending state, active document, write-scope summary, and discussion notes into planner input.

## 3. Chat Routing Integration

- [x] 3.1 Route auto-mode ordinary turns through the backend planner before discussion/proposal generation.
- [x] 3.2 Preserve explicit approval, guide/analyze/define, review, and chapter-continuation command handling outside planner authority.
- [x] 3.3 Ensure forced discussion mode bypasses proposal generation.
- [x] 3.4 Preserve proposal safety validation and approval-only file writes after planner-selected proposal turns.

## 4. Verification

- [x] 4.1 Add server regression tests for model-selected proposal intent without frontend write forcing.
- [x] 4.2 Add server regression tests for planner fallback and forced discussion behavior.
- [x] 4.3 Run focused frontend and backend test suites for chat strategy, chat stream/request payloads, and createApp chat routing.
- [x] 4.4 Validate the OpenSpec change.
