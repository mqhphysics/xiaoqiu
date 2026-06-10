# 晓球

晓球是面向校园足球杯赛的多端赛事数据与社区平台。当前采用方案 A：模块化单体、微信小程序首发、Web 管理后台、PostgreSQL 和 Transactional Outbox。

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

```powershell
pnpm dev:api
pnpm dev:worker
pnpm dev:mini
pnpm dev:h5
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

- [实施方案 V0.2](docs/implementation/晓球方案A详细实施方案v0.2.md)
- [方案 A 架构](docs/architecture/晓球更新架构方案A-赛事落地型模块化单体.md)
- [协作规范](AGENTS.md)
- [贡献说明](CONTRIBUTING.md)

## 当前阶段

当前只实施 P0 和第一个纵向切片。身份验证渠道、名单、比赛报告、榜单和社区应按实施方案分阶段推进。
