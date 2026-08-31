# 第 3 轮 AI 并行开发分配指南

## 目标

在提交 `ab58be6` 的稳定 P1 基线上，完成下一条真实数据纵向切片：

```text
本地私有报名表结构化数据
-> 后端导入球队、球员和锁定名单快照
-> 公开 H5 展示赛事、球队和公开名单
-> 管理后台核对导入结果与数据质量
```

公开网站优先复用 `apps/mini-program` 的 Taro H5 构建，不新建第二套公开 Web 应用。之后同一页面继续用于微信小程序构建。

## 隐私边界

- 真实 DOCX、姓名/学号/手机号结构化文件位于根目录 `private-data/`，已被 `.gitignore` 排除。
- Agent 不读取、不复制、不提交 `private-data/`；测试使用虚构姓名和虚构学号。
- 公开 API 不返回学号、手机号、原始文件名或导入告警中的敏感值。
- 开发导入命令只接收运行时文件路径，路径和文件内容不得写入源码、测试快照或日志。

## 冻结接口

本轮前后端以以下路径和语义为准；字段细节见各任务卡。

```text
GET /api/public/tournaments/{tournamentId}/teams
GET /api/public/tournaments/{tournamentId}/teams/{teamId}

GET /api/admin/tournaments/{tournamentId}/team-registrations
GET /api/admin/tournaments/{tournamentId}/team-registrations/{registrationId}
```

公开端只读取已发布赛事、已批准报名和最新锁定名单快照。旧的 `GET /api/public/teams/{id}` 保留兼容，但必须修复为不可公开未发布赛事中的球队。

## 并行任务

| Agent | 分支 | 任务卡 | 独占写入范围 |
| --- | --- | --- | --- |
| AI-A | `ai/p2-roster-data-api` | `P2-SB-12-01-roster-data-api.md` | Prisma、contracts、API、迁移、后端测试 |
| AI-B | `ai/p2-public-h5-site` | `P2-SB-12-02-public-h5-site.md` | `apps/mini-program/` |
| AI-C | `ai/p2-admin-roster-review` | `P2-SB-12-03-admin-roster-review.md` | `apps/admin-web/` |

三个 Agent 不修改 `pnpm-lock.yaml`，不合并其他分支，不提交构建产物或真实个人数据。

## 集成顺序

1. 合并 AI-A，迁移空库并用虚构 fixture 验证导入和公开边界。
2. 生成/核对 OpenAPI，再合并 AI-B 的 H5 站点并替换适配器。
3. 合并 AI-C 的后台核对页。
4. 集成负责人使用本机 `private-data/` 执行真实导入；有告警时必须显式确认，不静默修正。
5. 运行全量检查、真实 PostgreSQL 集成测试、H5 桌面/手机截图检查和微信构建。
6. 交给只读复审任务 `P2-REVIEW-01-roster-web-slice-review.md`。

## 退出标准

- 两份报名表原件和结构化数据仍只存在本机私有目录。
- 导入重复执行不产生重复球队、球员或名单。
- 姓名不作为唯一匹配依据。
- 公开 H5 可在桌面和手机宽度浏览赛事、赛程、球队和公开名单。
- 管理后台可核对两队导入状态、人数、告警和锁定快照版本。
- 公开响应和日志均不包含学号、手机号或原始导入路径。
- `pnpm check`、H5 构建、微信构建和 PostgreSQL 集成测试通过。

