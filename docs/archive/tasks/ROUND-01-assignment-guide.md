# 第 1 轮 AI 并行开发分配指南

## 目标

在 P0 骨架基线上并行推进数据库与 API 基础、Taro 复杂表单 Spike、CI 与部署骨架，并安排一名只读审查 Agent 检查集成风险。

## 开工前提

- `main` 已存在本地基线提交。
- 每个 Agent 已阅读：
  1. `docs/implementation/晓球方案A详细实施方案v0.2.md`
  2. `AGENTS.md`
  3. 自己唯一的一张任务卡
- 每个开发 Agent 使用独立 worktree，不直接在 `main` 工作。
- 不要求 GitHub、远程仓库或 GitHub 账号。

## 并行任务

| Agent | 分支 | 任务卡 | 写入范围 |
| --- | --- | --- | --- |
| AI-A | `ai/p0-api-database` | `P0-SB-02-03-api-database-foundation.md` | API、Prisma、contracts、API 测试夹具 |
| AI-B | `ai/p0-spike-taro` | `P0-SPIKE-01-taro-form-draft.md` | 小程序和对应 Spike 报告 |
| AI-C | `ai/p0-ci-infra` | `P0-SB-06-ci-deployment.md` | CI、infra、运维文档 |
| AI-D | 无分支，只读 | `P0-REVIEW-01-baseline-review.md` | 不写文件，只输出审查结论 |

## 推荐 worktree 命令

由集成负责人在仓库根目录执行：

```powershell
git worktree add .worktrees/p0-api-database -b ai/p0-api-database main
git worktree add .worktrees/p0-spike-taro -b ai/p0-spike-taro main
git worktree add .worktrees/p0-ci-infra -b ai/p0-ci-infra main
```

每个 AI 只进入分配给自己的 worktree。

## 发给开发 AI 的统一提示词

```text
你正在参与“晓球”项目第 1 轮并行开发。请先完整阅读：
1. docs/implementation/晓球方案A详细实施方案v0.2.md
2. AGENTS.md
3. docs/tasks/<分配给你的任务卡>

严格遵守任务卡的独占写入范围，不扩大需求，不修改 pnpm-lock.yaml，不合并其他分支。
请直接完成实现、测试和任务卡要求的验证，不要只给方案。
结束时按 AGENTS.md 的“完成报告”格式汇报，并给出当前分支的提交哈希。
```

## 集成顺序

1. 集成 `ai/p0-api-database`，统一安装依赖并更新锁文件。
2. 集成 `ai/p0-ci-infra`，使用已落地的脚本验证 CI。
3. 集成 `ai/p0-spike-taro`，决定 Spike 代码保留、调整或淘汰。
4. 根据只读审查报告修正跨模块问题。
5. 在 `main` 执行 `pnpm check`、数据库迁移验证和必要的构建冒烟。

## 本轮退出标准

- 三个开发分支均有可审查提交。
- 所有公共依赖变更由集成负责人统一落锁。
- 数据库、API、CI 和 Taro Spike 的关键风险已得到实际验证。
- 不存在越权写入、未说明的范围扩张或真实密钥提交。
