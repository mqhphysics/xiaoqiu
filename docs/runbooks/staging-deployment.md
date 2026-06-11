# 预发布部署

## 前置条件

- CI 的 lint、typecheck、test 和 build 全部通过。
- 目标提交哈希已记录。
- Coolify 已连接仓库，且使用 `infra/coolify/compose.yaml`。
- PostgreSQL 预发布实例已创建并完成备份策略配置。
- 待部署版本的迁移已在 CI 数据库执行成功。
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

## 首次部署

1. 保护数据库当前快照。
2. 部署 migration service，确认 `prisma migrate deploy` 退出码为 0。
3. 首次环境按需使用 migration 镜像手动执行一次 Seed；普通部署不自动 Seed。
4. migration 成功后启动 API 和 Worker。

## 普通部署

每次发布先运行一次 migration service。API 和 Worker 通过
`service_completed_successfully` 等待迁移，不在自身启动时执行迁移。部署完成后执行：

```bash
curl --fail --show-error https://api-staging.example.edu/api/health/live
curl --fail --show-error https://api-staging.example.edu/api/health/ready
curl --fail --show-error https://staging.example.edu/healthz
```

Liveness 只表示 API 进程存活。Readiness 会访问 PostgreSQL，数据库不可达时必须返回
HTTP 503；Coolify 的健康检查和流量切换只使用 readiness。

记录提交哈希、部署时间、数据库迁移版本和验收人。

## 失败处理

- 构建失败：停止发布，保留当前运行版本，检查 CI 和 Coolify build log。
- Readiness 失败：不要切流；检查环境变量、数据库网络和容器日志。
- 数据库迁移失败：新 API 和 Worker 不应启动。保留旧版本服务，保护数据库快照，
  修复前向迁移后重新运行 migration；不自动执行 schema 降级。
- 部署后回归失败：按应用版本回滚 Runbook 恢复上一兼容镜像。
