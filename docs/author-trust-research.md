# What Writers Care About In AI Writing Tools

AuctorForge is built around a simple assumption: writers will only use AI seriously when they can keep control of their manuscript, process, and publishing risk.

This page summarizes common concerns we saw across author advocacy groups, AI writing product policies, and long-form writing tool reviews, then maps them to AuctorForge's current choices.

## The Concerns

### 1. Manuscript Privacy

Drafts, outlines, character notes, and prompt history can be commercially sensitive. Writers want to know what stays local, what may be sent to a model provider, and whether their text is used for training.

What AuctorForge does today:

- Projects are normal local folders.
- The app can be explored with a fictional Lantern Road sample before importing real drafts.
- Local browsing and editing can happen before model-provider credentials are configured.
- Privacy documentation explains that model-backed features may send selected project text to the configured provider.

### 2. Copyright, Consent, And Control

Author groups consistently emphasize consent, compensation, transparency, and the right to decide how authored work is used by AI systems. Writers also care about whether generated or assisted text remains under their control.

What AuctorForge does today:

- The project avoids bundled private or third-party manuscript samples.
- The built-in sample project is fictional and created for evaluation.
- The product copy frames AI as an assistant for the writer's workflow, not as an author replacement.
- The roadmap prioritizes model-request transparency before deeper automation.

### 3. Long-Form Consistency

Short prompts are not enough for long fiction. Writers care about character continuity, outline alignment, foreshadowing, scene goals, and whether the assistant remembers the right context across chapters.

What AuctorForge does today:

- Project files separate boundaries, settings, outlines, drafts, review notes, and memory files.
- The workbench keeps files, editor, workflow state, and assistant chat in one place.
- Existing workflow assets focus on chapter drafting, review loops, continuity gates, and structured project memory.

### 4. Output Quality And Editability

Writers rarely want a one-click novel. They want usable fragments, targeted rewrites, review notes, and clear next steps that fit their own voice.

What AuctorForge does today:

- The workflow is file-based and editable.
- Assistant responses are routed through project context instead of detached chat windows.
- The product emphasizes drafting, review, and revision loops rather than automatic publication.

### 5. Workflow Fit

AI tools compete with the habits authors already have: folders, notes, docs, spreadsheets, chat logs, and platform deadlines. A useful tool must reduce scattered context without forcing authors into a locked system.

What AuctorForge does today:

- Writers can create, import, and continue local projects from the launcher.
- Project files remain inspectable outside the app.
- Backup guidance recommends copying the whole project folder before major experiments.
- OpenSpec change records make product behavior changes auditable for contributors.

## Product Principles

These principles should guide future AuctorForge work:

- **Local-first by default**: make file location and portability obvious.
- **Fictional trials first**: let writers test safely before using real manuscripts.
- **Transparent model boundaries**: show when project text may leave the machine.
- **Author remains in charge**: optimize for control, review, and revision.
- **Long-form memory matters**: keep continuity and project context as first-class product concerns.

## Near-Term Roadmap Fit

The next highest-value trust features are:

- Clear model-request previews before remote calls.
- Stronger export and backup controls.
- More visible project folder location and recovery guidance.
- More sample workflows using fictional content only.

## Sources

- [Authors Guild: AI survey on consent and compensation](https://authorsguild.org/news/ag-ai-survey-reveals-authors-overwhelmingly-want-consent-and-compensation-for-use-of-their-works/)
- [Society of Authors: survey on generative AI impacts](https://societyofauthors.org/2024/04/11/soa-survey-reveals-a-third-of-translators-and-quarter-of-illustrators-losing-work-to-ai/)
- [Jenni AI privacy documentation](https://docs.jenni.ai/docs/account/privacy/)
- [Sudowrite intellectual property and ownership documentation](https://docs.sudowrite.com/legal-stuff/h8ppDEnJAwytH3jhJKu6c1/intellectual-property-and-ownership/bR8b2buPpQqqiYAaZNDU4H)
- [Tom's Guide: long-form AI writing tools and workflow limits](https://www.tomsguide.com/ai/writing-a-novel-in-2026-heres-why-chatgpt-alone-wont-get-you-to-the-finish-line)
