# Prisma

`schema.prisma`、迁移和 Seed 属于 SB-02 的独占写入范围。

建模必须遵守实施方案中的：

- 物理表命名。
- `organization_id` 隔离。
- 唯一约束和部分唯一索引。
- 不可变快照。
- AuditLog 和 Outbox 语义。

通过 API workspace 执行 Prisma 命令：

```powershell
npx pnpm@11.5.2 --filter @xiaoqiu/api prisma:validate
npx pnpm@11.5.2 --filter @xiaoqiu/api prisma:generate
npx pnpm@11.5.2 --filter @xiaoqiu/api db:migrate:deploy
npx pnpm@11.5.2 --filter @xiaoqiu/api db:seed
```

API 的开发、类型检查、测试、构建和 Seed 脚本会先生成 Prisma Client。
生成源码位于 `apps/api/src/generated/prisma`，不会提交；构建脚本会把当前平台的查询引擎复制到 `dist`。

Seed 只创建一个开发组织和一个开发管理员，不包含密码、Token、微信标识或真实凭据。
