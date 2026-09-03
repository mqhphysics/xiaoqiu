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

## 本地演示启动

依赖已安装后，在任意普通 PowerShell 窗口粘贴以下两行，不必先打开仓库文件夹。这里指向主仓库，不是 `.worktrees/` 中的开发副本：

```powershell
Set-Location -LiteralPath 'D:\MuDevSpace\其他\华师绿茵纪'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\start-local-demo.ps1'
```

脚本会按需启动 Docker Desktop，等待数据库就绪、执行迁移、后台启动 API/H5，最后自动打开 `http://127.0.0.1:10087/`。启动成功后可以关闭此 PowerShell 窗口；电脑重启后再运行一次。已运行且健康的服务会复用，普通启动不会重置你测试时修改的数据。

仅首次初始化或明确要恢复演示数据时追加 `-Seed`，它会重写演示账号及部分数据；平时不要添加。日志位于被 Git 忽略的 `private-data/runtime/`。脚本不负责安装 Node.js、依赖或 Docker Desktop；更换电脑/仓库路径后先完成环境准备并修改上述路径。完整账号与逐页步骤见[演示验收手册](docs/testing/演示验收手册.md)。

## 手动开发命令

首次启动演示数据库：

```powershell
Copy-Item infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.yaml up -d postgres
$env:DATABASE_URL = 'postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu'
npm --prefix apps/api run db:migrate:deploy
npm --prefix apps/api run db:seed
```

终端一启动 API，终端二启动 H5：

```powershell
$env:DATABASE_URL = 'postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu'
$env:API_PORT = '3001'
npm --prefix apps/api run dev
```

```powershell
$env:TARO_APP_API_BASE_URL = 'http://127.0.0.1:3001'
npm --prefix apps/mini-program run dev:h5
```

API 文档位于 `http://127.0.0.1:3001/api/docs`。

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

| 路径                | 用途                   |
| ------------------- | ---------------------- |
| `apps/api`          | NestJS REST API        |
| `apps/worker`       | NestJS 异步任务 Worker |
| `apps/mini-program` | Taro 微信小程序与 H5   |
| `apps/admin-web`    | React 管理后台         |

## 目录地图

日常开发主要关注下面六个目录：

| 路径        | 内容                                             |
| ----------- | ------------------------------------------------ |
| `apps/`     | API、H5/微信小程序、管理后台和 Worker 的运行代码 |
| `packages/` | 多端共享契约、纯领域工具和生成的 API Client      |
| `prisma/`   | PostgreSQL 数据模型、迁移和 Seed 入口            |
| `infra/`    | Docker Compose、镜像和部署配置                   |
| `docs/`     | 当前文档入口；过期材料统一在 `docs/archive/`     |
| `scripts/`  | 本地一键启动等辅助脚本                           |

`private-data/` 仅保存本机报名表和解析中间件，已被 Git 忽略；`node_modules/`、`.pnpm-store/` 和构建目录均为生成内容。根目录的 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json` 等是工具链入口，不能移入子目录。

### 为什么根目录保留这些文件

这些看起来像“散落文件”，实际都是 Git、pnpm、TypeScript、Docker 或协作工具默认从仓库根目录读取的入口。移动它们会导致命令失效，所以保留在根目录比放进配置文件夹更整洁可靠。

| 文件                                                      | 由谁读取     | 作用                                |
| --------------------------------------------------------- | ------------ | ----------------------------------- |
| `.dockerignore`                                           | Docker       | 构建镜像时排除依赖、缓存和私有文件  |
| `.editorconfig`                                           | 编辑器       | 统一缩进、换行和字符集              |
| `.env.example`                                            | 开发者       | 环境变量模板，不包含真实密钥        |
| `.gitignore`                                              | Git          | 防止依赖、构建产物和私有数据入库    |
| `.prettierignore` / `.prettierrc.json`                    | Prettier     | 统一格式化范围与代码风格            |
| `eslint.config.mjs`                                       | ESLint       | 全仓代码质量规则                    |
| `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` | pnpm         | Monorepo 命令、依赖锁定和工作区声明 |
| `tsconfig.base.json`                                      | TypeScript   | API、网站、小程序和后台共享编译基线 |
| `AGENTS.md`                                               | Codex/协作者 | 多 Agent 文件所有权和协作规则       |
| `CONTRIBUTING.md`                                         | 开发者       | 分支、测试和提交规范                |
| `README.md`                                               | 所有人       | 项目总入口与启动说明                |

`.github/` 保存云端 CI；`.worktrees/` 只用于并行 Agent 的临时工作区；`node_modules/` 和 `.pnpm-store/` 是本地生成目录，均不属于产品源码。

## 重要文档

- [产品与技术架构最终版](docs/architecture/晓球产品与技术架构最终版.md)
- [文档索引](docs/README.md)
- [演示验收手册](docs/testing/演示验收手册.md)
- [协作规范](AGENTS.md)
- [贡献说明](CONTRIBUTING.md)

## 当前阶段

P0、P1、P2 以及 P4 体验完善已合入主仓库。当前是可本地体验的 V1：独立登录/注册、五入口、16 队/224 球员/跨两赛季共 36 场比赛、淘汰树、评分评论、关注、队长管理、消息私信与投诉处理。微信端保持可构建，但尚未完成开发者工具和真机验收；当前不等同于可直接上线的正式版。

### 自行推送与分支收尾

GitHub Desktop 选择主仓库及 `main`：有本地修改先检查并 Commit，再点 `Push origin`；不需要逐个推送已合入 main 的开发分支。更换 GitHub 登录账号不会自动更换仓库远端地址，推送前在 Repository Settings 中核对 Remote。

P4 开发分支已合并后，可在验收及推送完成后清理。先关闭对应开发任务/服务，逐个检查 `git -C .worktrees/<目录> status --short` 无输出，再执行 `git worktree remove .worktrees/<目录>`，最后 `git branch -d <分支名>`。不要直接删文件夹，不使用 `--force` 或 `-D` 绕过保护；命令拒绝时先保留。归档 Codex 任务与删除 Git worktree 是两回事。
