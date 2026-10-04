# Worker A：进球 GIF 与分用途图片

基线：`cf0c21226c5de01eea5c031e44b282deff322014`（`codex/release-account-only`）。实现位于独立 checkout 的 `codex/worker-a-goal-media`，未修改日常主目录、公开联调数据库或运行服务。

## 集成范围

- 新 Nest 模块：`apps/api/src/managed-media/`，通过既有 `media.module.ts` 引入。
- 新迁移：`prisma/migrations/20261004093000_managed_media_assets/migration.sql`。新增 `managed_media_assets` 表及 `schema.prisma` 中对应模型、Organization/User 反向关系；服务使用 Prisma 参数化查询。类型/状态使用字符串与 SQL CHECK，不新增共享枚举、契约、依赖或锁文件。生成客户端不提交。
- H5 组件：`apps/mini-program/src/features/managed-media/`。比赛事件旁可投稿、查看最新已通过 GIF；我的页面可管理个人背景、本人球员照片及投稿，总管理员可审核。球员弹窗可直接上传照片并刷新，球场继续显示号码。
- 既有账户头像裁剪及 `/me/avatar`、`/players/:id/avatar` 保持原有行为。新增 `USER_AVATAR` 是独立审核型媒体接口，不改变既有头像接口的契约。照片仅写 `PlayerProfile.portraitUrl`，不会写球员头像或账户头像。
- 共享 H5/微信页 `pages/me/index.tsx` 只增加平台组件挂点，默认 `index.tsx` 返回空；H5 使用 `index.h5.tsx`。本轮没有改变微信功能或构建微信版本。

## 配置与主集成 capability 衔接

使用主集成的 `XIAOQIU_FEATURE_GOAL_MEDIA` 开关；值规范与 ProductConfigService 一致：未设置、空串、`1` 或 `true`（忽略大小写及首尾空格）启用，其他值关闭。生产启用前必须配置持久目录。按钮始终使用正常名称、保持可点击；点击重新读取能力，关闭时提示“功能暂未开放”。本人撤回/删除及授权恢复不受上传开关影响。

前端只读取共享 `GET /api/me/capabilities`（`schemaVersion:1`），使用既有 `modules.goalMedia.enabled` 及 `goalMedia.submit / goalMedia.review / goalMedia.publish`，核对当前组织作用域。没有新增 capability 路由或动作名称。权限逻辑集中在 `media-policy.ts` 导出的 `mediaPermissions(session)`，与开关分开计算。

**基线尚未包含其他 worker 的 ProductConfigModule，因此本 commit 不合并或复制它。** `integration/managed-media-capabilities.patch` 是对主集成已有能力服务的最小补丁，须在其能力分支合入后应用：把 goalMedia 加入 implementedModules，并用 mediaPermissions 为三个已有动作生成作用域。补丁已在独立参考副本中通过 `git apply --check`。未应用此集成补丁时，H5 按共享能力返回“功能暂未开放”；改后端配置即可开启，无需改按钮。新增媒体路由也独立核对同一环境开关，前端不能绕过。既有头像/动态图片的配置由主集成衔接。

默认审核/直传仅 `PLATFORM_ADMIN` + `PLATFORM` 作用域。`MEDIA_REVIEW_ALLOW_ORGANIZATION_ADMIN=true` 可由后端明确开放本组织 `ORGANIZATION_ADMIN` 审核；仍不授予直传或编辑其他球员照片。`MATCH_REPORTER`、`OFFICIAL`、`REVIEWER`、赛事管理员不会自动获得媒体审核权限。

`MEDIA_ASSETS_DIRECTORY` 为绝对持久目录。生产启用新媒体时必须指定；开发默认使用仓库根 `private-data/media/managed`，路径与 dist/编译位置无关。多 API 实例须共享同一持久卷；该卷与 PostgreSQL 需一起备份。原始文件不会公开或保留，目录中只有重编码后的 `content` 和静态 `poster`。

## HTTP 契约

所有 JSON 接口要求当前有效账号会话；组织仅来自会话，不能由请求体指定。

| 方法与路由                                         | 行为                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| `GET /api/me/capabilities`                         | 主集成共享接口；使用已有 goalMedia 能力                |
| `POST /api/media-assets`                           | 上传并持久化；普通用户 PENDING，总管理员 APPROVED      |
| `GET /api/media-assets/mine?before=...`            | 本人全部状态，50 条/页，反馈、可见性与关联有效性       |
| `GET /api/admin/media-assets?before=...`           | 本组织授权审核者队列，50 条/页                         |
| `PUT /api/admin/media-assets/:id/review`           | APPROVE / REJECT；驳回必须填写原因                     |
| `PUT /api/media-assets/:id/visibility`             | HIDE / DELETE / RESTORE，均软操作                      |
| `GET /api/media-assets/matches/:matchId/goals`     | 每个真实事件最新 ACTIVE + APPROVED GIF，仅当前公开事件 |
| `GET /api/media-assets/users/:userId/presentation` | 当前组织用户已通过个人背景 `backgroundUrl`             |
| `GET /api/media-assets/:id/content`                | 重编码后的图片/GIF                                     |
| `GET /api/media-assets/:id/poster`                 | 静态 WebP 封面                                         |

上传请求：

```json
{
  "purpose": "GOAL_GIF",
  "targetId": "真实 MatchEvent UUID",
  "clientSubmissionId": "客户端生成并跨重试保留的 UUID",
  "dataUrl": "data:image/gif;base64,..."
}
```

`purpose` 为 `GOAL_GIF | USER_AVATAR | USER_BACKGROUND | PLAYER_PORTRAIT`。头像和背景的 targetId 必须为当前用户；球员照片只能为本人已关联球员或由总管理员上传。所有用途都验证目标组织。普通用户的新接口上传全部待审，不能在请求中指定审核状态。

审核请求 `{action:"APPROVE"|"REJECT", expectedVersion:0, reason?:"..."}`；可见性请求 `{action:"HIDE"|"DELETE"|"RESTORE", expectedVersion:0, reason?:"..."}`。修改使用行锁和版本比较，陈旧操作返回 409。上传按组织、本人、clientSubmissionId 幂等；不同文件/用途/目标重用同一标识返回 409。普通用户每天最多 30 件，总管理员 200 件，删除不会重置额度。

公开响应包含 `id/purpose/targetId/targetLabel/matchId/contentUrl/posterUrl/mimeType/bytes/width/height/frames/durationMs/createdAt`。本人及审核队列额外包含 `status/visibility/reviewReason/version/canRestore/associationState/uploaderUserId`。分页 `nextCursor` 是不透明的 `ISO timestamp|UUID`，下一页 URL 编码后原样发送；同毫秒投稿不会漏页。

## 存储、可见性与事件更正

- MIME 与真实解码格式必须一致；拒绝 SVG、视频、伪装或损坏文件、非规范 base64 和危险目标 ID。所有帧完整解码，再重编码并剥离元数据；不会使用用户给出的文件名或路径。
- GIF：输入/输出 ≤ 6 MiB，16–960 像素，2–120 帧，单次 ≤ 15 秒，总解码像素 ≤ 32 Mi。生成静态封面，编码为有限循环，客户端点击后播放一次并回到封面；加载完成后开始计时，离开可见页面停止，减少动画偏好默认显示静态封面，仍可明确点击播放一次。审核者及本人通过授权二进制请求预览待审 GIF，也仅点击才下载。
- 静态资料图片：JPEG/PNG/WebP ≤ 4 MiB，64–4096 像素，只允许单帧，输出 WebP ≤ 2 MiB。头像为 64–512 正方形，复用既有 72 KiB 归一化；个人背景最长边 1600，球员照片最长边 1200。
- 文件在 `<持久目录>/<organization UUID>/<asset UUID>/content|poster`，所有分量由服务器生成并校验。实际目录必须在持久根内，拒绝符号链接和越界路径；文件从不可覆盖的新目录写入，事务失败只清理该新上传。
- 未通过/隐藏/删除/已失效内容的二进制只能由投稿者或本组织审核者带会话读取。已通过、ACTIVE 且目标有效的媒体二进制可无会话访问，沿用现有公开头像媒体模式；有会话的跨组织请求仍拒绝。响应 `private, no-store`、`nosniff`，不缓存撤回内容；已下载字节不能追回。
- 隐藏与删除保留审核状态和文件，恢复不会把待审/驳回变为已通过。审核者隐藏/删除的内容只能由审核者恢复，投稿者不能绕过审核。恢复失效的已通过目标返回 409。
- 进球关联保存真实 `MatchEvent.id`、matchId 与事件指纹（球员/球队/类型/分钟/助攻/描述/顺序/创建时间）。读取、审核和恢复均核对。比赛报告确认会删除重建事件，旧媒体仅显示“关联已更正或撤销”，**绝不按分钟、姓名、号码或球员 ID 自动重绑**。更正后需对新事件重新投稿。
- 正式赛事的事件公开性使用既有 ResultsService 确认赛果；演示赛事采用 ExperienceService 相同的旧演示判定。未确认、草稿、取消或作废赛果不显示进球媒体。
- 图片审核、隐藏、恢复后重新选择该用途最新已通过图片；头像写 User.avatarUrl，真实球员照片仅写 PlayerProfile.portraitUrl。背景从独立媒体记录读取。三种用途互不覆盖。
- 上传、审核、可见性修改与状态在同一数据库事务内记录审计。软删除保留数据供恢复，本轮不加入视频转码、直播、自动补配、永久清除或垃圾回收。

## 验证与交接边界

见 `docs/testing/managed-media-worker-a.md`。主集成需要合入迁移及 Prisma 模型、应用共享 capability 补丁、生成客户端、配置持久卷后启用。不要用 schema push 替代已有 CHECK 约束迁移。没有推送、PR、合并或部署。
