# P0 API 与数据库基础测试

## 自动化用例

| 编号       | 场景                                     | 预期                                                                     | 自动化位置                                           |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| P0-API-001 | 请求健康检查并传入合法 `x-request-id`    | 响应头和响应体原样透传 requestId，返回 API 与数据库状态                  | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-002 | 提交不合法 DTO                           | HTTP 400，错误码为 `COMMON.VALIDATION_FAILED`，包含 requestId 和字段错误 | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-003 | 请求不存在的路由                         | HTTP 404，仍使用统一错误结构                                             | `apps/api/src/app.e2e.spec.ts`                       |
| P0-API-004 | 请求 OpenAPI JSON                        | `/api/openapi.json` 返回文档并包含健康检查路径                           | `apps/api/src/app.e2e.spec.ts`                       |
| P0-DB-001  | 检查初始迁移                             | 组织成员、幂等记录、Outbox 去重约束及组织外键存在                        | `apps/api/src/database/schema.spec.ts`               |
| P0-DB-002  | 在 PostgreSQL 中重复创建相同 slug 的组织 | 第二次写入触发 Prisma `P2002`                                            | `apps/api/src/database/database.integration.spec.ts` |

`P0-DB-002` 仅在设置 `TEST_DATABASE_URL` 时运行，目标数据库必须已经执行本分支迁移。

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
