# 晓球

校园足球的赛事数据、球队关注与轻社区平台。一套 Taro + React 代码同时构建桌面/手机 H5 与微信小程序；服务端是 NestJS + PostgreSQL + Prisma 的模块化单体。

协作规则只有一份：[AGENTS.md](AGENTS.md)。`main` 是唯一正式版本。

## 技术栈

| 层     | 技术                                                           |
| ------ | -------------------------------------------------------------- |
| 客户端 | Taro 4 · React · SCSS（`*.h5.*` 桌面网站，`*.weapp.*` 小程序） |
| 服务端 | NestJS REST API（`/api/docs`）· 异步 Worker                    |
| 数据   | PostgreSQL · Prisma 迁移 · 演示数据只由 Seed 脚本生成          |
| 工具   | Node.js ≥ 22.13 · pnpm 11.5.2（corepack）                      |

## 启动

```bash
corepack enable && pnpm install
export DATABASE_URL='postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu'
npm --prefix apps/api run db:migrate:deploy
npm --prefix apps/api run db:seed            # 仅首次或明确要重置演示数据时
API_PORT=3001 npm --prefix apps/api run dev   # 终端一：API
TARO_APP_API_BASE_URL='http://127.0.0.1:3001' npm --prefix apps/mini-program run dev:h5   # 终端二：H5
```

| 端口 | 用途                                            |
| ---- | ----------------------------------------------- |
| 3000 | H5 网站（日常唯一入口），管理中心在 `/admin/`   |
| 3001 | 业务 API，文档 `http://127.0.0.1:3001/api/docs` |

Windows 本机可用 `scripts/start-local-demo.ps1`（一键启动，`-Seed` 重置演示数据）。提交前检查：`pnpm typecheck && pnpm test && pnpm build`。

## 目录

| 路径                | 内容                                  |
| ------------------- | ------------------------------------- |
| `apps/api`          | NestJS REST API                       |
| `apps/worker`       | 异步任务 Worker                       |
| `apps/mini-program` | Taro 客户端：H5 网站 + 微信小程序     |
| `apps/admin-web`    | React 管理中心                        |
| `packages/`         | 共享契约、领域工具、生成的 API Client |
| `prisma/`           | 数据模型、迁移、Seed                  |
| `infra/`            | Docker Compose 与部署配置             |
| `docs/`             | 文档；过期材料在 `docs/archive/`      |
| `scripts/`          | 启动与辅助脚本                        |
| `参考图片/`         | 设计参考                              |

## 文档

- [协作规则](AGENTS.md)
- [产品与技术架构](docs/architecture/晓球产品与技术架构最终版.md)
- [文档索引](docs/README.md) · [目录说明](docs/目录说明.md)
- [演示验收手册](docs/testing/演示验收手册.md)
- [后端部署](docs/deployment/上线版本后端部署.md)
- [旧版 README（2026-10 状态记录）](docs/archive/README-旧版-2026-10.md)
