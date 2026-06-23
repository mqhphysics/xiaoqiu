# Docker

镜像均以 monorepo 根目录作为 build context：

```text
infra/docker/Dockerfile.api
infra/docker/Dockerfile.worker
infra/docker/Dockerfile.admin-web
infra/docker/Dockerfile.migration
```

固定构建基线：

- Node.js `22.14.0`
- pnpm `11.5.2`
- Admin Web 运行时使用 Nginx `1.27.4`

本地联调由 `infra/compose.yaml` 编排。默认只启动 PostgreSQL；使用 `app`
profile 时会先运行一次 migration job。只有迁移成功后，API 和 Worker 才会启动。
Migration 镜像包含 API workspace 的 Prisma CLI、`prisma/schema.prisma` 和
`prisma/migrations/`，执行 `prisma migrate deploy`。迁移不会由每个 API 实例自行执行。

Dockerfile 专用 `.dockerignore` 文件位于本目录，避免修改仓库根配置。
