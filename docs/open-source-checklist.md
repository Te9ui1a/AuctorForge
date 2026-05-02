# 开源发布检查清单 / Open-Source Release Checklist

正式公开 AuctorForge 前使用这份清单。

## 仓库安全

- [ ] 没有提交 `.env`
- [ ] 没有提交 API key、token、cookie 或模型凭证
- [ ] 没有提交未公开稿件正文
- [ ] 没有提交本地项目数据
- [ ] 日志没有暴露请求内容或个人路径
- [ ] 截图和 demo 只使用虚构内容
- [x] 内部开发历史已排除在 Git 外

## 文档

- [x] README 说明了 AuctorForge 是什么
- [x] README 包含真实安装和运行命令
- [x] README 链接隐私、路线图和贡献文档
- [x] License 已存在
- [x] `.env.example` 已存在
- [ ] 从干净 checkout 测试快速开始流程
- [x] Roadmap 反映当前优先级

## 产品准备度

- [x] 首屏使用 AuctorForge 品牌
- [x] 空状态对作者可理解
- [x] 模型配置失败提示可读
- [x] 本地项目存储说明清楚
- [x] 远程模型请求边界已初步说明
- [x] 已有手动导出/备份说明

## 社区

- [x] Bug 反馈 Issue 模板
- [x] 功能建议 Issue 模板
- [x] 写作流程/模板建议 Issue 模板
- [x] 贡献指南
- [ ] Code of conduct
- [x] 安全政策
- [ ] 标记 good first issue

## 发布

- [x] 添加截图或 demo 素材
- [x] 起草第一版发布说明
- [x] 添加简短架构概览
- [x] 确认 Git 仓库状态和远程地址
- [ ] 标记初始公开 release
