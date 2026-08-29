# P2-SB-12-01 球队名单数据与 API 纵向切片

## 目标

建立可承载真实报名表的最小 P2 数据底座，并提供开发期私有 JSON 导入命令、公开球队/名单读取 API 和后台核对 API。

## 分支

`ai/p2-roster-data-api`

## 独占写入范围

- `prisma/schema.prisma`
- 新增 Prisma migration
- `packages/contracts/` 中本任务新增或修改的球队/名单契约
- `apps/api/src/` 中球队、名单、导入及其必要装配
- `apps/api/package.json` 中本任务命令脚本
- 后端测试和本任务说明

不得修改根 `package.json`、`pnpm-lock.yaml`、Mini Program 或 Admin Web。

## 数据模型基线

至少实现并建立组织隔离、关系、唯一约束和索引：

```text
TeamRegistration
RosterSubmission
RosterEntry
RosterSnapshot
RosterSnapshotEntry（或等价的不可变快照明细）
```

要求：

- `TeamRegistration(tournament_id, team_id)` 唯一。
- `RosterSubmission(team_registration_id, submission_version)` 唯一。
- `RosterEntry(roster_submission_id, player_profile_id)` 唯一。
- `RosterSnapshot(tournament_id, team_id, snapshot_version)` 唯一。
- 锁定快照创建后不得修改成员内容。
- 为 `PlayerProfile(organization_id, source_type, source_key)` 建立符合 V0.2 的唯一约束；姓名绝不作为唯一键。
- 球衣号保存为可空字符串，保留 `01` 等显示形式。
- 联系电话是 Restricted；公开 DTO 永不包含。
- 原始学号不得出现在日志、公开 DTO、测试快照或 AuditLog。可使用规范化后的不可逆匹配键，原值是否持久化必须遵守字段可见性并写测试。

## 开发期私有导入命令

新增命令语义：

```text
pnpm --filter @xiaoqiu/api db:import:registration -- \
  --file <运行时 JSON 路径> \
  --tournament-code <赛事代码> \
  --acknowledge-warnings
```

约束：

- 只在非生产环境运行；生产环境立即拒绝。
- 输入兼容本轮 `schemaVersion: 1` 报名 JSON，源码中不得出现真实路径或真实数据。
- 默认遇到 `ERROR` 拒绝整批导入；有 `WARNING` 时没有显式确认也拒绝。
- 使用来源文件哈希和稳定匹配键保证重复执行幂等。
- 同一学号匹配键跨球队重复时拒绝，不按姓名覆盖。
- 成功后创建/复用 Team、PlayerProfile、已批准 TeamRegistration、锁定 RosterSubmission 和不可变 RosterSnapshot。
- 写 AuditLog；需要异步副作用时同事务写去重 Outbox。
- 控制台只输出批次 ID、球队代码、人数、告警数量和结果，不输出学号、手机号或完整文件路径。

## 冻结 API 契约

```text
GET /api/public/tournaments/{tournamentId}/teams
GET /api/public/tournaments/{tournamentId}/teams/{teamId}
GET /api/admin/tournaments/{tournamentId}/team-registrations
GET /api/admin/tournaments/{tournamentId}/team-registrations/{registrationId}
```

公开列表项至少包含：

```text
id, tournamentId, teamCode, name, shortName,
registrationStatus, rosterStatus, rosterPlayerCount
```

公开详情在列表项基础上增加：

```text
leaderDisplayName nullable
coachDisplayName nullable
rosterSnapshotVersion
players[]: id, displayName, shirtNumber nullable
```

后台核对响应至少包含：

```text
registrationId, teamId, teamCode, teamName,
registrationStatus, rosterStatus, rosterSnapshotVersion,
playerCount, dataQualityStatus, warningCodes,
contactName, contactPhoneMasked
```

后台详情可返回球员公开字段和脱敏学号，但不得返回完整学号。所有查询强制 `organization_id + tournament_id`。

## 兼容与权限

- 修复旧 `GET /api/public/teams/{id}`：只有球队至少属于一个已发布赛事且报名已批准时才可见；不得仅凭组织内 Team 存在就公开。
- 公开名单只来自最新锁定快照，不从当前可编辑名单反推。
- 后台接口沿用开发期 TournamentAdmin 作用域，跨组织/跨赛事返回 403 或 404，语义与现有模块一致。

## 测试与验收

- Prisma migration 静态约束测试。
- 真实 PostgreSQL 集成测试：空库迁移、首次导入、重复导入、同一匹配键跨球队冲突、事务回滚。
- API 测试：未发布赛事不可读、未批准报名不可读、公开响应无 Restricted 字段、后台返回脱敏字段。
- CLI 使用纯虚构 fixture；不得提交真实报名数据。
- OpenAPI 能生成，API 可正常启动。
- `pnpm --filter @xiaoqiu/api typecheck`、`test`、`build` 通过。

## 完成报告

按 `AGENTS.md` 汇报修改文件、验收标准、命令结果、未解决问题、公共文件变更和协调事项，并提交当前分支哈希。

