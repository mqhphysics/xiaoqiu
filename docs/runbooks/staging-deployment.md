# 预发布部署

## 前置条件

- CI 的 lint、typecheck、test 和 build 全部通过。
- 目标提交哈希已记录。
- Coolify 已连接仓库，且使用 `infra/coolify/compose.yaml`。
- PostgreSQL 预发布实例已创建并完成备份策略配置。
- 所有 Secret 只保存在 Coolify。

## 部署

在本地先验证 Compose 展开结果：

```powershell
docker compose -f infra/coolify/compose.yaml config
```

在 Coolify 设置：

```text
APP_VERSION=<git-commit-sha>
DATABASE_URL=<staging-postgresql-url>
VITE_API_BASE_URL=https://api-staging.example.edu/api
SENTRY_DSN_API=<optional-secret>
SENTRY_DSN_WORKER=<optional-secret>
```

部署完成后执行：

```bash
curl --fail --show-error https://api-staging.example.edu/api/health
curl --fail --show-error https://staging.example.edu/healthz
```

记录提交哈希、部署时间、数据库迁移版本和验收人。

## 失败处理

- 构建失败：停止发布，保留当前运行版本，检查 CI 和 Coolify build log。
- 健康检查失败：不要切流；检查环境变量、数据库网络和容器日志。
- 数据库迁移失败：停止应用写入，保护数据库快照，不自动执行 schema 降级。
- 部署后回归失败：按应用版本回滚 Runbook 恢复上一兼容镜像。
