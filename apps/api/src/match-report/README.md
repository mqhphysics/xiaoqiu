# V2 比赛报告交接

2026-10-02。依据 `docs/tasks/V2-03-比赛报告与审核.md`、公共工作流契约以及用户的录入交互要求实现。

已实现信息员入口、三步录入、取消确认、保存前比较、只读历史与历史带入草稿；只有显式保存、提交或审核动作追加服务器版本。本机输入草稿不属于历史版本。

## 提交与文件

共同基线：`5612e776b13d05094f311e3264fa41c00de310a9`。

仅 API 稳定提交：`4b678c14552468142c6c41a545901203aa6156cb`，分支 `codex/v2-match-report-api-release`。集成者可以直接 cherry-pick，不携带早期 H5 WIP；H5 与本文随后单独提交。

后端文件：

- `apps/api/src/match-report/match-report.controller.ts`
- `apps/api/src/match-report/match-report.dto.ts`
- `apps/api/src/match-report/match-report.module.ts`
- `apps/api/src/match-report/match-report.service.ts`
- `apps/api/src/match-report/match-report.logic.ts`
- `apps/api/src/match-report/match-report.logic.spec.ts`
- `apps/api/src/match-report/match-report.postgres.integration.spec.ts`
- `apps/api/src/match-report/README.md`

H5 文件：

- `apps/mini-program/src/features/match-report/MatchReportEntry.h5.tsx`
- `apps/mini-program/src/features/match-report/MatchReportEntry.tsx`：微信无新增入口，返回 null。
- `apps/mini-program/src/features/match-report/MatchReportWorkspace.tsx`
- `apps/mini-program/src/features/match-report/ReportButton.tsx`
- `apps/mini-program/src/features/match-report/types.ts`
- `apps/mini-program/src/features/match-report/logic.ts`
- `apps/mini-program/src/features/match-report/logic.test.ts`
- `apps/mini-program/src/features/match-report/repository.ts`
- `apps/mini-program/src/features/match-report/draft.repository.ts`
- `apps/mini-program/src/features/match-report/index.scss`
- `apps/mini-program/src/pages/quick-report/index.h5.tsx`
- `apps/mini-program/src/pages/readonly-match-detail/index.tsx`：仅增加平台专属入口组件。

原共享 `quick-report/index.tsx`、`index.config.ts` 与共同基线相同。未修改微信功能、公共导航/首页/登录、schema/迁移、contracts、API Client、根配置或依赖锁；公共文件只通过 Integrator 授权的共同基线吸收。

## 验收标准

- 分数支持明确填写、加减与填写 0 : 0，空值不会自动变成有效赛果。
- 进球、助攻、乌龙球、红黄牌、换人选择本场固定锁定名单中的稳定球员 ID；号码保持字符串。
- 比分与普通进球明细核对；未补齐可保存，提交需一致。点球分开校验与展示。
- 修改已有内容需要原因，核对页显示例如 `2 : 1 → 1 : 1`；历史预览不覆盖当前草稿，带入旧版需明确选择。
- 取消可选择继续录入或丢弃未保存修改；丢弃清除该组织/账号/比赛本机草稿，保留已保存版本。
- SAVE/SUBMIT 不修改正式事实。RETURN/CONFIRM 复制旧内容与上下文，不接受审核请求偷换 fields。
- CORRECT 追加草稿；旧确认比分与事件保留至新 CONFIRM。
- CAS 防覆盖；同账号/比赛的相同 clientActionId 与相同内容重放原结果，不重复版本、通知、审计或 Outbox；内容不同返回 409。
- 不确定网络响应会保留原命令与原键，跨页面恢复后核对同一次保存。重新读取当前 head，防重放旧响应成为新编辑基线。
- 权限使用正式 AuthService 与 AccessPolicyService，事务内刷新成员/角色并做对象检查。
- 固定名单、规程与私有 `_matchContext` 留存。对阵/阶段/分组/开赛时间改变，workspace/write 返回 409；history 仍按原赛事、原队伍读取完整冻结名单。
- CONFIRM 把版本、官方 Match、服务器 UUID MatchEvent、审计、站内通知与 Outbox 放在同一事务。
- ABANDONED 确认为 CANCELLED，官方比分为空、正式事件清除；旧 appearance 历史保留，VOID 公开统计过滤由 Integrator/results 接线负责。
- 弃权确认只读取绑定 `rules.results.forfeit`，无有效判罚或输入比分不一致时拒绝；不默认判罚比分。

## 已执行命令与证据

采用现有依赖的直接可执行文件，避免 pnpm 自动安装检查重建共享 node_modules；未安装依赖或自行更新锁文件。

```powershell
# 仓库根
node node_modules/typescript/bin/tsc -p apps/mini-program/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js apps/api/src/match-report apps/mini-program/src/features/match-report apps/mini-program/src/pages/quick-report/index.h5.tsx
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --experimental-strip-types apps/mini-program/src/features/match-report/logic.test.ts

# apps/api，DATABASE_URL/TEST_DATABASE_URL 必须分别指定日常与独立测试库
node node_modules/prisma/build/index.js generate --schema ../../prisma/schema.prisma
node node_modules/prisma/build/index.js migrate deploy --schema ../../prisma/schema.prisma
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node ../../node_modules/typescript/bin/tsc -p tsconfig.test.json
node scripts/copy-prisma-engine.mjs dist/test/generated/prisma
node --test dist/test/match-report/match-report.logic.spec.js dist/test/match-report/match-report.postgres.integration.spec.js

# apps/mini-program
node node_modules/@tarojs/cli/bin/taro build --type h5
```

结果：前端 15 项通过；后端 24 项通过，0 失败、0 跳过。后端含 9 项规则/状态纯逻辑、14 个真实 PG/HTTP 子场景及父测试。API/前端类型检查、定向 ESLint、H5 构建通过；H5 有资源体积警告。

独立测试库 `xiaoqiu_match_report_test_20261002_ddbce65f` 部署 13 个迁移。没有写入、迁移或 Seed 日常库。fixture 明示 `FICTIONAL_TEST`，表示虚构输入驱动真实程序，不是实际校园比赛记录。

真实 H5 证据使用临时 API `127.0.0.1:3007` 与该测试库，完全没有 API 拦截：确认 v9（1 : 1）→ 管理员修正草稿 v10（2 : 1）→ 信息员提交 v11 → 管理员确认 v12。直到 v12 才改变正式赛果；旧 v1 与 v9 可比较；390px 无横向溢出。取消验收证明继续录入保留输入，放弃改动清除本地草稿、服务器版本及正式赛果不变。

浏览器证据目录：`C:/Users/Mu Qinghan/.codex/visualizations/2026/10/01/01a0f869-c292-7083-b0e4-aca06d205543/`：

- `report-real-api-evidence.json`
- `report-real-cancel-evidence.json`
- `report-real-api-history.png`
- `report-real-api-correction-draft.png`
- `report-real-api-submitted.png`
- `report-real-api-confirmed.png`
- `report-real-api-mobile.png`

早期 `browser-qa.py` 使用明确模拟接口，只作为客户端网络恢复/差异/布局证据；它不替代以上真实 API、真实 PostgreSQL 结果。

## 事件对齐

确认事件：topic=`match.report`，eventType=`MatchReportConfirmed`，dedup=`match-report-confirmed:<matchId>:<version>`。payload 含 revisionId、组织/比赛/赛事、reportVersion、confirmedReportVersion、previousConfirmedReportVersion、双方名单 ID、ruleVersionId。

通知回执：topic=`match.report.notification`，eventType=`MatchReportNotificationCreated`，dedup=`match-report-notification:<revisionId>`。payload 含组织/比赛/赛事、revisionId、reportVersion、recipientUserIds、notificationIds、action。站内 UserNotification 已实际写入，通知 dedup=`match-report:<revisionId>:<recipientUserId>`。Worker 回执核验不代表外部推送。

已通过真实独立聊天向 results 负责人交付精确 shape 并收到确认：他实现当前确认版 fencing、私有上下文比对和现有通知幂等 ack，不新建或重置已读。本模块未自行合并其他 worker 分支。

## 未解决事项与公共文件建议

- Integrator 仍需在 `apps/api/src/app.module.ts` 接入 `MatchReportModule`，再运行完整 AppModule、多角色工作流与公开统计/晋级验收。
- 已发布规程原地修改的数据库保护由 Integrator 实现；本任务不改 schema/迁移。
- 不同规程的整轮迁移/重新裁定由 Integrator/results 统一；本模块禁止悄悄替换已有报告绑定的规程和名单。
- 实测基于独立虚构 fixture；生产部署、真实赛事规则、微信开发者工具/真机、外部通知和并发压测未做。
- 无新增依赖、无公共契约源码或 API Client 变更建议；只有上述 AppModule 接线和整体结果读取协调。

未 Push、未部署。临时服务和测试库清理状态在最终交付记录中说明。
