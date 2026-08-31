# P1-SB-11-03 小程序只读赛事与赛程

## 目标

完成小程序侧 P1 只读体验：普通用户可以看到赛事列表、赛事详情、按日期分组的赛程、比赛详情和球队详情。优先保证移动端清晰、稳定、可构建。

本任务不实现登录、关注、报名、比分录入、榜单和复杂淘汰赛图。

## 分支

`ai/p1-mini-readonly-schedule`

## 写入范围

- `apps/mini-program/src/**`
- `apps/mini-program/package.json` 如确需新增前端依赖
- `docs/test-cases/P1-mini-readonly-schedule.md`

不得修改 `pnpm-lock.yaml`。不得修改后端、Prisma 或 contracts。

## 禁止修改范围

- `prisma/**`
- `apps/api/**`
- `apps/admin-web/**`
- `packages/contracts/**`
- `packages/api-client/**`
- `infra/**`
- `.github/**`

## 前置依赖

- P0 Taro 应用、快速报告 Spike 和 H5 构建已可用。
- P1 API 分支会提供只读接口；本任务可以先使用本地 readonly repository 和 mock fixture。

## 必做内容

1. 页面
   - 赛事列表页。
   - 赛事详情页。
   - 赛程列表页，按日期分组。
   - 比赛详情页。
   - 球队详情页。

2. 导航
   - 更新 `app.config.ts` 页面配置。
   - 首页提供进入 P1 只读赛事的入口。
   - 保留 P0 quick-report Spike，不破坏其入口。

3. 只读数据层
   - 在 `apps/mini-program/src/features/readonly-schedule/**` 下实现 repository。
   - API 可用时读取 `TARO_APP_API_BASE_URL` 或配置常量。
   - API 不可用时使用本地 mock fixture。
   - 页面组件不直接散落网络请求。

4. 交互与弱网
   - 列表加载、空状态、失败重试。
   - 赛程按日期和阶段展示。
   - 比赛状态至少区分未开始、已发布、取消。
   - 页面可在 H5 构建中预览。

5. 纯函数测试
   - 赛程按日期分组。
   - 比赛排序。
   - 状态文案映射。

## 完成标准

- 小程序可从首页进入赛事列表。
- 可查看一个 mock 或 API 返回的赛事、球队和比赛详情。
- 赛程列表在移动端文字不重叠。
- `npx pnpm@11.5.2 --filter @xiaoqiu/mini-program test` 通过。
- `npx pnpm@11.5.2 --filter @xiaoqiu/mini-program typecheck` 通过。
- `npx pnpm@11.5.2 --filter @xiaoqiu/mini-program build` 通过。
- `npx pnpm@11.5.2 --filter @xiaoqiu/mini-program build:h5` 通过，允许保留已知体积 warning。

## 测试命令

```powershell
npx pnpm@11.5.2 --filter @xiaoqiu/mini-program test
npx pnpm@11.5.2 --filter @xiaoqiu/mini-program typecheck
npx pnpm@11.5.2 --filter @xiaoqiu/mini-program build
npx pnpm@11.5.2 --filter @xiaoqiu/mini-program build:h5
```

## 风险

- 与后端只读 ViewModel 字段名不一致。
- H5 能跑但微信小程序构建失败。
- 页面入口破坏 quick-report Spike。
- UI 在窄屏文字溢出。

## 完成报告

按 `AGENTS.md` 完成报告格式输出，并额外列出：

- 新增页面路径。
- mock fixture 字段结构。
- 与 P1 API 分支需要对齐的字段差异。
