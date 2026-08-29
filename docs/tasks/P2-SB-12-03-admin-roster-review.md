# P2-SB-12-03 后台球队与名单核对

## 目标

在现有管理后台增加“球队与名单”核对工作区，让管理员能查看导入后的报名、人数、数据质量告警和锁定快照，但本轮不实现通用 DOCX 上传器。

## 分支

`ai/p2-admin-roster-review`

## 独占写入范围

- `apps/admin-web/`
- 该应用内测试和说明

不得修改 API、Prisma、contracts、Mini Program、根配置或 `pnpm-lock.yaml`。

## 冻结 API

```text
GET /api/admin/tournaments/{tournamentId}/team-registrations
GET /api/admin/tournaments/{tournamentId}/team-registrations/{registrationId}
```

字段以 `P2-SB-12-01-roster-data-api.md` 为准。

## 功能

- 在后台导航中加入“球队与名单”。
- 选择赛事后展示球队、报名状态、名单状态、人数、快照版本和数据质量状态。
- 支持按球队名/代码过滤，并可筛选“有告警”“未锁定”“已锁定”。
- 详情显示公开球员字段、脱敏学号、球衣号、告警代码和导入摘要。
- 联系电话只显示后端提供的脱敏值；前端不得自行假设拿到了完整手机号。
- 明确区分加载、空、失败、403 和重试状态。
- API 模式失败不得静默退回 Mock；Mock 数据仅用虚构身份并显示开发标识。
- 不加入“直接改数据库”“绕过状态机锁定名单”等按钮。

## 交互要求

- 管理后台保持安静、密集、适合扫描；不制作营销 Hero，不堆叠卡片。
- 使用表格/列表承载可比较记录，详情使用未嵌套的面板或抽屉。
- 小于 1024px 时列表仍可读，长姓名和告警代码不覆盖其他字段。
- 高风险状态只展示事实，本轮没有后端命令时按钮应缺席而不是伪造成功。

## 验收

- API adapter 路径、Header、字段名与冻结契约一致。
- 真实 API 模式可读取列表和详情。
- Mock/API 模式清楚分离。
- 核心筛选和映射逻辑有测试。
- `pnpm --filter @xiaoqiu/admin-web typecheck`、`test`、`build` 通过。

## 完成报告

按 `AGENTS.md` 汇报修改文件、验收标准、命令结果、未解决问题、公共文件变更建议和协调事项，并提交当前分支哈希。

