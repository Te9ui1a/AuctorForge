# 前端 UI 系统迁移方案 v1

> 状态：建议执行方案
> 目标栈：保留 React + Vite + React Router，逐步引入 Tailwind CSS + shadcn/ui + Lucide Icons
> 适用范围：首页、设置、弹层、项目卡片、工作台壳层、后续高复杂工作台组件

---

## 1. 为什么要迁

当前前端并不落后，但已经明显进入 **“设计系统不够统一、样式维护成本偏高”** 的阶段。

当前问题不是框架本身，而是：

- `styles.css` 已经变大，视觉规则容易重复和互相覆盖
- 首页、工作台、弹层虽然方向已经明确，但 UI primitives 还没有统一系统
- 图标语言正在从临时符号往正式产品图标过渡，需要统一落点
- 后续如果继续做首页、工作台、弹层和内容区优化，继续靠全局 CSS 手工扩张，维护成本会继续上升

所以这次迁移的重点不是“框架换代”，而是：

> **先把 UI 系统升级成现代、稳定、可复用的体系。**

---

## 2. 迁移原则

## 2.1 先迁 UI 系统，不先换框架

当前项目最值得升级的是：

- Tailwind CSS
- shadcn/ui
- Lucide Icons

而不是立刻切到 Next.js。

### 原因

- 现有前端已经是 React 19 + Vite 7 + React Router 7
- 当前核心问题是 UI 体系，不是 SSR / App Router / 服务端渲染能力
- 如果现在直接全量迁 Next.js，收益不一定大于成本

---

## 2.2 分阶段迁，不做一次性重写

迁移采用：

1. **先底座**
2. **再低风险页面**
3. **再工作台外壳**
4. **最后高复杂交互区**

这不是“保守”，而是为了保证：

- 工作流不中断
- 现有测试可以持续跟上
- UI 收益可以尽快显现

---

## 2.3 shadcn/ui 只管控件层，不管产品骨架

适合用 shadcn 的：

- Button
- Dialog
- Tabs
- Input / Textarea
- Select / Switch / Checkbox
- Tooltip
- DropdownMenu
- Badge / Alert / Card（低差异场景）

不适合直接拿 shadcn 当主骨架的：

- FileTree
- ChatPanel
- DocumentEditor
- WorkflowPanel
- 整个 Workbench shell

结论：

> **shadcn 是 primitives，不是你整个产品的形态语言。**

---

## 3. 设计参考（来自 awesome-design-md）

## 3.1 首页

- **Claude + Stripe**
- 目标：更像产品首页，而不是项目中心

借：

- Claude 的创作气质
- Stripe 的结构与 CTA 秩序

---

## 3.2 工作台壳层

- **Linear**
- 目标：稳定、清晰、有秩序

借：

- 壳层结构
- rail / tabs / badge / status 层级

---

## 3.3 编辑器 / 内容面

- **Notion**
- 目标：温和、低压、适合久写

借：

- 内容面的安静感
- 低压阅读面

---

## 3.4 设置 / 弹层 / 表单

- **Vercel**
- 目标：控件精度高、克制、统一

借：

- 按钮
- 输入
- 对话框
- 交互精度

---

## 3.5 帮助 / onboarding

- **Mintlify**
- 目标：清晰、轻文档感、好读

---

## 4. 迁移总阶段图

## Phase 0：搭设计系统底座

### 目标

先把新 UI 体系搭起来，但**不碰业务页面**。

### 修改/新增文件

- `apps/web/package.json`
  - 增加 Tailwind / Lucide / shadcn 依赖
- `apps/web/vite.config.ts`
  - 接 Tailwind
- `apps/web/src/main.tsx`
  - 接新的全局样式入口
- 新增：
  - `apps/web/src/lib/utils.ts`
  - `apps/web/src/components/ui/*`
  - `apps/web/src/styles/globals.css`
  - `apps/web/src/styles/tokens.css`（可选）

### 交付物

- `cn()`
- Button
- Dialog
- Tabs
- Input
- Badge
- Tooltip
- DropdownMenu
- Icon 规则
- 基础 token

### 验收

- 不修改任何业务页面
- 所有现有测试继续通过

---

## Phase 1：先迁低风险高收益区

### 目标

最先把用户可感知收益最大、同时风险最低的区域迁入新体系。

### 第一批迁移文件

- `apps/web/src/features/startup/StartupScreen.tsx`
- `apps/web/src/features/startup/ProjectManagerPanel.tsx`
- `apps/web/src/features/startup/ProjectCard.tsx`
- `apps/web/src/features/startup/ProjectSwitchDialog.tsx`
- `apps/web/src/features/settings/ModelSettingsPanel.tsx`
- `apps/web/src/features/layout/BrandMark.tsx`
- 对应测试文件

### 这批文件怎么迁

#### 用 shadcn/ui 的地方

- Button
- Dialog
- Tabs
- Input
- Badge
- Tooltip

#### 用 Lucide 的地方

- 首页 CTA 图标
- 顶栏图标
- 管理动作图标
- 设置图标
- 弹层图标

#### 用 Tailwind 的地方

- 首页 Hero
- 顶部导航
- 设置弹层
- 项目卡片
- 布局和间距

### 保持不动

- 路由行为
- 工作流逻辑
- startup/project API
- dirty draft 保护

### Phase 1 验收标准

- 首页、设置、弹层、项目卡片完成迁移
- 图标语言统一到 Lucide
- 用户主路径不变
- 浏览器 smoke 通过

---

## Phase 2：迁工作台外壳

### 目标

把整体 shell 迁到新体系，但仍然不动高复杂内容区逻辑。

### 第二批迁移文件

- `apps/web/src/App.tsx`（视图层部分）
- `apps/web/src/features/layout/TopBar.tsx`
- `apps/web/src/features/editor/EditorTabs.tsx`
- `apps/web/src/features/files/FileTree.tsx`（壳层/toolbar 部分）
- `apps/web/src/features/workflow/WorkflowPanel.tsx`（壳层部分）
- `apps/web/src/styles.css` 中 shell 相关区块

### 迁移原则

- Tailwind 负责 grid / spacing / shell background / rail layout
- shadcn 只借 Tabs、Tooltip、Badge、Dropdown 等 primitives
- shell 自己写，不套 dashboard 模板

### Phase 2 验收标准

- TopBar / shell / tabs / rail header 完成迁移
- 现有路由和工作流行为不变
- shell 风格统一到新体系

---

## Phase 3：迁高复杂交互区

### 目标

将最复杂的 4 块迁入新体系，但只迁视图层。

### 第三批迁移文件

- `apps/web/src/features/chat/ChatPanel.tsx`
- `apps/web/src/features/editor/DocumentEditor.tsx`
- `apps/web/src/features/files/FileTree.tsx`（深交互部分）
- `apps/web/src/features/workflow/WorkflowPanel.tsx`（深交互部分）

### 原则

- 保留业务逻辑
- Tailwind 接管布局和视觉
- shadcn 不主导这 4 块的结构
- 允许拆成更细小的 presenter/view 组件

### Phase 3 验收标准

- 视觉统一
- 路由 / dirty draft / chat stream / workflow 不变
- 高复杂区域和新体系可以共存且无覆盖冲突

---

## Phase 4：清理旧样式

### 目标

真正退役旧系统，而不是看起来迁完。

### 要做的事

- 删除已迁页面对应的旧 CSS 块
- 清理重复 class
- 清理过时 icon 规则
- 确保只剩 token / legacy 未迁区块 / 新体系样式三类来源

### 验收标准

- 不再出现“新旧两套样式互相覆盖”
- 已迁页面只有新体系负责显示

---

## 5. 文件级策略

## 5.1 直接进入新体系的目录

- `features/startup/*`
- `features/settings/*`
- `features/layout/*`

## 5.2 后迁但必须统一的目录

- `features/editor/*`
- `features/files/*`
- `features/workflow/*`
- `features/chat/*`

## 5.3 先不碰的

- `apps/server/*`
- `packages/shared/*`
- 后端 API 行为

---

## 6. 图标迁移顺序

### 第一批

- 首页 CTA
- 顶栏
- 管理动作
- 设置面板
- 弹层按钮

### 第二批

- rail 图标
- 文件树工具按钮
- workflow 状态图标

### 最后考虑

- 强业务语义的自定义图形

---

## 7. 风险与控制

## 7.1 最大风险

不是功能坏，而是进入 **新旧样式混搭期**。

### 控制方法

- 已迁页面：新体系优先
- 未迁页面：旧 CSS 继续接管
- 不允许在同一组件里没有边界地混 Tailwind 和旧全局 class

---

## 7.2 路由和状态风险

工作台相关区域存在：

- URL 驱动状态
- dirty draft 保护
- pendingSwitch
- chat session
- workflow guard

这些都说明：

> Phase 2 以后必须坚持“先迁视图层，后动状态层”。

---

## 8. 第一轮最推荐的实际执行范围

如果现在就开始，最推荐的是：

1. 完成 Phase 0
2. 只做到 Phase 1

也就是：

- 接入 Tailwind
- 接入 shadcn
- 接入 Lucide
- 重做首页
- 重做设置弹层
- 重做项目切换弹层
- 重做项目卡片

### 为什么

这批最容易：

- 快速见效
- 低风险
- 最先把“产品感”和“系统一致性”拉起来

---

## 9. 一句话原则

> **先迁 UI 系统，再迁页面，再考虑框架。**

这份迁移方案的正确执行方式不是“赶紧换完”，而是：

> **让每一阶段都能独立交付、独立验证、独立回退。**
