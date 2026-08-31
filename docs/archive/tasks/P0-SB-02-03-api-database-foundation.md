# P0-SB-02/03 数据库与 API 基础

## 状态

Ready

## 分支

`ai/p0-api-database`

## 独占写入范围

```text
apps/api/**
prisma/**
packages/contracts/**
tests/fixtures/**
docs/test-cases/P0-api-foundation.md
```

本任务明确授权修改 `prisma/**` 和 `packages/contracts/**`。不得修改 `apps/worker/**`、`apps/mini-program/**`、`apps/admin-web/**`、`packages/api-client/**`、根配置和 `pnpm-lock.yaml`。

## 目标

建立可迁移、可种子化、带组织隔离约束的首批数据库模型，并完成 NestJS 公共 API 基础能力。

## 工作内容

1. 在 Prisma 中实现首批基础模型：
   - `Organization`
   - `User`
   - `OrganizationMembership`
   - `WechatIdentity`
   - `UserSession`
   - `RoleAssignment`
   - `AuditLog`
   - `IdempotencyRecord`
   - `OutboxJob` 基础表结构
2. 使用明确物理表名，例如 `app_users`，并补齐唯一约束、组织隔离字段和关键索引。
3. 生成初始迁移，提供可重复执行的最小开发种子数据。
4. 在 API 中实现：
   - `requestId` 生成与响应透传
   - 统一错误响应
   - 全局参数校验
   - OpenAPI 文档入口
   - 包含数据库连通性的健康检查
5. 在 `packages/contracts` 中建立首批错误码、分页结构和健康检查契约。
6. 添加必要测试，并记录到 `docs/test-cases/P0-api-foundation.md`。

## 约束

- API 契约采用 NestJS DTO 为源头，OpenAPI 由服务端生成。
- `User` 是平台级实体；组织业务数据必须显式或可验证地归属组织。
- 幂等键复用不同请求体时应具备返回 409 的数据基础。
- Outbox 只建立持久化结构，不在本任务实现 Worker 领取和投递。
- 迁移不得依赖本机个人路径或真实凭据。

## 验收标准

- Prisma schema 校验通过。
- 空数据库可执行初始迁移和 seed，seed 重复执行不产生重复数据。
- `GET /api/health` 返回 API 与数据库状态以及 `requestId`。
- 参数校验错误符合统一错误结构。
- OpenAPI JSON 可访问。
- 至少覆盖健康检查、统一错误结构和一个组织隔离或唯一约束测试。
- 本分支不包含 `pnpm-lock.yaml` 修改。

## 完成报告补充

列出需要集成负责人安装的依赖及准确版本，并说明 PostgreSQL 验证所需命令。
