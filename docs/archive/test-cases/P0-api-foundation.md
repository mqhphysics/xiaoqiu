# P0 API 与数据库基础测试

## 自动化用例

| 编号       | 场景                                     | 预期                                                                                     | 自动化位置                                           |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| P0-API-001 | 请求 liveness 并传入合法 `x-request-id`  | HTTP 200，透传 requestId，只判断 API 进程且不访问数据库                                  | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-002 | PostgreSQL 可用时请求 readiness          | HTTP 200，返回数据库状态与耗时                                                           | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-003 | PostgreSQL 不可用时请求 readiness        | HTTP 503，返回 `COMMON.SERVICE_UNAVAILABLE`、requestId 和数据库失败详情                  | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-004 | 提交不合法 DTO                           | HTTP 400，错误码为 `COMMON.VALIDATION_FAILED`，包含 requestId 和字段错误                 | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-005 | 请求不存在的路由                         | HTTP 404，仍使用统一错误结构                                                             | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-006 | 请求 OpenAPI JSON                        | 文档包含 `/api/health/live`、`/api/health/ready` 及 readiness 的 503 响应                | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-007 | 携带 Token、手机号、学号查询参数         | 普通请求日志和异常日志只记录 pathname，不出现参数名、参数值或完整 query string           | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-008 | 检查日志与错误码源码                     | 日志不使用 `originalUrl`；API 使用 contracts 的 `ERROR_CODES`，不存在 API 内错误码注册表 | `apps/api/src/database/schema.spec.ts`               |
| P0-DB-001  | 检查初始迁移                             | 组织成员、幂等记录、Outbox 去重约束及组织外键存在                                        | `apps/api/src/database/schema.spec.ts`               |
| P0-DB-002  | 检查 Outbox V0.2 结构                    | 六态枚举、错误字段、correlation ID 和关键索引完整                                        | `apps/api/src/database/schema.spec.ts`               |
| P0-DB-003  | 在 PostgreSQL 中重复创建相同 slug 的组织 | 第二次写入触发 Prisma `P2002`                                                            | `apps/api/src/database/database.integration.spec.ts` |

`P0-DB-003` 仅在设置 `TEST_DATABASE_URL` 时运行，目标数据库必须已经执行本分支迁移。

## PostgreSQL 验证

```powershell
$env:DATABASE_URL='postgresql://xiaoqiu:xiaoqiu@localhost:5432/xiaoqiu'
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npx pnpm@11.5.2 --filter @xiaoqiu/api db:migrate:deploy
npx pnpm@11.5.2 --filter @xiaoqiu/api db:seed
npx pnpm@11.5.2 --filter @xiaoqiu/api db:seed
npx pnpm@11.5.2 --filter @xiaoqiu/api test
```

重复执行 Seed 后应保持：

- `organizations.slug = xiaoqiu-dev` 只有一条。
- 固定开发管理员只有一条。
- 开发组织与管理员的 Membership、RoleAssignment 各只有一条。
