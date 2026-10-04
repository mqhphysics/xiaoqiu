# Worker A 媒体验证（2026-10-04）

独立 checkout：`C:/Users/Mu Qinghan/Documents/Codex/2026-10-04/task-2/worker-a`；基线 `cf0c21226c5de01eea5c031e44b282deff322014`。

新 PostgreSQL 17.4 容器只有 `xiaoqiu_media_test` 测试库、无主机卷、随机绑定回环端口，测试数据全部标注虚构。迁移从空库成功执行全部 17 个迁移；没有连接当前公开联调库，没有读取或复制现有密码、令牌、账号或个人资料。测试自行创建临时会话，测试媒体来自 sharp 生成的色块与多帧 GIF。

执行结果：

- Prisma schema 格式、校验、生成：通过；新增模型与命名外键/索引迁移对应，在一次性库实际查询 ManagedMediaAsset 及其组织/上传者/审核者/可见性操作者关系通过。
- API TypeScript 与编译：通过。
- H5 TypeScript：通过。
- 定向 ESLint 与 Prettier：通过。
- 新媒体、既有头像/动态图片与授权定向 Node 测试：17 项通过、0 失败、0 跳过。
- 实际 PostgreSQL + Nest HTTP：真实文件上传 → PENDING → 本人/审核者预览 → 总管理员审核 → 二进制公开/事件列表展示；普通用户/信息员/组织管理员越权审核、陌生人预览、跨组织、修改他人球员照、错误格式/危险路径、陈旧版本、幂等重试都被拒绝。未生效的未来管理员授权不可审核、私有预览或直传；撤销管理员授权立即失去队列权限。驳回原因回到本人投稿；隐藏、软删除、恢复、审核者撤回不可由本人绕过。账户头像审核/恢复不覆盖球员头像；背景和球员照片各自保存。事件原位修改及删除重建不重绑媒体，开关关闭可继续撤回。
- `scripts/verify-managed-media-h5.mjs`：独立 headless Chrome、全新临时浏览器资料、无预览端口、合成账号/API，使用真实组件及 SCSS，15 项交互检查通过。验证正常可点击按钮的未开放提示、后端能力开启无需修改按钮、文件 bytes + purpose + target 上传、待审/驳回/反馈、减少动画下静态封面 → 点击播放 → 加载后计时并一次停止、替换已发布素材停止播放并需重新点击，以及审核列表不自动下载 GIF、点击授权预览、一次停止和私有封面解码。这是组件验证，不是公开服务联调或整站人工验收。
- 共享 capability 最小补丁：在独立参考副本通过 `git apply --check`。基线没有其他 worker 的 ProductConfigModule；HTTP 测试注册的测试专用控制器只模拟已商定的 `/api/me/capabilities` 形状，生产模块不注册它。主集成仍须应用 `integration/managed-media-capabilities.patch` 并验收真实共享接口。
- H5 生产构建：通过；Webpack 有现有素材和 app entry 大小警告（2 项），未做无关资源优化。

可在**新建的一次性测试库**复现（不要使用日常库）：

```powershell
# 在仓库根；先安装既有锁文件依赖，不新增依赖。
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:<独立容器端口>/xiaoqiu_media_test'
pnpm --filter @xiaoqiu/api db:migrate:deploy
pnpm --filter @xiaoqiu/api prisma:generate
pnpm exec tsc -p apps/api/tsconfig.test.json

# 在 apps/api；引擎复制脚本要求应用目录作为 cwd。
node scripts/copy-prisma-engine.mjs dist/test/generated/prisma
$env:MEDIA_TEST_DATABASE_URL = $env:DATABASE_URL
node --test --test-concurrency=1 dist/test/managed-media/media-image.spec.js dist/test/managed-media/managed-media.postgres.integration.spec.js dist/test/media/media.service.spec.js dist/test/auth/auth-context.guard.spec.js

# 回仓库根；组件验证需 Chrome，必要时设置 CHROME_PATH。
node scripts/verify-managed-media-h5.mjs
pnpm --filter @xiaoqiu/mini-program typecheck
pnpm --filter @xiaoqiu/mini-program build:h5
```

HTTP 测试只接受 `postgresql://postgres@127.0.0.1:<port>/xiaoqiu_media_test`，缺少 MEDIA_TEST_DATABASE_URL 时明确跳过；本轮执行时提供了真实测试 URL，没有跳过。测试库应是空库，本轮完成后关闭专属临时容器。生成媒体、截图、构建产物与临时浏览器资料不提交。

接口、迁移及 capability 集成点详见 `apps/api/src/managed-media/README.md`。普通网站开发没有运行微信构建/真机测试；生产媒体卷、共享 capability 补丁和公开服务验收由主集成负责。本地提交不包含生成媒体、截图、浏览器资料或构建产物。
