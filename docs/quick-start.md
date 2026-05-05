# 快速开始 / Quick Start

这份文档帮助你在本地运行 AuctorForge，用于开发、试用和评估。

## 环境要求

- Node.js：兼容当前 workspace 依赖
- pnpm 10.x
- 现代浏览器

仓库在 `package.json` 中声明的包管理器是 `pnpm@10.32.1`。

## 安装依赖

```bash
pnpm install
```

## 配置环境变量

```bash
cp .env.example .env
```

第一次试用时，可以先不填写模型配置，只查看本地 UI 和示例项目。等你理解某个功能会向模型服务商发送哪些内容后，再添加模型 API 配置。

## 启动

启动 API 服务：

```bash
pnpm dev:server
```

另开一个终端启动 Web 应用：

```bash
pnpm dev:web
```

打开终端里 Vite 输出的地址，通常是：

```text
http://localhost:5173
```

API 服务默认地址：

```text
http://127.0.0.1:3001
```

## 验证

```bash
pnpm test
pnpm build
```

浏览器级检查：

```bash
pnpm test:e2e
```

如果本机还没有安装 Playwright Chromium：

```bash
pnpm test:e2e:install
```

## 第一次试用

建议先使用内置虚构示例项目：

- 项目：Lantern Road
- 主角：Lin Zhao，一个年轻灯匠
- 目标：重新打开一条关闭的商路
- 第一段剧情：调查边城城门灯同时熄灭的原因

在启动页点击 **试用示例项目**。AuctorForge 会在你的本地应用配置目录下创建示例项目，并像普通项目一样打开它。这样你可以先评估工作流，而不暴露真实未公开稿件。

如果你想查看带截图的试用流程，请阅读 [AuctorForge 使用说明](user-guide.md)。
