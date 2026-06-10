# Prisma

`schema.prisma`、迁移和 Seed 属于 SB-02 的独占写入范围。

建模必须遵守实施方案中的：

- 物理表命名。
- `organization_id` 隔离。
- 唯一约束和部分唯一索引。
- 不可变快照。
- AuditLog 和 Outbox 语义。
