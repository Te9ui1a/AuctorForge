# AuctorForge v0.1.0 发布说明草稿

这是 AuctorForge 第一个面向公开发布准备的草稿。

## 这是什么

AuctorForge 是面向中文长篇网文作者的本地优先创作工作台。它结合了 React 工作台、Fastify 本地 API 服务、项目文件、内置写作工作流资产，以及 OpenSpec 驱动的产品开发记录。

English summary: AuctorForge is a local-first creative workbench for Chinese long-form fiction writers.

## 亮点

- 面向长篇创作材料的本地项目工作流
- AuctorForge 品牌下的启动页和工作台界面
- 可隐藏的首次使用建议
- 内置虚构示例项目 `Lantern Road`，用于安全试用
- 公开的作者信任调研页，把 AI 写作工具常见顾虑映射到 AuctorForge 的产品选择
- 启动页稿件安全和手动备份提示
- 文件导航、文档编辑、助手对话、流程进度和模型配置
- OpenSpec 变更记录，用于追踪会影响产品行为的工作
- 设置、架构、隐私、贡献和发布准备相关文档

## 给作者

第一次试用请从虚构示例项目开始。使用有价值的未公开稿件前，请确认项目文件保存在哪里、如何备份，以及模型配置会影响哪些远程请求。

## 给开发者

本地运行：

```bash
pnpm install
pnpm dev:server
pnpm dev:web
```

验证：

```bash
openspec validate --all
pnpm test
pnpm build
pnpm test:e2e
```

## 公开发布前仍需处理

- 增加截图或短 demo GIF。
- 在当前手动备份提示之外，补强导出和备份控制。
- 决定第一个 release tag 方案。
