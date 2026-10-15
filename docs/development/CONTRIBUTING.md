# 贡献说明

## 分支

分支、负责人和推送规则以根目录 [AGENTS.md](../../AGENTS.md) 为准：从最新 `main` 拉 `owner/topic` 短分支，PR 合入 `main` 后删除。

## 提交前

界面改动另附截图（桌面 1440×900，手机 390×844），见 AGENTS.md 第 5 条。

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
