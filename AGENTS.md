# 晓球协作规则

本文件是仓库唯一的协作规则，适用于所有人和所有 AI（Cursor、Gemini、Codex 等）。开始任务前先读本文件和 [产品与技术架构](docs/architecture/晓球产品与技术架构最终版.md)。

## 1. 分支：main 是唯一正式版本

- `main` 是唯一的正式版本，其他分支都是临时的。
- 每个任务从**最新的 main** 拉一个短分支，命名 `owner/topic`（例如 `cursor/home-feed`、`gemini/weapp-tabbar`）。
- 完成后向 `main` 发 PR；合并后删除该分支。不长期保留分支，不在分支之间互相合并。

## 2. 桌面与手机隔离

- **桌面网站**只改 `*.h5.tsx` / `*.h5.ts` / `*.h5.scss`。
- **手机端 / 小程序**只改 `*.weapp.*`，或限定在 `@media (max-width: 720px)` 内的样式。
- 共享组件、API、数据库、全局样式（如 `app.scss`、无后缀的共用 `.scss`/`.tsx`）可以改，但 PR 里必须写明对另一端的影响。

## 3. 一个区域同一时期只有一个负责人

| 区域             | 当前负责人     |
| ---------------- | -------------- |
| 桌面网站（H5）   | 晓球（Cursor） |
| 手机 H5 + 小程序 | Gemini         |

开工前先拉取最新 `main`。需要动对方区域时，先在 PR 或任务里说明，不直接改。

## 4. 已定稿的布局不随意改动

用户确认过的版式不顺手调整。确需改动时，PR 里附改动前后截图对比和原因。

## 5. 提交前检查

- 运行 `pnpm typecheck`、`pnpm test`、构建（`npm --prefix apps/mini-program run build:h5` 或 `pnpm build`）。
- 界面改动附截图：桌面 1440×900，手机 390×844。
- 失败、跳过或没验证的项目如实写出，不能写成通过。

## 6. 提交与推送

- 本地 commit 随时可以做，不需要询问。
- push、合并到 `main`、部署：只有用户明确同意，或该轮任务事先已授权时才执行。

## 7. 仓库里不放的东西

- 不提交密钥、真实凭据、私人报名资料、运行日志、依赖、缓存和构建产物（`dist/`、`dist-weapp/`、`node_modules/`、`private-data/`）。
- 演示数据只通过 Seed 脚本生成；共用或正式数据库不跑 Seed。

## 公共文件所有权

以下文件由集成负责人（当前为晓球）统一修改；其他人只在 PR 中提出建议，除非任务明确授权：

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json
eslint.config.mjs
prisma/schema.prisma
packages/contracts/
packages/api-client/
```

## 固定端口

- `3000`：H5 网站日常入口（管理中心 `/admin/`）。端口被占用时复用或请集成负责人重启，不自动换端口。
- `3001`：业务 API。

## 其他底线

- NestJS DTO 是 API 契约源；改 DTO 后更新 OpenAPI 和生成 Client，不手改生成代码。
- 不仅凭姓名匹配或覆盖球员档案；前端隐藏按钮不等于权限控制。
- 不撤销或覆盖别人的修改；有歧义先记录，交给用户决定。

## 完成报告

列出：修改文件、执行的检查及结果、截图路径、未解决问题、对另一端或公共文件的影响。
