# P1-SB-11-01 API 赛事与赛程纵向切片

## 目标

完成 P1 第一个纵向切片的后端基础：管理员可通过 API 创建赛季、赛事、规则版本、球队、场地、比赛和赛程草案，并发布赛程；普通只读 API 可读取已发布赛事、赛程、球队和比赛详情。

本任务不实现真实登录、微信身份、报名名单、比分录入、榜单和自动最优排期。

## 分支

`ai/p1-api-schedule`

## 写入范围

- `prisma/schema.prisma`
- `prisma/migrations/**`
- `apps/api/src/**`
- `packages/contracts/src/**`
- `docs/test-cases/P1-api-schedule-slice.md`

本任务明确授权修改上述公共文件；不得修改 `pnpm-lock.yaml`。

## 禁止修改范围

- `apps/admin-web/**`
- `apps/mini-program/**`
- `packages/api-client/**`
- `infra/**`
- `.github/**`
- 其他 Agent 的任务文件

## 前置依赖

- P0 已合入 `main`。
- CI 已通过。
- PostgreSQL、Prisma、统一错误响应、requestId、AuditLog、OutboxJob 已存在。

## 必做内容

1. 数据模型
   - `Season`
   - `Tournament`
   - `CompetitionRuleVersion`
   - `Stage`
   - `TournamentGroup`
   - `CompetitionRound`
   - `Team`
   - `PlayerProfile` 的最小只读档案字段
   - `Venue`
   - `Match`
   - `SchedulePlan`
   - `ScheduleRevision`
   - 必要枚举与关系

2. 数据约束
   - 所有业务主表直接包含 `organization_id` 或可强制追溯组织。
   - `Season.organization_id + season_code` 唯一。
   - `Tournament.organization_id + tournament_code` 唯一。
   - `CompetitionRuleVersion.tournament_id + version` 唯一。
   - `Team.organization_id + team_code` 唯一。
   - `Venue.organization_id + venue_code` 唯一。
   - 发布后的 `CompetitionRuleVersion` 和 `ScheduleRevision` 不允许原地覆盖。

3. API
   - `POST /api/admin/seasons`
   - `POST /api/admin/tournaments`
   - `POST /api/admin/tournaments/{id}/rule-versions`
   - `POST /api/admin/tournaments/{id}/teams`
   - `POST /api/admin/venues`
   - `POST /api/admin/tournaments/{id}/matches`
   - `POST /api/admin/schedule-plans`
   - `POST /api/admin/schedule-plans/{id}/validate`
   - `POST /api/admin/schedule-plans/{id}/publish`
   - `GET /api/public/tournaments`
   - `GET /api/public/tournaments/{id}`
   - `GET /api/public/tournaments/{id}/schedule`
   - `GET /api/public/matches/{id}`
   - `GET /api/public/teams/{id}`

4. 管理端临时权限
   - 不做真实账号体系。
   - 使用明确的开发期请求头，例如 `x-dev-role: TOURNAMENT_ADMIN` 和 `x-dev-organization-id`。
   - 未提供或角色不对时返回统一 403。
   - 在代码和测试中明确标记为 P1 开发期机制。

5. 发布语义
   - 发布命令进入 Application Service。
   - 发布命令必须写 `AuditLog`。
   - 发布命令必须在同一事务写 `OutboxJob`。
   - 发布后普通只读接口只能读取已发布赛程。
   - 若重复发布同一草案，应返回明确错误，不静默覆盖。

6. Contracts
   - 在 `packages/contracts/src/**` 注册 DTO、枚举、错误码和只读 ViewModel。
   - 后端 DTO/OpenAPI 与 contracts 命名保持一致。
   - 不手写 `packages/api-client`。

## 完成标准

- 空数据库可以迁移。
- Seed 后存在默认组织和可用于 P1 的开发管理员上下文。
- API 集成测试覆盖：
  - 创建赛季、赛事、规则版本。
  - 创建两支球队、一个场地、一场比赛。
  - 创建赛程草案并发布。
  - 发布写入 `AuditLog` 和 `OutboxJob`。
  - 普通只读 API 可读取已发布赛事和赛程。
  - 跨组织读取后台数据返回 403 或 404。
  - 未发布赛程不会出现在 public schedule。
- OpenAPI 包含新增路径。
- `pnpm --filter @xiaoqiu/api test` 通过。
- `pnpm --filter @xiaoqiu/api build` 通过。

## 测试命令

```powershell
$env:DATABASE_URL="postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu"
$env:TEST_DATABASE_URL="postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu"
npx pnpm@11.5.2 --filter @xiaoqiu/api db:migrate:deploy
npx pnpm@11.5.2 --filter @xiaoqiu/api db:seed
npx pnpm@11.5.2 --filter @xiaoqiu/api test
npx pnpm@11.5.2 --filter @xiaoqiu/api build
```

## 风险

- Prisma schema 一次扩张过大。
- 发布版本和草案状态混用。
- 开发期权限误被当作真实权限。
- contracts 与 OpenAPI 命名漂移。

## 完成报告

按 `AGENTS.md` 完成报告格式输出，并额外列出：

- 新增数据库表和关键唯一约束。
- 新增 API 路径。
- 新增错误码。
- 是否修改了公共 contracts。
