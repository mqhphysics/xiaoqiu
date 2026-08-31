# P1-SB-11-02 后台赛事创建纵向切片

## 目标

完成后台管理端的第一个可用工作流：管理员在浏览器中创建赛事基础信息、球队、场地、比赛和赛程草案，并发布赛程。页面优先服务反复录入和验收，不做营销式首页。

本任务可以先对接约定的 P1 API 适配层；若后端分支尚未合入，使用本地 mock repository 保持页面可运行，并在完成报告中标明待集成点。

## 分支

`ai/p1-admin-schedule`

## 写入范围

- `apps/admin-web/src/**`
- `apps/admin-web/package.json` 如确需新增前端依赖
- `docs/test-cases/P1-admin-schedule-slice.md`

不得修改 `pnpm-lock.yaml`。不得修改 `packages/api-client/**`。

## 禁止修改范围

- `prisma/**`
- `apps/api/**`
- `apps/mini-program/**`
- `packages/contracts/**`
- `packages/api-client/**`
- `infra/**`
- `.github/**`

## 前置依赖

- P0 后台应用可构建。
- P1 API 任务会提供最终接口；本任务可以先实现同名 adapter。

## 必做内容

1. 管理后台布局
   - 左侧或顶部导航：赛事、球队、赛程。
   - 当前组织上下文使用开发期固定值或可切换控件。
   - 页面不需要真实登录，但要显式携带 P1 开发期请求头。

2. 赛事创建
   - 创建赛季。
   - 创建赛事。
   - 创建并发布一个规则版本。
   - 表单包含必填校验和服务端错误展示。

3. 球队与场地
   - 创建球队，至少支持球队代码、名称、短名、队徽占位。
   - 创建场地，至少支持场地代码、名称、校区/位置。
   - 列表可刷新，重复代码错误可读。

4. 比赛与赛程草案
   - 选择两支球队、时间、场地创建比赛。
   - 创建赛程草案。
   - 校验草案。
   - 发布赛程。
   - 发布后页面显示发布版本和更新时间。

5. API 适配层
   - 在 `apps/admin-web/src/features/**` 内封装 repository。
   - 适配层优先读取 `VITE_API_BASE_URL`。
   - 若 API 不可用，允许 mock 模式，但 UI 必须清晰标注开发环境。
   - 不直接散落 `fetch` 调用在组件里。

6. UX 要求
   - 不使用大 hero。
   - 信息密度适合运营后台。
   - 表单提交中禁用重复提交。
   - 错误消息和成功状态不遮挡主流程。

## 完成标准

- 后台首页就是赛事管理工作台。
- 可以完成：
  `创建赛季 -> 创建赛事 -> 创建两队 -> 创建场地 -> 创建比赛 -> 发布赛程`。
- 网络/API 错误有可读提示。
- 页面刷新后可重新读取已有数据；若使用 mock，至少保存在内存 repository 并说明限制。
- `npx pnpm@11.5.2 --filter @xiaoqiu/admin-web typecheck` 通过。
- `npx pnpm@11.5.2 --filter @xiaoqiu/admin-web build` 通过。

## 测试命令

```powershell
npx pnpm@11.5.2 --filter @xiaoqiu/admin-web typecheck
npx pnpm@11.5.2 --filter @xiaoqiu/admin-web build
```

## 风险

- 与后端接口命名不一致。
- 页面把 mock 行为误认为真实持久化。
- 表单状态没有防重复提交。
- 过早引入复杂 UI 依赖。

## 完成报告

按 `AGENTS.md` 完成报告格式输出，并额外列出：

- 页面路径和主要组件。
- API adapter 方法清单。
- 与 P1 API 分支需要集成的契约差异。
