# 本地启动与停止

## 前置条件

- Docker Engine 24 或更高版本。
- Docker Compose v2.20 或更高版本。
- 如需在宿主机运行应用：Node.js `22.14.0`、pnpm `11.5.2`。
- 命令均从 monorepo 根目录执行。

先验证工具：

```powershell
docker version
docker compose version
node --version
pnpm --version
```

## 准备环境

PowerShell：

```powershell
Copy-Item infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.yaml config
```

`infra/.env` 只用于本地开发，不得填入或提交真实生产凭据。

## 只启动 PostgreSQL

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml up -d postgres
docker compose --env-file infra/.env -f infra/compose.yaml ps
docker compose --env-file infra/.env -f infra/compose.yaml exec postgres pg_isready -U xiaoqiu -d xiaoqiu
```

预期 `pg_isready` 返回 `accepting connections`。宿主机应用使用：

```text
postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu
```

## 首次启动

首次启动时由 Compose 创建一次性 migration job。API 和 Worker 只有在该 job
成功退出后才会启动：

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml --profile app up -d --build
docker compose --env-file infra/.env -f infra/compose.yaml --profile app wait migration
docker compose --env-file infra/.env -f infra/compose.yaml --profile app run --rm migration pnpm --filter @xiaoqiu/api db:seed
```

Seed 可以重复执行。验证幂等性：

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml --profile app run --rm migration pnpm --filter @xiaoqiu/api db:seed
```

## 普通启动

部署新提交时使用 `--build` 重建 migration 镜像并创建一次性 job。迁移只由
migration service 执行；API 和 Worker 等待该 service 成功，不会在各自启动时争抢迁移。

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml --profile app up -d --build
docker compose --env-file infra/.env -f infra/compose.yaml --profile app wait migration
docker compose --env-file infra/.env -f infra/compose.yaml --profile app ps
Invoke-RestMethod http://localhost:3000/api/health/live
Invoke-RestMethod http://localhost:3000/api/health/ready
Invoke-WebRequest http://localhost:5173/healthz
```

Admin Web 位于 `http://localhost:5173`，API 文档位于
`http://localhost:3000/api/docs`。

## 健康检查

- Liveness：`/api/health/live` 只判断 API 进程是否存活，用于识别进程死锁或崩溃。
- Readiness：`/api/health/ready` 同时检查 PostgreSQL，用于容器健康和流量切换。
- PostgreSQL 不可达时 readiness 必须返回 HTTP 503。部署平台不得只读取正文中的
  `degraded` 状态并把 HTTP 200 当成功。

## 停止

保留数据库数据：

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml --profile app down
```

同时删除本地数据库卷会永久清除数据，仅在明确需要重建空库时执行：

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml --profile app down --volumes
```

## 失败处理

- `5432` 或 `3000` 端口冲突：修改 `infra/.env` 中的宿主机端口后重试。
- PostgreSQL 不健康：运行
  `docker compose --env-file infra/.env -f infra/compose.yaml logs postgres`。
- Migration 失败：API 和 Worker 不应启动。查看
  `docker compose --env-file infra/.env -f infra/compose.yaml --profile app logs migration`，
  修复迁移或数据库权限后重新运行 migration；不要自动降级 Schema。
- 镜像构建失败：先执行 `pnpm install --frozen-lockfile` 和 `pnpm build`，
  再查看具体 Docker build stage。
- API 不健康：运行
  `docker compose --env-file infra/.env -f infra/compose.yaml logs api`。
- 只修改了前端构建变量：必须重新执行带 `--build` 的启动命令。
