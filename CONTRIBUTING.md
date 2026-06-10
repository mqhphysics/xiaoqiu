# 贡献说明

## 分支

```text
ai/<task-id>-<short-name>
feature/<task-id>-<short-name>
fix/<task-id>-<short-name>
```

每个任务使用独立分支或 Git Worktree。不要让多个 Agent 同时写入同一个工作目录。

## 提交前

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 提交信息

推荐格式：

```text
feat(api): add tournament creation skeleton
fix(worker): recover expired job leases
docs(adr): record identity verification decision
```

## Pull Request

PR 描述至少包含：

- 对应任务编号。
- 变更范围。
- 验收标准。
- 测试结果。
- 数据库或 API 影响。
- 截图或录屏，适用于界面变更。
- 风险和回滚方式。

## 公共契约

NestJS DTO 是 API 契约源。修改 DTO 后必须更新 OpenAPI 和生成 Client。前端不得手写重复请求响应类型。
