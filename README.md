# AuctorForge

面向中文网文作者的本地优先 AI 长篇创作工作台。

> English summary: AuctorForge is a local-first creative workbench for Chinese long-form fiction writers. It helps writers manage project files, story context, workflow guidance, review loops, assistant chat, and model settings in one Web UI.

AuctorForge 想解决的是一个很具体的问题：长篇创作时，设定、人物、大纲、正文、审稿意见、AI 对话和提示词常常散落在不同文档、表格和聊天窗口里。这个项目把它们收回到一个可检查、可备份、以本地文件为核心的写作工作流里，让 AI 成为可控助手，而不是替作者接管创作。

## 适合谁

- 正在写长篇、连载、系列文的中文网文作者
- 需要管理人物、设定、大纲、正文、审查和连续性笔记的作者
- 希望先试用安全示例，再把真实稿件放进工具里的作者
- 希望 AI 辅助创作，但仍保留作者声音、判断和修改权的人
- 想参与本地文件、透明模型调用、长篇工作流工具建设的开发者
- 想贡献中文长篇创作流程、提示词和审稿模板的编辑/策划/工作流设计者

## 当前形态

这个仓库是一个 pnpm workspace：

- `apps/web`：Vite + React Web UI
- `apps/server`：Fastify 本地 API 服务
- `packages/shared`：共享 TypeScript 契约

产品当前重点是：本地项目文件、创作工作台、文件树、编辑器、助手对话、流程进度和模型配置。

## 截图

![AuctorForge 启动页](docs/assets/screenshots/startup.png)

## 快速开始

安装依赖：

```bash
pnpm install
```

复制环境变量模板：

```bash
cp .env.example .env
```

启动 API 服务：

```bash
pnpm dev:server
```

另开一个终端启动 Web UI：

```bash
pnpm dev:web
```

打开 Vite 输出的本地地址，通常是 `http://localhost:5173`。

更详细步骤见 [快速开始](docs/quick-start.md)。

## 常用命令

```bash
pnpm build       # 构建所有 workspace 包
pnpm test        # 运行单元测试
pnpm test:e2e    # 运行 Playwright 端到端测试
pnpm dev:server  # 启动本地 API 服务，默认 127.0.0.1:3001
pnpm dev:web     # 启动 Vite Web 应用
```

## 稿件隐私与安全

网文作者的正文、设定、大纲、未公开创意和模型密钥都可能非常敏感。使用真实稿件前，请先阅读 [稿件隐私与安全](docs/privacy.md)。

建议流程：

1. 先用内置虚构示例项目 `Lantern Road` 试跑。
2. 确认项目文件保存在哪里。
3. 大改前复制整个项目文件夹做备份。
4. 配置模型服务商前，先理解哪些功能可能把文本发送给远程模型。

我们为什么这样设计，见 [AI 写作工具用户最关心什么](docs/author-trust-research.md)。这篇文档把调研中的隐私、版权、控制感、长篇一致性和工作流适配问题，映射到 AuctorForge 当前的产品选择。

## 路线图

见 [ROADMAP.md](ROADMAP.md)。

近期优先级：

1. 让仓库容易运行、检查和贡献。
2. 让作者第一次进入时能安全试用：创建/打开项目、检查文件、与助手对话、编辑稿件材料。
3. 把模型调用和数据流讲清楚，让作者知道什么时候只是本地编辑，什么时候可能调用远程模型。
4. 扩展适合中文长篇网文的可复用工作流模板。
5. 补强导出、备份和模型请求透明能力。

## OpenSpec

本仓库使用 OpenSpec 记录会改变产品行为的工作，相关内容在 `openspec/` 下。

文档、示例、Issue 模板等发布支持内容可以直接提交；会改变用户流程、数据流或功能行为的变更应创建独立 OpenSpec change。详见 [OpenSpec 变更计划](docs/openspec-change-plan.md)。

代码结构见 [架构概览](docs/architecture.md)。发布说明草稿见 [v0.1.0 发布说明草稿](docs/release-notes-v0.1.0-draft.md)。

想转发或介绍项目，可以使用 [AuctorForge Promotion Kit](docs/promotion-kit.md) 里的项目简介、发帖文案和社区入口建议。

## 参与贡献

欢迎作者、编辑、工作流设计者和开发者参与。先看 [CONTRIBUTING.md](CONTRIBUTING.md)。

特别欢迎：

- 带复现步骤的 bug 反馈
- 中文网文创作流程反馈
- 人设、设定、大纲、正文审查相关模板建议
- 文档改进
- 带聚焦测试的小修复

## License

MIT License. See [LICENSE](LICENSE).
