# V2 结果与 Worker 交付

2026-10-02。分支 `codex/v2-results-worker`，共同基线 `5612e776b13d05094f311e3264fa41c00de310a9`。稳定代码提交 `19e1e86630f9e8f79c76bf0bc8a2b9603f3c69e3` 已直接交给 Integrator 3；本报告更新只补文档。

## 已完成与修改文件

- `apps/api/src/results/`：显式规程解析、积分/同分/点球/弃权计算、最新确认事实读取、晋级来源 hash、ResultsService/Controller/DTO/Module 及专属测试。
- `apps/worker/src/outbox/`：原子领取、租约 token/尝试次数保护、同连接事务、重试/永久失败、有限并发、超时回滚、进程恢复及专属测试。
- `apps/worker/src/results/`：确认版本与固定上下文检查、安全赛果投影、已存在站内通知的幂等回执。
- `apps/worker/src/worker-runtime.ts`、`worker.service.ts`：实际 pg Pool 消费生命周期、启动检查、停止等待在途事务及关闭连接。
- `apps/worker/package.json`、`tsconfig.build.json`：显式测试入口，生产构建排除测试 helper。

本任务没有改 schema/迁移、contracts、生成 API Client、根配置/锁文件、API app.module、Experience、前端或微信文件。Prisma Client 在自己工作树生成，仅作为忽略的构建依赖；pg 及类型依赖版本来自 Integrator 的共同基线，未重新安装或升级。

## 已满足的验收行为

1. 正式积分只纳入确认事实；进行中/待审数据使用单独的 PREVIEW 计算。没有确认版本时不把 FINISHED 推定成已审核。
2. `rules.results` 必须显式提供积分、同分比较、小循环重新比较、点球与弃权政策；未知/缺失规程拒绝计算。完全同分保留并列，球队名称不决定晋级。
3. 点球大战独立于普通比分/进球。绑定规程的弃权判罚须与已确认报告一致，不推定默认 3:0、不修改历史 ruleVersionId；ABANDONED 为 VOID，不计积分或自动晋级。点球依据见 [IFAB Law 10](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/)。
4. 每条事实的确认版本与计算规程一致；规则版本变化不追溯重解释旧比分，明确阻止并要求核查。
5. 按报告分支的真实 `_matchContext` 验证组织、比赛、赛事、stage/group/round ID、双方球队、scheduledStartAt 九个字段；变化拒绝投影及晋级，不把旧内容套入新比赛。
6. 投影只存安全 ResultFact 与 ruleVersionId；不存原始 fields、notes、操作者或冻结内部字段。公开读取从当前不可变确认行重建，缓存缺失/落后不返回旧赛果；只读同组织、ACTIVE 组织的 PUBLISHED 赛事。
7. Worker 只领取已注册 topic，使用数据库时钟及 SKIP LOCKED、每次领取的新 token、尝试次数及有效租约。Handler 副作用与 SUCCEEDED 同一 pg client 事务；失败、提交前过期或总超时均回滚。参见 [node-postgres 事务文档](https://node-postgres.com/features/transactions)。
8. 同一 job 重领有租约保护；不同旧 revision job 不能覆盖当前确认版。重试有抖动、次数上限及永久失败，异常消息不落库，安全错误代码保留。
9. `match.report.notification` 回执核对已经存在的 revision、通知 ID、接收人、组织、metadata/type/dedup；不重复创建通知、不重置已读。合法空收件人列表可以确认回执，不声称存在外部推送。
10. 晋级用明确的 `rules.progression` 来源/目标映射。GROUP_RANK 要求对应来源组比赛确认；同一 KNOCKOUT Stage 内 MATCH_WINNER/LOSER 只要求显式来源比赛完成，未来轮次不阻塞当前推进。
11. 确认前重算来源 hash，纳入规程、确认版本（含未确认 version0）、参赛队/分组及来源对阵。并列未决、来源变化、同队对阵/重复晋级人选、目标已开赛/有报告/绑定阵容均拒绝新确认。事务更新签位、CAS、不可变历史、角色快照审计和 Outbox。
12. 相同 key/内容的历史成功回执先回放，不重新改队；后来的来源更正、目标 LIVE/报告/阵容或上下文变化不破坏回执。不同内容 409，新 key 严格检查当前 hash/version/目标。

## API 与模型影响

新增端点：

- `GET /api/public/tournaments/:id/results`
- `POST /api/admin/tournaments/:id/progression/preview`：`{ruleVersionId}`
- `POST /api/admin/tournaments/:id/progression/confirm`：`{ruleVersionId,expectedVersion,sourceHash,reason}` 与 `Idempotency-Key`

管理服务使用 fresh AuthService 会话和 `requireTournamentAdministrator`；不以客户端角色头授权。ResultsModule 导出 ResultsService，最终 AppModule/Experience 及共同只读事务接线由 Integrator 负责。

消费 topic 为 `match.report / MatchReportConfirmed` 和 `match.report.notification / MatchReportNotificationCreated`。确认晋级另产 `tournament.progression / TournamentProgressionConfirmed`；它和其它未注册 topic 保留队列，未伪造消费成功。

初始迁移已具有 `outbox_jobs_deduplication_key_key`：非空 deduplicationKey 的全局 partial UNIQUE。此前报告只看 Prisma schema 而误称无约束，已查迁移纠正；没有加重复索引。

## 命令与实际结果

Node 报告：**54 项定向单元、13 项真实 pg Pool/Outbox、14 项真实 Auth/Results HTTP 与生产 Worker 生命周期通过；合计 81 项通过、0 失败、0 跳过**。两个 PostgreSQL 报告包含外层测试；实际场景分别为 12、13 个。API/Worker 类型检查、API 测试编译、Worker 构建、范围 ESLint、格式和 diff 检查通过。

```powershell
# 仓库根目录；Prisma Client 只生成在当前工作树
node apps/api/node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/worker/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/worker/tsconfig.build.json
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.test.json
node node_modules/eslint/bin/eslint.js apps/api/src/results apps/worker/src
git diff --check

# apps/api/ 下：复制自己的引擎后执行实际 HTTP/Worker 测试
node scripts/copy-prisma-engine.mjs dist/test/generated/prisma
node --test dist/test/results/results.postgres.integration.spec.js

# apps/worker/ 下：测试库必须是独立可弃库
pnpm test
pnpm test:postgres
```

Worker 当前准确脚本：

```text
test = tsx --test src/outbox/outbox-consumer.spec.ts src/outbox/pg-sql-client.spec.ts src/results/match-report-handler.spec.ts src/results/projection-payload.spec.ts
test:postgres = tsx --test src/outbox/outbox.postgres.integration.ts
```

API PG 测试加载实际 Worker dist，清洁 checkout 必须先 build Worker。`TEST_DATABASE_URL` 必须指向可弃测试库；Worker fixture loader 可用 `WORKER_TEST_PRISMA_CLIENT` 指向**当前树**的 `apps/api/dist/test/generated/prisma/client.js`，不共用主目录 generated 源码。正常安装后 pg 从本包解析；`WORKER_TEST_PG_MODULE` 仅用于测试依赖路径。

本轮测试库 `xiaoqiu_results_test_20261002_32c0`：部署共同基线全部 13 个迁移，不 Seed、不测试日常库。规程/账号/比赛是明确的 FICTIONAL_TEST；结果 fixture 直接构造确认行，用来验证本模块，不替代报告写入业务验收。锁定快照与不可变历史保留到测试库整体弃置，不绕保护删除。

## 未做、公共建议与集成协调

- Integrator 接 AppModule/Experience，生成 API Client，并补 API pretest 的 Worker 构建顺序；共用当前 RepeatableRead 事务的只读 adapter 由其处理。不要把本模块独立 HTTP 验收称为主网站已接通。
- 正式报告/名单整轮、多角色 H5 浏览器、实际校园规程、生产部署、容量/压力测试、微信真机由对应任务/后续验收完成；本任务未做这些。
- `playedAt` 使用排期时间；无排期时确认行创建时间用于排序，不冒称实际开球记录。真实资料的赛程完整性仍须验收。
- 两回合总比分、客场进球、公平竞赛分/抽签、处罚撤队等未实现；配置不能静默冒充已支持。
- 未注册 topic 的处理、失败告警/管理员重放、外部推送及生产监控属于后续运营接线。站内通知存在与回执成功不等于本人已看见。
- Public model、发布规程冻结、依赖/锁文件和根接线继续由 Integrator 独占；本任务没有额外公共文件变更要求，没有 Push 或部署。
