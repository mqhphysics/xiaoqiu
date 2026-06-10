# Coolify 预发布骨架

`compose.yaml` 从仓库根 context 构建 API、Worker 和 Admin Web。数据库不包含在
预发布应用栈中，应在 Coolify 创建独立 PostgreSQL 资源并启用持久卷与备份。

## 前置条件

- Coolify 能读取仓库和目标分支。
- 已创建预发布 PostgreSQL，且 `DATABASE_URL` 使用应用专用账号。
- API 与 Admin Web 已分别配置域名和 HTTPS。
- 以下变量保存在 Coolify Secret 中，而不是提交到仓库：
  `DATABASE_URL`、`SENTRY_DSN_API`、`SENTRY_DSN_WORKER`。

## 配置

1. 新建 Docker Compose 资源，Compose 文件填写
   `infra/coolify/compose.yaml`。
2. 将 API 域名代理到 `api:3000`，Admin Web 域名代理到
   `admin-web:80`。
3. 设置 `APP_VERSION` 为提交哈希，设置 `VITE_API_BASE_URL` 为公开 API
   地址，例如 `https://api-staging.example.edu/api`。
4. 部署后检查：

```bash
curl --fail --show-error https://api-staging.example.edu/api/health
curl --fail --show-error https://staging.example.edu/healthz
```

## 失败处理

- 构建失败：先在仓库根目录执行任务卡中的本地镜像构建命令，确认锁文件与构建脚本。
- API 不健康：检查 `DATABASE_URL`、容器日志和 `/api/health`。
- Admin Web 可访问但请求错误：确认 `VITE_API_BASE_URL` 在构建时已设置；修改后必须重建镜像。
- Worker 重启：先检查数据库连通性，再按 Worker 堆积 Runbook 排查。

## Sentry 边界

Compose 会把 API 和 Worker DSN 传入容器。当前应用尚未初始化 Sentry SDK，因此
仅设置 DSN 不会产生事件；SDK 依赖和应用启动初始化需由应用代码负责人完成。
