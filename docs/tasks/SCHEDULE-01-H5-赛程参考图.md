# SCHEDULE-01：桌面 H5 赛程参考图还原

日期：2026-10-02。用户本轮直接安排，参考 `参考图片/01-页面与品牌-2026-09-26/references/04-schedule-reference.png`。

执行基线：[产品与技术架构](../architecture/晓球产品与技术架构最终版.md)、[协作规则](../../AGENTS.md)。任务分支为 `codex/h5-schedule-reference`，基线 `3d081f4`。

## 文件范围

- `apps/mini-program/src/pages/readonly-schedule/index.tsx`：通过平台组件接入赛程入口。
- `apps/mini-program/src/pages/readonly-schedule/desktop-schedule.tsx`：非 H5 平台沿用原组件。
- `apps/mini-program/src/pages/readonly-schedule/desktop-schedule.h5.tsx`：桌面 H5 展示与筛选，720px 及以下使用原页面。
- `apps/mini-program/src/pages/readonly-schedule/schedule-compact.tsx`：从原入口完整保留的页面，业务与样式未改。
- `apps/mini-program/src/pages/readonly-schedule/index.h5.scss`：全部新样式限定在桌面 H5。
- `apps/mini-program/src/assets/schedule-visual/pitch-corner.svg`、`README.md`：新增球场小图案及来源说明。
- 本任务卡。

本轮只提交上述成果，保留工作区里“我的”和“数据”页面的并行修改。没有公共模型、API 契约、依赖、微信配置或路由变更。

## 实现与验收

- 对照参考图实现深绿赛事标题、日期条、横向比分行、浅绿日期分组、主队卡、赛事进程与演示说明。
- 球队名称、队徽、比分、场地、比赛状态、赛季选项和主队偏好均来自现有 API。
- 日期、球队、比赛阶段、比赛状态、主队筛选、日期排序、比赛与球队详情跳转已接入。
- 对阵图复用既有淘汰赛布局算法；筛选命中的比赛突出显示，其他比赛保留晋级路径上下文。
- 原有灯柱、球门与场馆线稿复用；补绘 SVG 球场边线，装饰固定在屏幕边缘。
- 游客、未选主队、加载、空赛程、API 错误与重试均有实际状态。选择暂时不可读的赛事后提供“返回当前赛事”。
- 只重做桌面 H5；原赛程组件完整迁移。未开展微信构建、开发者工具或真机验收。

## 验证记录

- 赛程范围 TypeScript：`node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p private-data/runtime/schedule-typecheck.json --noEmit --typeRoots apps/mini-program/node_modules`，通过。
- 全工程 TypeScript：最终 `pnpm --filter @xiaoqiu/mini-program typecheck` 通过。
- ESLint：使用仓库现有 `eslint@10.5.0` 检查本任务四个 TSX 文件，通过。
- 原赛程逻辑：`node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --experimental-strip-types src/features/readonly-schedule/readonly-schedule.logic.test.ts`，9/9 通过。
- H5：`pnpm --filter @xiaoqiu/mini-program build:h5`，构建通过；仍有现有图片和应用入口体积警告。
- `git diff --check`：本任务范围通过。
- 浏览器：实际 Chrome + 本地 3000 H5 / 3001 API；截图和自动检查保存在本次聊天的本机可视化目录 `C:/Users/Mu Qinghan/.codex/visualizations/2026/10/02/01a0fbd2-fcd9-7cd3-a30e-5b5a927d32d0/`。错误状态使用明确的 HTTP 503 拦截来验证，正常赛程、筛选、主队和详情读取使用真实本地 API。
- 自动浏览器检查 24 项通过，未捕获页面异常；1619、1440、1280、1100、1024、768px 均无页面或主要容器横向溢出。390、720px 仍显示原页面。当前真实 API 筛选计数：全部 28 场、未开始 3 场、物院一队 7 场、淘汰赛 16 场、9 月 2 日 1 场；登录后数院星火主队筛选 6 场。
- 原组件保留核对：新 `schedule-compact.tsx` 的 Git blob 与基线原 `index.tsx` 完全相同，均为 `9deaadcc38a146d71162b8e622f0428934c7e8dd`。

## 未解决问题与协调事项

1. 当前 API 的赛季选项含三个其他赛事，但其 `competition-data` 均返回 HTTP 422。已验证切换后显式报错并返回当前赛事；未证明其他赛事的正常赛程加载。由 API / 赛事上下文负责人协调，不修改公共契约或伪造数据。
2. 公共文件与依赖变更建议：无。Push、合并与部署未执行。
