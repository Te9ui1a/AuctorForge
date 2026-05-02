# AI 写作工具用户最关心什么

> English summary: This page explains what writers often care about when evaluating AI writing tools, and how AuctorForge responds through local-first files, fictional trials, author control, long-form context, and transparent model boundaries.

AuctorForge 的产品假设很简单：作者只有在能掌控稿件、流程和发布风险时，才会认真使用 AI 写作工具。

这篇文档整理了作者组织、AI 写作产品政策、长篇写作工具评测中反复出现的关注点，并说明 AuctorForge 当前如何回应这些问题。

## 1. 稿件隐私

正文、设定、大纲、人物卡、提示词和对话历史都可能包含未公开创意。作者最想知道的是：哪些内容留在本地，哪些内容会发给模型服务商，自己的文本会不会被用于训练。

AuctorForge 当前做法：

- 项目是普通本地文件夹。
- 可以先用虚构示例项目 `Lantern Road` 试跑，再导入真实稿件。
- 不配置模型服务商时，也可以浏览、编辑和检查本地项目。
- 隐私文档说明：使用模型能力时，相关项目文本可能会发送给你配置的服务商。

## 2. 版权、授权与控制感

作者组织长期强调：AI 系统使用作者作品时应重视同意、补偿、透明和选择权。作者也关心 AI 辅助生成的内容是否仍由自己掌控，工具是否会弱化作者声音。

AuctorForge 当前做法：

- 仓库不内置私人稿件或未经授权的第三方正文样本。
- 内置示例项目是专门为评估工具创建的虚构内容。
- 产品文案把 AI 定位为作者工作流助手，而不是作者替代品。
- 路线图优先补模型请求透明能力，再考虑更深的自动化。

## 3. 长篇一致性

长篇写作不是短提示词能解决的。作者关心人物是否跑偏、设定是否冲突、伏笔是否断线、章节目标是否一致，以及助手能不能在多章上下文里记住正确内容。

AuctorForge 当前做法：

- 项目文件把边界、设定、大纲、正文、审查、记忆文件分开管理。
- 工作台把文件树、编辑器、流程状态和助手对话放在同一个项目上下文里。
- 现有工作流资产关注章节写作、审查循环、连续性质检和结构化项目记忆。

## 4. 输出质量与可编辑性

多数作者并不需要“一键成书”。更实际的需求是：可用片段、定向改写、审稿意见、下一步建议，以及能保留自己声音的修改空间。

AuctorForge 当前做法：

- 工作流以可编辑文件为核心。
- 助手回复围绕项目上下文，而不是散落在独立聊天窗口中。
- 产品强调起草、审查、修改循环，而不是自动发布。

## 5. 工作流贴合度

AI 写作工具要和作者已有习惯竞争：文件夹、文档、表格、聊天记录、平台截稿节奏。好的工具应该减少上下文分散，而不是把作者锁进一个看不见文件的系统里。

AuctorForge 当前做法：

- 作者可以从启动页创建、导入、继续本地项目。
- 项目文件可以在应用外检查和备份。
- 启动页提示：大改前复制整个项目文件夹。
- OpenSpec 变更记录让贡献者能追踪产品行为为什么改变。

## 产品原则

后续 AuctorForge 功能应继续遵循：

- **本地优先**：文件在哪里、如何备份、如何迁移，要说清楚。
- **先用虚构示例试跑**：不要让作者一上来就暴露真实稿件。
- **模型边界透明**：什么时候只是本地编辑，什么时候会调用远程模型，要明确。
- **作者掌控创作**：AI 应帮助判断、审查、改写，而不是替作者做最终决定。
- **长篇记忆是一等需求**：人物、设定、伏笔和章节上下文要被系统认真对待。

## 近期路线图对应

对中文网文作者最有价值的下一批信任能力：

- 模型请求前预览将要发送的文本范围。
- 更强的导出与备份控制。
- 更明显的项目文件夹位置与恢复说明。
- 更多只使用虚构内容的示例工作流。

## 参考来源

- [Authors Guild: AI survey on consent and compensation](https://authorsguild.org/news/ag-ai-survey-reveals-authors-overwhelmingly-want-consent-and-compensation-for-use-of-their-works/)
- [Society of Authors: survey on generative AI impacts](https://societyofauthors.org/2024/04/11/soa-survey-reveals-a-third-of-translators-and-quarter-of-illustrators-losing-work-to-ai/)
- [Jenni AI privacy documentation](https://docs.jenni.ai/docs/account/privacy/)
- [Sudowrite intellectual property and ownership documentation](https://docs.sudowrite.com/legal-stuff/h8ppDEnJAwytH3jhJKu6c1/intellectual-property-and-ownership/bR8b2buPpQqqiYAaZNDU4H)
- [Tom's Guide: long-form AI writing tools and workflow limits](https://www.tomsguide.com/ai/writing-a-novel-in-2026-heres-why-chatgpt-alone-wont-get-you-to-the-finish-line)
