# V2 Results Worker：第一段实现与交接

2026-10-02。任务分支 `codex/v2-results-worker`，共同基线 `e282f995bc627830512089f2c2dc9816de43ffb3`。本目录是独立规程计算与报告适配边界，尚未接入正式 API/数据库；`apps/worker/src/outbox` 是已在真实 PostgreSQL 验证的消费核心，正式 Worker 运行接线等待 integrator 的确认版本/事件/投影合同。

## 本段修改范围

- `apps/api/src/results/competition-rules.ts`：内部规则与比赛事实校验、比分/弃权判定。
- `apps/api/src/results/standings.ts`：正式/预览积分、同分小循环比较、晋级截止线检查。
- `apps/api/src/results/knockout.ts`：单场淘汰赛胜者、点球/弃权与未决结果。
- `apps/api/src/results/report-adapter.ts`：报告状态与赛果的显式适配。
- 本目录的专属测试、独立类型检查配置及本报告。
- `apps/worker/src/outbox/`：PostgreSQL 消费存储、有限并发消费器、服务级及独立数据库测试。
- `apps/worker/package.json` / `tsconfig.build.json`：实际测试命令、生产构建排除集成测试；没有新增依赖。

schema、迁移、contracts、API Client、根配置、锁文件、API app.module、experience.service/controller/dto、前端均未修改。

## 已实现的行为

1. `OFFICIAL` 只纳入 `CONFIRMED`，`PREVIEW` 可以纳入进行中/待审并标记暂定。提交、退回、草稿不自动成为正式赛果。`ABANDONED` 映射为 `VOID`，不计算积分、不自动晋级；不推定双方弃权。
2. 比赛比分包含加时，点球大战比分单独保存。点球决定单场淘汰赛胜者，不增加比赛进球。规则依据：[IFAB Law 10](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/)。是否加时、同分排序、弃权判罚仍由具体赛事规程显式提供。
3. 积分、同分比较顺序、同分队之间小循环的比较维度与是否重新比较剩余队伍均为必传参数。没有姓名决胜；完全相同时并列，稳定 ID 仅决定展示顺序。
4. 晋级截止线穿过并列队伍、阶段未完成、暂定榜单均阻止自动选择；选出晋级集合不表示已经决定种子位顺序或持久化晋级。
5. 弃权使用显式判罚比分/积分；双方弃权要求独立规则，淘汰赛仍须管理员裁定。不伪造球员进球或助攻。
6. 组织/赛事/阶段/小组不匹配、组外球队、同队比赛、重复比赛 ID、无比分/非法比分、未决/不完整点球都会拒绝。更正从最新事实快照重算，不累计旧版本。
7. Outbox 使用数据库时钟及 `FOR UPDATE SKIP LOCKED` 原子领取；只领取已注册 topic，一次只领取当前空闲执行槽可处理的任务。[PostgreSQL SELECT 文档](https://www.postgresql.org/docs/current/sql-select.html)明确将 SKIP LOCKED 用于多个消费者的队列场景；它不是普通一致性查询方式。
8. 每次领取生成新 token，并以 token、attemptCount 和未过期租约限制成功/失败写入。Handler 的数据库副作用与 SUCCEEDED 同事务；失败或提交前租约失效均回滚副作用。
9. 有限并发、重叠 tick 去重、停止等待在途事务；指数退避加抖动、最大尝试次数、过期租约回收和永久失败。仅存受限错误代码，不存可能包含个人资料或凭据的异常消息。
10. lease/retry/事务时长严格限制到 PostgreSQL int4 / Node timer 范围，超过 `2147483647` 在发 SQL 前拒绝。

## 验证命令与边界

```powershell
node node_modules/typescript/bin/tsc -p apps/api/src/results/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/worker/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js apps/api/src/results apps/worker/src/outbox
node apps/worker/node_modules/tsx/dist/cli.mjs --test apps/api/src/results/competition-rules.spec.ts apps/worker/src/outbox/outbox-consumer.spec.ts
node node_modules/typescript/bin/tsc -p apps/worker/tsconfig.build.json

# apps/worker/ 下，必须提供独立测试库；可使用 integrator 已生成的 Prisma client。
# TEST_DATABASE_URL 只接受 xiaoqiu_results_test_*，不能等于 DATABASE_URL。
# WORKER_TEST_PRISMA_CLIENT 可指向已生成的 client.js，仅用于测试。
pnpm test:postgres
```

本轮数据库：`xiaoqiu_results_test_20261002_32c0`；部署现有 12 个迁移，不执行 Seed，不使用日常 `xiaoqiu` 或其他 worker 测试库。测试资料标为 `FICTIONAL_TEST`，随机 ID / topic；清理仅针对本测试生成的 ID。测试库中额外的 `results_worker_test_effects` 是副作用计数 fixture，不是新增生产模型。

真实数据库检查覆盖并发领取、到期重领、旧租约拒绝、Handler 回滚、延期重试、次数耗尽、永久错误、取消/成功/未来任务排除与组织缺失拒绝。服务级可控故障测试与 PostgreSQL 证明分别保留。

最终验证：规则纯函数/适配测试 26 项、消费器可控故障测试 7 项通过；PostgreSQL 包括 11 个真实场景，Node 测试报告 12 项通过（包含外层测试）。合计 Node 报告 45 项通过、0 失败、0 跳过。另有真实子进程在领取后直接退出、两个全新进程恢复/再次运行仍只提交一次数据库副作用的验证。类型检查、Worker 构建、范围 ESLint、Prettier 与 diff 检查通过。

数据库消费核心通过不表示报告 HTTP、公开页面一致性、完整 Worker 运行链路、网站并发承载或生产部署已完成。

## 未解决问题与集成协调

- **报告确认版本**：请提供持久化的最后确认版本及更正/撤销语义。新建更正草稿或退回报告不应替换最后已确认事实；`report-adapter` 是内部输入，不替代公共契约。
- **结果事件**：请统一 Outbox topic/eventType、组织/赛事/比赛标识、确认版本、规则版本、事件版本和幂等键。token fencing 只防同一 job 重领；不同旧 job 仍需业务 revision fencing。
- **投影并发**：应按组织+赛事串行重算/提交，读取当前确认快照并拒绝旧版本覆盖；结果、榜单/统计、晋级预览和投影版本必须原子更新。重复不同 job 的同一确认事件也须无重复副作用。
- **晋级冲突**：规则确定只能生成预览。结果更正改变晋级人选时，已锁定名单/已开赛下游场次不得自动换队，交给集成确定管理员复核状态及审计。
- **规程解析**：真实 JSON 解析、赛事/阶段绑定和最终同分裁定由 integrator 固定。当前测试规程均为虚构，不是校园赛事已批准规则。未实现两回合总比分、客场进球、公平竞赛分、抽签或处罚撤队规则；不默认推测。
- **公开读取**：experience.service/controller/dto 属于 auth worker；integrator 负责结果接线。旧 calculateStandings 和公开接口尚未切换，不能把新核心测试算作页面修复。
- **Worker 运行时**：需要正式 SQL adapter/连接池依赖和 lifecycle/provider 接线。数据库事务 Handler 只能通过同一 tx 写入；外部邮件/HTTP/文件副作用不能靠此事务保证 exactly-once，须另用 Outbox。测试用的 Prisma adapter 不作为正式运行依赖。
- **共享纯规则**：API 与 Worker 的构建/镜像应共同使用一个规则实现；需要 integrator 决定共享包及依赖安排，避免跨 app 随意导入或复制规则。

## 公共文件建议

由 integrator 独占处理：确认版本/投影/晋级预览模型和约束、contracts、生成 Client、新模块接线、必要索引与统一依赖安装/锁文件。初始迁移已创建 `outbox_jobs_deduplication_key_key`，对非空 deduplicationKey 提供全局 partial UNIQUE；Prisma schema 未表达该索引不代表数据库没有约束。本报告此前误称无约束，现已核实迁移并更正，不增加重复索引。大量读取还需独立验收查询计划、分页/索引、投影滞后及网站负载；本段没有声称完成容量测试。

## 第二段接口准备（RESULTS-CONTRACT-01）

第一段提交：`2e40e1af38d1057b404fc5085bcffe2f8ce883bb`。

按 integrator 的合同预告新增：

- `apps/worker/src/outbox/pg-sql-client.ts`：Pool 的同 client 事务适配器，连接取得后有总时限和数据库 statement/lock/idle 时限；超时销毁连接，拒绝迟到 Handler 再发 SQL。依据 [node-postgres 事务文档](https://node-postgres.com/features/transactions)及 [Pool 文档](https://node-postgres.com/apis/pool)。等待统一 pg 安装后做真实 Pool 测试及生产运行接线；现有 PostgreSQL Outbox 测试仍用测试专属 Prisma adapter。
- `apps/worker/src/results/match-report-handler.ts`：严格解析已分配 `match.report / MatchReportConfirmed` 事件，验证组织与 aggregateId；持有 Match 锁读取当前 confirmedReportVersion，旧版本无害退出、未来版本重试、最新事件须匹配不可变确认 revision/规程版本。Repository 是待接生产 SQL 的接口，当前受控测试不冒充持久化实现。
- `apps/api/src/results/progression-source.ts`：来源 hash 包含组织/赛事/阶段/规程、参赛队伍与分组，以及全部来源阶段场次的确认版本、双方队伍及小组。无确认报告的场次也纳入（version=0）；更正、增加场次、尚未比赛的新增队伍、换队/换组都能使旧预览失效。尚未作为公开 API 接入。
- 对应专属测试及 Worker test 命令扩展；不新增依赖、不改共享文件。

尚待：integrator 提供模型/迁移提交与可用 pg 路径、projection.payload 的具体语义、晋级端点与正式权限复用入口。收到后接生产 SQL repository、Worker lifecycle 与 results API；正式读取由 integrator 接 Experience。

第二段定向检查：新增 13 项纯函数/受控生命周期及事件测试通过；当前完整定向单元集为 46 项通过，另有第一段真实 PostgreSQL 12 项通过。results/Worker 类型检查、Worker 构建、覆盖新目录的 ESLint、Prettier、diff 检查全部通过。未安装 pg 的阶段不把结构接口/受控 Pool 测试称为真实 pg 运行验证。

```powershell
node apps/worker/node_modules/tsx/dist/cli.mjs --test apps/api/src/results/competition-rules.spec.ts apps/api/src/results/progression-source.spec.ts apps/worker/src/outbox/outbox-consumer.spec.ts apps/worker/src/outbox/pg-sql-client.spec.ts apps/worker/src/results/match-report-handler.spec.ts
node node_modules/eslint/bin/eslint.js apps/api/src/results apps/worker/src/outbox apps/worker/src/results
```

## SQL repository 准备边界

根据 integrator 的可读模型草案补充 `apps/worker/src/results/postgres-projection-repository.ts`：组织范围查询、锁定 Match、读取对应不可变确认 revision，以及 INSERT/ON CONFLICT 的 sourceReportVersion 条件更新。写入语句同时锁定并验证最新确认指针、revision 的组织/比赛/版本/状态/规则版本；重复同一版本不更新，低版本不覆盖高版本。payload builder 为必传函数，默认不复制报告 notes 等受限内容。未确认的 Match.confirmedReportVersion 为 null 时 Handler 等待确认，不产生投影。

这部分目前只通过类型、构建、范围静态检查，以及 Handler 对 null 确认指针的受控回归；**未在新增生产表的正式迁移上验证 SQL，也未安装/验证 pg Pool 或启动正式消费**。当前 integrator 分支尚无包含新模型/迁移的稳定提交；待其交付后继续真实数据库验证。不得将第一段 Outbox 表测试结果套用到新增结果投影表。
