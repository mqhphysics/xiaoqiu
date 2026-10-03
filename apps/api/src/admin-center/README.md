# 晓球管理中心数据切片

2026-10-03。独占新增 `apps/api/src/admin-center/`；根任务在 AppModule 注册 `AdminCenterModule`。复用现有 AuthService、AccessPolicyService、Prisma 和 IdempotencyRecord，未改变 schema、迁移、公共契约、锁文件和既有业务模块。

所有 `/api/admin/center` 路由只允许当前组织有效的组织/平台管理员。每次读取和写入在事务中复查会话、用户、组织成员和角色。赛事管理员不能借此读取组织级目录。默认用户列表只返回脱敏学号/邮箱及凭据是否存在，永不返回密码材料。

## 端点

| 方法/路径                          | 请求与结果                                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/overview`                    | `{organization:{id,name},counts:{users,teams,players,pendingRosters,pendingReports,openFeedback},checkedAt}`，只数最新待审名单/报告版本                               |
| GET `/users`                       | `page/pageSize/query/status`，status 是 Membership 的 PENDING/ACTIVE/SUSPENDED/LEFT；返回分页目录，含 `membershipUpdatedAt`、脱敏身份、当前角色、关联球员、活跃会话数 |
| POST `/users/:id/membership`       | `{status:ACTIVE                                                                                                                                                       | SUSPENDED,expectedUpdatedAt,reason}`；CAS 来源是 `membershipUpdatedAt`，不是 User 的时间；只修改本组织成员状态；停用同步撤销本组织会话，保护本人和组织/平台管理员 |
| POST `/users/:id/revoke-sessions`  | `{reason}`，返回 `{id,revokedCount}`；不影响其它组织会话；本人的当前会话使用既有 logout                                                                               |
| GET `/teams`、`/players`           | 分页公开档案，包含 `updatedAt`；不返回完整学号或修改报名/锁定名单                                                                                                     |
| PATCH `/teams/:id`、`/players/:id` | `{expectedUpdatedAt,reason,patch}`；稳定 ID 定位、字段白名单、乐观并发与事务审计                                                                                      |
| GET `/posts`                       | 分页，含官方/社区/球队动态及隐藏状态；TEAM 是现有 COMMUNITY+teamId 的展示分类                                                                                         |
| POST `/posts`                      | `{tournamentId,title,body,reason}`；赛事必须为本组织 PUBLISHED，发布 OFFICIAL；确保现有公开首页/资讯流能读取                                                          |
| PATCH `/posts/:id`                 | `{expectedUpdatedAt,reason,patch:{title?,body?,status?:PUBLISHED                                                                                                      | HIDDEN}}`；保留原记录，不物理删除                                                                                                                                 |
| GET `/audit`                       | `page/pageSize/query/action/targetType`；稳定操作人 ID、对象、原因、时间；旧 summary 仅返回版本/状态等安全白名单，省略内容正文、身份、网络和凭据字段                  |
| GET `/media`                       | 分页当前头像/肖像/队徽/帖子封面引用；无物理删除；不冒称具有完整相册清单或实际文件容量                                                                                 |
| GET `/system`                      | 真实数据库连通与当前组织 Outbox 计数/失败码；没有心跳的 Worker 为 UNKNOWN，容量为 UNMEASURED，备份为 UNVERIFIED                                                       |

分页统一返回 `{items,total,page,pageSize}`，默认20条，最多100条。所有写入必带 `Idempotency-Key`（8–128个字母数字或 `_.:-`），相同用户/路由/键与内容重放原成功回执，改变内容返回409；幂等记录、业务写入和审计在同一 Serializable 事务中提交。版本变化返回409，前端需要刷新并重新核对，不能自动覆盖。

球队编辑字段：`name/shortName/collegeName/description/motto/primaryColor/secondaryColor/foundedYear`。球员编辑字段：`displayName/jerseyName/position/secondaryPosition/dominantFoot/heightCm/academicYear/major/hometown/bio/profileColor`。字段可设null清空（name/displayName除外），颜色为 `#RRGGBB`。ID、来源键、学号、头像URL、队伍归属和赛事统计不在白名单；头像继续通过已有媒体API。

## 验证

在独立新库 `xiaoqiu_admin_center_test_20261003_2c42` 部署14个现有迁移；测试代码创建标为 FICTIONAL_TEST 的组织/账号/资料，没有 Seed、迁移或写入日常数据库。测试使用真实 Nest HTTP、AuthService、Prisma/PostgreSQL。

```powershell
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.test.json
node node_modules/eslint/bin/eslint.js apps/api/src/admin-center
git diff --check

# apps/api 目录；TEST_DATABASE_URL 必须是独立可弃测试库
node scripts/copy-prisma-engine.mjs dist/test/generated/prisma
node --test dist/test/admin-center/admin-center.policy.spec.js dist/test/admin-center/admin-center.postgres.integration.spec.js
```

12项通过、0失败、0跳过：默认脱敏、越权与组织隔离、停用保护/其它组织会话保留/全局User状态不变、单用户撤会话、重复与真实并发幂等、版本冲突、编辑白名单、公告公开可见与隐藏保留、审计脱敏、媒体引用及真实/未知系统状态。浏览器共同验收由根任务负责；此切片未启动预览服务、未修改微信、未推送或部署。

正式密码恢复/一次性令牌、角色授予、球员认领/身份更正、私有证据、媒体持久卷/备份/删除策略、Worker心跳等仍需各自服务与契约，不能用演示实名学号恢复、统一密码或假的成功回执代替。

## 安全规程发布增量

`POST /api/admin/center/tournaments/:id/rule-versions` 使用相同组织级授权、事务幂等和审计机制。请求为 `{version,name,rules,reason,expectedVersion}`：version为1–999整数，expectedVersion为当前最大版（无则0），name为1–120字，reason为2–500字，带 `Idempotency-Key`。返回 `{id,organizationId,tournamentId,version,name,status,rules,publishedAt}`，status为PUBLISHED。事务锁定当前组织赛事后检查最新版本和严格递增，只创建新版本，不修改任何旧规则。

服务端调用现有 results/roster/progression 解析器，不接受旧 summary-only 配置。rules顶层仅支持 `results/roster/progression/summary`；完整results和roster是必需项，progression可省略。roster要求人数上下限、带时区截止时间、去重有效球员UUID（最多5000项），可选5/7/8/11人制。非空资格名单必须属于本组织，并是本赛事未撤回/暂停报名球队的ACTIVE成员。晋级来源阶段、组、比赛及目标比赛均核对同组织/同赛事关系；目标必须已有有效stage，来源小组排名不超过实际报名球队数，禁止自引用和循环。它不新增赛制阶段配置或猜测缺失的正式规则。

增量使用另一独立新库 `xiaoqiu_admin_rule_test_20261003_2c42` 部署14迁移、构造FICTIONAL_TEST数据。定向规则HTTP测试8项通过、0失败、0跳过，包括组织级权限、版本CAS、真实并发幂等、审计原因、资格与晋级对象归属、无stage/循环拒绝及旧版本安全重放。原有12项测试和既有业务代码保持不变。两个自建临时库均在检查后删除，未操作根任务测试库或日常库。

```powershell
# apps/api 下，TEST_DATABASE_URL必须为独立可弃库
node --test dist/test/admin-center/admin-center.rules.postgres.integration.spec.js
```

管理中心规程表单应改用这个入口，停用旧summary-only表单。本切片没有改变旧赛程API `/admin/tournaments/:id/rule-versions` 的行为，不能声称其已具有相同审计/幂等保障。

## 已绑定报告的规程发布护栏

当前公共结果读取采用最新规程，已保存报告则固定绑定原规程。本轮未实现显式规程迁移，故安全发布入口在CAS检查后检查本赛事任何 `Match.reportVersion > 0`，存在草稿、退回、提交或确认报告时统一返回409：“赛事已有绑定规程的报告，需完成显式规程迁移评审；此入口暂不允许发布新版本”。拒绝操作不创建规程、幂等成功记录或发布审计。旧成功幂等请求仍在护栏前回放，不能因后来新增报告破坏安全重试。

定向规则测试扩为9项通过、0失败、0跳过。新增场景用真实HTTP提交/批准/锁定双方名单，再保存、提交、退回、保存、提交、确认报告，分别验证新规程发布409、无新增版本/发布审计，旧成功请求继续返回原版。测试使用自建 `xiaoqiu_admin_rule_guard_test_20261003_2c42` 新库、14迁移和FICTIONAL_TEST数据，检查后删除；未触日常库或根任务测试库。schema、results读取语义及公共迁移方案均未改变，迁移处理交集成负责人决策。
