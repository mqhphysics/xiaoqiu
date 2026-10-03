# 晓球

晓球是面向校园足球的赛事数据、球队关注与轻社区平台。产品采用模块化单体，客户端由同一套 Taro + React 代码构建 H5 和微信小程序，服务端使用 NestJS、PostgreSQL 与 Prisma。

日常查找先看 [文件夹怎么找](docs/目录说明.md)和[参考图片](参考图片/README.md)。根目录常见工程配置已设为 Windows 隐藏，仍可从[工程配置入口](工程配置/README.md)访问；普通文件只显示 `打开晓球网站.cmd`。

## 当前开发规则（2026-10-01 起）

1. **日常网站任务默认只推进 H5，不同时改微信小程序。** 不顺手调整微信专用组件、AppID、项目配置、小程序路由或微信功能，也不把小程序构建/真机测试作为普通网站任务的例行工作。手机浏览器 H5 和微信小程序是两个测试目标；用户只安排桌面时，移动 H5 也不扩展修改。
2. H5 与小程序共用 `apps/mini-program`，共享代码的改动可能影响两端。网站专用行为优先放入 `.h5.tsx` / `.h5.ts`、平台判断或 H5 样式范围；必须改共享逻辑时保留现有微信行为，并在报告中说明潜在影响。微信端独立改造留到明确分配的手机任务。
3. **每完成一轮修改、执行与范围相符的检查后，自行在当前任务分支 commit。** 无需再次询问是否提交；报告提交哈希、修改范围、检查结果和未验证项。只提交本任务成果，不代为提交其他进行中任务；用户明确要求提交当前全部修改时，以明确授权的快照范围为准。
4. Commit 是本地保存，Push 是上传远端。**没有明确要求时不自行 push、合并到 main 或部署。** 检查失败不能写成通过；若用户要求保存当前状态，可以如实记录失败并提交阶段快照，不能称其已验收。
5. 并行任务用独立分支与 worktree，先记录共同基线和具体写入文件。共享壳层、API 契约、数据库模型等指定唯一负责人；目录隔离后仍须协调接口、端口和测试数据库。
6. 保留现有修改；私有报名资料、真实凭据、运行日志、依赖和生成产物不入库。正式赛事资料不用演示 Seed 承载，普通启动不重新 Seed。
7. **用户要求分别人工验收分支时，打开各分支自己的预览窗口。** 日常 `127.0.0.1:3000`显示主目录版本，独立工作树修改不会实时同步。每个验收窗口注明分支、提交、测试内容、数据来源与固定端口；先验证页面/API能用，再按用户要求打开浏览器。普通自动测试继续使用 `-NoBrowser`。分支构建只写自己的输出目录，不覆盖main；验收结束关闭临时服务，日常入口继续为3000。

### 分支人工验收入口（2026-10-03）

| 窗口           | 分支/提交                                 | 本轮固定入口           | 测试重点                                             |
| -------------- | ----------------------------------------- | ---------------------- | ---------------------------------------------------- |
| 顶部导航 | `main` / `ec1f980` | http://127.0.0.1:3000/ | 队徽关联单色、默认浅纹及逐线生长；3101已关闭 |
| 主队与球队     | `codex/h5-team-dashboard` / `f3d301f`     | http://127.0.0.1:3102/ | 主队页面、球队/球员切换、球队详情弹窗                |
| 人物资料与私信 | `main` / `1f02dc8` | http://127.0.0.1:3000/ | 已合入 main；全站内容人物预览/资料及身份标志，3103 已关闭 |
| 管理中心       | `codex/admin-center` / `4626cec`          | http://127.0.0.1:3104/ | 账号与球队资料、审核、反馈、操作记录                 |

表内已注明合入main的成果使用日常3000；其它任务的集成状态以各自交付记录为准。这些本机入口不代表生产部署。导航、球队与人物页面使用日常API及数据；发帖、私信、改主队等写入会影响同一份本机数据。管理中心使用独立的数据副本和本分支API，操作不会修改日常库；测试账号以本次交付说明为准。未接通的数据或功能按任务报告保留限制，不注入模拟响应冒充实际后台。

预览使用 `scripts/serve-branch-preview.mjs` 提供已构建页面及同源API代理，避免不同端口导致登录/图片跨域失败。它不构建源码、不自动打开浏览器、不自动换端口。示例：

```powershell
node scripts/serve-branch-preview.mjs --root '工作树/apps/mini-program/dist' --port 3101 --api 'http://127.0.0.1:3001' --label '顶部导航分支'
```

H5构建时设置 `TARO_APP_API_BASE_URL` 为该预览地址（例如 `http://127.0.0.1:3101`）；管理站使用 `/api`。浏览器存储按端口隔离，需要在各窗口分别登录。预览只绑定127.0.0.1；端口用途、来源提交及关闭安排由集成负责人记录。当前服务清单保存在本机被忽略的 `private-data/v2-integration/branch-previews-20261003.json`。

AI 协作者执行[AGENTS.md](AGENTS.md)。首轮功能盘点见[项目进度总览](docs/status/项目进度总览-2026-10-01.md)；本轮并行功能按 [V2 工作流公共契约](docs/architecture/V2-工作流公共契约.md)和 `docs/tasks/V2-00` 至 `V2-04` 实施。工作树起点不一致的实证、修复和后续规则见[集成指南](docs/development/并行工作树与集成指南.md)。

## 开始之前

- Node.js 22.13 或更高版本
- pnpm 11.5.2 或更高版本
- 微信开发者工具：只在明确开展微信端任务时需要，日常 H5 开发不依赖它。

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
Set-Location -LiteralPath 'D:\MuDevSpace\xiaoqiu'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\start-local-demo.ps1'
```

脚本会按需启动 Docker Desktop，等待数据库就绪、执行迁移、后台启动 API/H5，最后自动打开 `http://127.0.0.1:3000/`。启动成功后可以关闭此 PowerShell 窗口；电脑重启后再运行一次。已运行且健康的服务会复用，普通启动不会重置你测试时修改的数据。

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

文件按下表分类，详细子目录与文档用途见[目录说明](docs/目录说明.md)：

| 路径        | 内容                                             |
| ----------- | ------------------------------------------------ |
| `apps/`     | API、H5/微信小程序、管理后台和 Worker 的运行代码 |
| `packages/` | 多端共享契约、纯领域工具和生成的 API Client      |
| `prisma/`   | PostgreSQL 数据模型、迁移和 Seed 入口            |
| `infra/`    | Docker Compose、镜像和部署配置                   |
| `docs/`     | 当前文档入口；过期材料统一在 `docs/archive/`     |
| `scripts/`  | 本地一键启动等辅助脚本                           |
| `参考图片/` | 页面、品牌、球场和登录页的设计参考及缩略图入口   |
| `工程配置/` | 隐藏配置的用途说明和指向原文件的本机快捷方式     |

`private-data/` 保存本机报名资料、运行日志、媒体、备份和整理快照，已被 Git 忽略；`node_modules/`、`.pnpm-store/` 和构建目录均为生成内容。当前 H5 输出在 `apps/mini-program/dist/`，微信输出在 `dist-weapp/`，两个目录都不提交。`tools/` 放开发辅助工具源码，其下载缓存与本机安装记录不提交。根目录的 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json` 等是工具链入口，不能移入子目录。

### 为什么根目录保留这些文件

这些看起来像“散落文件”，实际都是 Git、pnpm、TypeScript、Docker 或协作工具从仓库根目录读取的入口。本次保留这些配置的真实路径并设置隐藏；可移动的贡献说明归入 `docs/development/`，设计参考归入根目录 `参考图片/`，详细分工见目录说明。

| 文件                                                      | 由谁读取     | 作用                                 |
| --------------------------------------------------------- | ------------ | ------------------------------------ |
| `.dockerignore`                                           | Docker       | 构建镜像时排除依赖、缓存和私有文件   |
| `.editorconfig`                                           | 编辑器       | 统一缩进、换行和字符集               |
| `.env.example`                                            | 开发者       | 环境变量模板，不包含真实密钥         |
| `.gitignore`                                              | Git          | 防止依赖、构建产物和私有数据入库     |
| `.prettierignore` / `.prettierrc.json`                    | Prettier     | 统一格式化范围与代码风格             |
| `eslint.config.mjs`                                       | ESLint       | 全仓代码质量规则                     |
| `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` | pnpm         | Monorepo 命令、依赖锁定和工作区声明  |
| `tsconfig.base.json`                                      | TypeScript   | API、网站、小程序和后台共享编译基线  |
| `AGENTS.md`                                               | Codex/协作者 | 多 Agent 文件所有权和协作规则        |
| `docs/development/CONTRIBUTING.md`                        | 开发者       | 分支、测试和提交规范，已移入文档目录 |
| `README.md`                                               | 所有人       | 项目总入口与启动说明                 |

`.github/` 保存云端 CI；`.worktrees/` 只用于并行 Agent 的临时工作区；`node_modules/` 和 `.pnpm-store/` 是本地生成目录，均不属于产品源码。

## 重要文档

- [产品与技术架构最终版](docs/architecture/晓球产品与技术架构最终版.md)
- [文档索引](docs/README.md)
- [演示验收手册](docs/testing/演示验收手册.md)
- [协作规范](AGENTS.md)
- [贡献说明](docs/development/CONTRIBUTING.md)

## 当前阶段

本轮已收齐后端及两轮网站成果（新版登录、赛程、数据、我的、导航/主队动效、动态、首页轮播）并回到 **main**。完整功能进度、端口/分支、密码和下一阶段见[整体汇总](docs/status/整体汇总与下一阶段-2026-10-02.md)。日常只打开 **3000**；3001是后台数据API，人工验收端口已取消。本机现有账号密码为 `123`，仅本机演示启动开启短密码支持，正式环境及注册仍要求至少8位。

2026-10-02 的四分支后端整合、真实比赛流程与剩余任务见 [第二轮集成验收](docs/status/后端第二轮集成验收-2026-10-02.md)。集成版保存在 `codex/v2-integrator`，实际规则/人员配置、生产发布和微信验收分别安排；自动提交不代表这些步骤已完成。

P0、P1、P2 以及 P4 体验完善已合入主仓库。当前是可本地体验的 V1：独立登录/注册、五入口、2026 演示赛事 8 队/20 场公开比赛（17 场结束）、淘汰树、评分评论、关注、队长管理、消息私信与投诉处理。每支参赛队有 14 人；全局保留 224 位演示球员档案与 2025 历史赛季的 8 场比赛，旧十六强已转为非公开历史记录。微信端尚未完成开发者工具和真机验收；当前不等同于可直接上线的正式版。

### 自行推送与分支收尾

当前主目录使用 `main`。下一轮并行任务从最新main创建独立分支/worktree，不要在主目录替其它聊天切分支。Commit保存本地版本，Switch只切换版本；其它分支须经过merge/cherry-pick才会纳入main，Push才更新GitHub。本轮用户已授权main合并及推送；后续任务仍按明确授权执行。

P4 开发分支已合并后，可在验收及推送完成后清理。先关闭对应开发任务/服务，逐个检查 `git -C .worktrees/<目录> status --short` 无输出，再执行 `git worktree remove .worktrees/<目录>`，最后 `git branch -d <分支名>`。不要直接删文件夹，不使用 `--force` 或 `-D` 绕过保护；命令拒绝时先保留。归档 Codex 任务与删除 Git worktree 是两回事。
