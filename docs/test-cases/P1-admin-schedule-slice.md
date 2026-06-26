# P1 后台赛事创建纵向切片测试

## 手工验收用例

| 编号 | 场景 | 前置数据 | 操作 | 预期 | 自动化状态 |
| --- | --- | --- | --- | --- | --- |
| P1-ADMIN-001 | 后台首页为赛事管理工作台 | 打开 admin-web | 访问 `/` | 展示赛事、球队、赛程导航；显示当前组织和开发期请求头 | 待 E2E |
| P1-ADMIN-002 | 创建赛季、赛事并发布规则 | 无 | 创建赛季；选择赛季创建赛事；选择赛事发布规则版本 | 三步均成功；规则版本展示为已发布；重复版本号出现可读错误 | 待 E2E |
| P1-ADMIN-003 | 创建球队和场地 | 至少一个组织上下文 | 创建两支球队；创建一个场地；点击刷新 | 列表展示新球队和场地；重复球队代码或场地代码出现可读错误 | 待 E2E |
| P1-ADMIN-004 | 创建比赛 | 已有赛事、两队和场地 | 选择主队、客队、开球时间和场地后提交 | 比赛进入 `SCHEDULED`，可被赛程草案选择 | 待 E2E |
| P1-ADMIN-005 | 创建、校验并发布赛程草案 | 已有至少一场比赛 | 创建草案；点击校验；点击发布 | 草案从 `DRAFT` 到 `READY` 到 `PUBLISHED`；页面显示发布版本和发布时间 | 待 E2E |
| P1-ADMIN-006 | 防重复提交 | 任意表单 | 提交过程中连续点击提交按钮 | 按钮禁用并显示提交中，不触发重复 UI 提交 | 待 E2E |
| P1-ADMIN-007 | API 错误展示 | 设置 `VITE_API_BASE_URL` 且 API 返回错误 | 提交任一表单 | 页面展示服务端错误消息、错误码和 requestId，不遮挡主流程 | 待 E2E |
| P1-ADMIN-008 | Mock 模式提示与刷新恢复 | 未设置 `VITE_API_BASE_URL` | 创建数据后刷新浏览器 | 页面清晰标注 Mock 模式；数据从 localStorage 恢复 | 手工覆盖 |

## 命令验证

```powershell
npx pnpm@11.5.2 --filter @xiaoqiu/admin-web typecheck
npx pnpm@11.5.2 --filter @xiaoqiu/admin-web build
```

## 集成备注

- 当前页面通过 `apps/admin-web/src/features/adminSchedule/repository.ts` 封装 API 适配层。
- 设置 `VITE_API_BASE_URL` 时使用 HTTP adapter；未设置时使用浏览器 localStorage mock。
- 正式集成后应将 HTTP adapter endpoint 与 P1 API 分支对齐，并替换为生成 client 或应用侧 wrapper。
