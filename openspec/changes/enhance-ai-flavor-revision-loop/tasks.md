## 1. Rule Catalog and Lint Result Shape

- [x] 1.1 Replace the flat AI-flavor rule list with a categorized rule catalog while preserving current `lintAiFlavor(content)` compatibility.
- [x] 1.2 Add hit evidence fields: rule id, category, severity, matched text, local context, and blocking reason.
- [x] 1.3 Add category thresholds for accumulated warning-level issues.
- [x] 1.4 Cover existing banned phrases plus expanded categories for cliche phrases, empty emotion words, explanatory narration, mechanical transitions, overused similes, bookish dialogue, low-density paragraphs, English mixing, and generic intensifiers.
- [x] 1.5 Update current lint call sites that depend on `hit.pattern`, especially review snippet extraction, or preserve a compatible field.
- [x] 1.6 Add unit tests for blocking hits, warning accumulation, false-positive clean prose, and current compatibility behavior.

## 2. Replacement Strategy Planner

- [x] 2.1 Add a planner that maps lint hit categories to writing-strategy repair guidance.
- [x] 2.2 Ensure strategies describe writing moves rather than synonym substitutions.
- [x] 2.3 Group compatible hits by local span and strategy.
- [x] 2.4 Add tests for explanatory narration, empty emotion, overused simile, bookish dialogue, and mechanical transition strategies.

## 3. Local Repair Task Builder

- [x] 3.1 Add a repair-task builder that emits scoped local rewrite tasks with original snippet, adjacent context, issue evidence, strategy, and acceptance checks.
- [x] 3.2 Keep repair targets limited to sentence, paragraph, or scene-fragment spans.
- [x] 3.3 Add escalation logic that recommends whole-chapter rewrite only for dense cross-scene blocks or compressed-outline symptoms.
- [x] 3.4 Cap repair-task output so noisy chapters remain readable while still reporting blocking categories.
- [x] 3.5 Add tests proving isolated hits produce local tasks and dense structural failures produce escalation.

## 4. Review and Write Flow Integration

- [x] 4.1 Enrich review prompt/report generation so "AI味专项检查" and "局部改写任务" include categorized evidence and strategy guidance.
- [x] 4.2 Make write-stage AI-flavor warning text reference local repair as the next step instead of generic review advice.
- [x] 4.3 Route user requests such as "按审查报告修改" or "执行局部改写任务" through scoped repair instructions that preserve non-target chapter text.
- [x] 4.4 Ensure existing pending-proposal approval/write behavior remains unchanged and no lint result auto-overwrites project files.
- [x] 4.5 Update workflow skill docs for review/write to describe the local repair loop and whole-chapter rewrite escalation rule.

## 5. Verification

- [x] 5.1 Re-run lint on proposed local repairs and include verification status in generated repair/report text.
- [x] 5.2 Add regression tests for repair verification passing, repair introducing a new issue, and repair remaining localized.
- [x] 5.3 Add regression coverage that non-target chapter paragraphs survive local repair unchanged.
- [x] 5.4 Run the relevant server test suite and targeted workflow tests.
