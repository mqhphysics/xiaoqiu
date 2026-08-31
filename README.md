# 晓球

晓球是面向校园足球的赛事数据、球队关注与轻社区平台。产品采用模块化单体，客户端由同一套 Taro + React 代码构建 H5 和微信小程序，服务端使用 NestJS、PostgreSQL 与 Prisma。

## 开始之前

- Node.js 22.13 或更高版本
- pnpm 11.5.2 或更高版本
- 微信开发者工具

启用 pnpm：

```powershell
corepack enable
corepack prepare pnpm@11.5.2 --activate
```

安装依赖：

```powershell
pnpm install
```

## 开发命令

首次启动演示数据库：

```powershell
Copy-Item infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.yaml up -d postgres
$env:DATABASE_URL = 'postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu'
pnpm --filter @xiaoqiu/api db:migrate:deploy
pnpm --filter @xiaoqiu/api db:seed
```

终端一启动 API，终端二启动 H5：

```powershell
$env:DATABASE_URL = 'postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu'
pnpm dev:api
```

```powershell
pnpm dev:h5
```

浏览器访问 `http://127.0.0.1:10087/`，API 文档位于 `http://127.0.0.1:3001/api/docs`。完整账号与逐页步骤见[演示验收手册](docs/testing/演示验收手册.md)。

其他开发命令：

```powershell
pnpm dev:worker
pnpm dev:mini
pnpm dev:admin
```

质量检查：

```powershell
pnpm check
```

## 应用

| 路径 | 用途 |
| --- | --- |
| `apps/api` | NestJS REST API |
| `apps/worker` | NestJS 异步任务 Worker |
| `apps/mini-program` | Taro 微信小程序与 H5 |
| `apps/admin-web` | React 管理后台 |

## 重要文档

- [产品与技术架构最终版](docs/architecture/晓球产品与技术架构最终版.md)
- [演示验收手册](docs/testing/演示验收手册.md)
- [协作规范](AGENTS.md)
- [贡献说明](CONTRIBUTING.md)

## 当前阶段

P0、P1 和 P2 的工程、赛程、名单与公开读取切片已经合并。当前目标是交付具备五个核心入口、完整演示赛事和多角色登录的 V1 可体验版本。
