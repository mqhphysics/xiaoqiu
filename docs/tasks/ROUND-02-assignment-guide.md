# 第 2 轮 AI 并行开发分配指南

## 目标

在已通过 CI 的 P0 基线上推进 P1 第一个纵向切片：

```text
后台创建赛事
→ 发布赛程
→ 小程序读取赛程
```

本轮不做真实微信登录、身份验证、球队报名、名单快照、比赛报告、榜单、通知和社区。

## 开工前提

- `main` 已推送到 GitHub 私有仓库。
- GitHub Actions `CI` 已通过。
- 每个 Agent 已阅读：
  1. `docs/implementation/晓球方案A详细实施方案v0.2.md`
  2. `AGENTS.md`
  3. 自己唯一的一张任务卡
- 每个开发 Agent 使用独立 worktree，不直接在 `main` 工作。
- Agent 不修改 `pnpm-lock.yaml`。

## 并行任务

| Agent | 分支 | 任务卡 | 写入范围 |
| --- | --- | --- | --- |
| AI-A | `ai/p1-api-schedule` | `P1-SB-11-01-api-schedule-slice.md` | API、Prisma、contracts、后端测试 |
| AI-B | `ai/p1-admin-schedule` | `P1-SB-11-02-admin-web-slice.md` | Admin Web、后台测试说明 |
| AI-C | `ai/p1-mini-readonly-schedule` | `P1-SB-11-03-mini-program-readonly-schedule.md` | Mini Program 只读页面、页面逻辑测试 |
| AI-D | 无开发分支，只读 | `P1-REVIEW-01-schedule-slice-review.md` | 不写文件，只输出复审结论 |

## 推荐 worktree 命令

由集成负责人在仓库根目录执行：

```powershell
git worktree add .worktrees/p1-api-schedule -b ai/p1-api-schedule main
git worktree add .worktrees/p1-admin-schedule -b ai/p1-admin-schedule main
git worktree add .worktrees/p1-mini-readonly-schedule -b ai/p1-mini-readonly-schedule main
```

每个开发 AI 只进入分配给自己的 worktree。

## 发给开发 AI 的统一提示词

```text
你正在参与“晓球”项目第 2 轮并行开发。请先完整阅读：
1. docs/implementation/晓球方案A详细实施方案v0.2.md
2. AGENTS.md
3. docs/tasks/<分配给你的任务卡>

严格遵守任务卡的独占写入范围，不扩大首发范围，不修改 pnpm-lock.yaml，不合并其他分支。
本轮目标是 P1 第一个纵向切片：后台创建赛事 -> 发布赛程 -> 小程序读取赛程。
请直接完成实现、测试和任务卡要求的验证，不要只给方案。
结束时按 AGENTS.md 的“完成报告”格式汇报，并给出当前分支的提交哈希。
```

## 给审查 AI 的提示词

```text
你是“晓球”项目第 2 轮只读复审 AI。请先阅读：
1. docs/implementation/晓球方案A详细实施方案v0.2.md
2. AGENTS.md
3. docs/tasks/P1-REVIEW-01-schedule-slice-review.md
4. 本轮三个开发分支的最终 diff

不要修改文件，不要合并分支。请按任务卡输出复审结论，重点检查：
组织隔离、发布不可原地覆盖、AuditLog/Outbox、contracts/OpenAPI 一致性、前端 API adapter、构建测试、公共文件越权和集成冲突。
```

## 建议集成顺序

1. 集成 `ai/p1-api-schedule`，统一处理 Prisma migration、contracts 和 API 测试。
2. 集成 `ai/p1-admin-schedule`，对齐实际 API adapter。
3. 集成 `ai/p1-mini-readonly-schedule`，对齐 public ViewModel。
4. 根据只读复审报告修正跨模块问题。
5. 在 `main` 执行：

```powershell
npx pnpm@11.5.2 check
npx pnpm@11.5.2 --filter @xiaoqiu/mini-program build:h5
docker compose -f infra/compose.yaml --profile app up -d --build
```

## 本轮退出标准

- 后台可完成赛事、球队、场地、比赛和赛程发布的第一条链路。
- 小程序可读取并展示已发布赛事与赛程。
- 后端发布命令具备审计和 Outbox。
- CI 通过。
- 没有真实密钥、个人隐私或生成产物误入库。
