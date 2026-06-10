# 应用版本回滚

## 原则

- 默认只回滚应用代码和镜像，不自动回滚数据库 Schema。
- 回滚目标必须兼容当前数据库。
- 数据库变更遵循 expand、migrate、contract；比赛周禁止不可逆 contract。

## 前置条件

- 已知当前和上一稳定版本的提交哈希或镜像标签。
- 已记录当前数据库迁移版本。
- 上一版本通过当前 Schema 的兼容性检查。
- 已准备 API、登录、公开比赛读取和 Worker 的冒烟测试。

## Coolify 回滚

1. 暂停新的高风险管理写入。
2. 在 Coolify 选择上一稳定部署或上一提交哈希重新部署。
3. 保持数据库资源不变，不执行 schema downgrade。
4. 等待 API 和 Admin Web 健康检查通过。
5. 恢复 Worker 前检查 Outbox 最老任务和失败任务。

验证：

```bash
curl --fail --show-error https://api-staging.example.edu/api/health
curl --fail --show-error https://staging.example.edu/healthz
```

本地验证某个提交的容器骨架：

```powershell
git show --no-patch --oneline <commit-sha>
docker compose --env-file infra/.env -f infra/compose.yaml --profile app build --pull
docker compose --env-file infra/.env -f infra/compose.yaml --profile app up -d
```

## 失败处理

- 旧应用无法连接当前 Schema：停止回滚，恢复新应用版本，使用向前兼容修复。
- 健康检查通过但业务失败：停止切流，检查登录、公开读取和 Worker 日志。
- Worker 在回滚后持续失败：暂停 Worker，不影响 API 核心写入，按堆积 Runbook 处理。
- 必须修复数据：通过受控应用命令或登记过的紧急 SQL，不删除审计历史。
