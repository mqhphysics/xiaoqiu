# RELEASE-08：八人制、后台能力与联调集成

基线 `cf0c212`，集成分支 `codex/eight-integration`，独立工作树 `task/eight-integration`。
用户授权并行本地实现、验证、集成分支 push，以及隔离联调库模拟业务数据导入和本机 API 同步。不开 PR、不合并 main。
公开 Sites 发布仍由父任务负责，其他任务不得重复发布。原日常 3000/3001 与手动 Worker 不被替换；专用联调 API/Worker 是单独受管理的进程。

## 分工与公共文件

| 任务 | 独占范围 | 交付 |
| --- | --- | --- |
| 阵容任务 | lineup-plan controller/dto/rules/service/tests；H5 captain-roster 阵容、readonly-match 阵容展示 | 独立 commit，root 整合 |
| 功能能力任务 | 新 product-config API/前端模块；登录游客入口；新 contracts/product-config.ts | 独立 commit，root 接 AppModule/contracts 出口 |
| A（01a104bf-fd3e-76bc-bfa6-4cc82439d00e） | 进球 GIF 上传审核、头像背景和球员照片 | 本地 commit/补丁；不得覆盖 B 的整页 |
| B（01a104c0-3948-71fd-8eb6-7edcf669a021） | TEAM_COACH、身份候选/申请/审核、我的入口 | 本地 commit/补丁；教练策略供阵容任务复用 |
| root | shared schema/迁移协调、ExperienceService、product.types、公共组件冲突、验收文档、最终集成与推送 | 一个集成分支 |

公共枚举/模型不能各自产生不兼容的版本。A/B 的迁移用独立时间戳；root 阵容迁移名 `20261004023800_lineup_confirmation`。
没有内部跨线程通信工具时，父任务转达接口/迁移信息。不得用外部消息应用替代。

## 稳定能力契约

匿名 `GET /api/product/config` 只返回产品配置；已登录 `GET /api/me/capabilities` fresh 读取账号、有效角色与对象范围。
契约有 `schemaVersion/revision`、认证要求、游客入口、固定八人制、稳定模块键、action 与 scopes。
游客按钮名称不附加“暂未开放”，始终可点击；当前点击提示“功能暂未开放”，不进入业务、不创建游客会话。
本轮服务端继续拒绝匿名球队/赛事读取，配置开关不能授予角色或绕过对象授权。未实现的 action 默认关闭。
其他功能沿用可点击反馈规则。配置缺失/获取失败 fail closed，但账号登录与健康检查仍可用。
现有数据在稳定契约内新增、修改、删除不要求同步改前端；新增全新交互仍可能需要客户端实现，不承诺一切未来修改零前端工作。

## 阵容事实契约

只提供八人制（8 个首发位，恰好 1 名 GK）；不再提供 5/7/11 人制选项。
TACTIC 是球队默认方案，MATCH_LINEUP 是具体比赛草稿；每队只一个 default，每队每场只一个 confirmed plan。
保存计划不是确认首发。确认指向不可变 revision，保存后续草稿保留旧确认并标示“有未确认修改”；必须明确重确认才能更新公开首发。
默认/确认写操作都必须 scope 校验、CAS、Idempotency-Key、事务与审计；比赛开始后不得改赛前确认。
确认使用当时锁定名单与快照，不用后来的名字/号码覆盖历史。队长/教练权限由 B 的真实对象策略复用。
公开球场号码优先。真实 appearances 存在时使用正式出场；只有确认方案时标“已确认赛前首发（实际出场未录入）”、`appearanceRecorded:false`、`minutesPlayed:null`。
没有确认且没有正式事实时显示未确认，不能从球队默认/名单/计划推导实际首发；比分、进球、助攻、换人等只取真实记录。

## 角色与媒体安全

PLATFORM_ADMIN（PLATFORM 范围）与 ORGANIZATION_ADMIN（组织范围）不是同一个权限，不因 UI 的“总管理员”称呼提升权限。
学生、球员、队长、教练（可兼球员）、信息员通过真实角色/关联展示。姓名匹配只提供候选，需确认、证明与管理员审核，不自动授权。
头像背景与球员照片分别存储和展示，不互相覆盖。GIF 绑定实际进球事件，审核只改变该对象的可见状态。

## 当前公网问题与数据步骤

现有新组织没有赛季/赛事。首页 getHome 404 不能显示为网络故障；H5 需再查已发布列表，成功且空才显示“暂无已发布赛事”，网络/权限/错误配置仍报错。
Sites 的 meta CSP 当前仅有临时 API connect-src，应加 `'self'` 允许同站 Cloudflare challenge 请求，不扩大为任意来源。
专用 DB 导入前已 pg_dump 备份。仅复制标为虚构的 2026 16 队、四组前二晋级八强、14 人名单、八人制比赛和真实演示事件/出场。
只白名单业务模型，不运行全量 seed，不复制账户/密码/会话/角色；保留 trial-owner 和用户写入，不改密码、不读取备份私有内容。
当前公网 DB 先只导业务数据；新迁移需先隔离验证，再按用户本机 API 同步授权安排并再次备份，不能自动对未验收的 schema 升级。

## 验收

- 空组织真实 HTTP：有效账号 home404，已发布赛事列表200空；匿名401。H5 空状态和真实错误分别回归。
- 固定8 DTO/UI；默认/确认区分、不可变 revision、幂等、CAS、跨队403、角色撤销、未开赛约束。
- 能力配置匿名可读且不泄漏用户，guest仍拒绝；模块关闭后客户端反馈与服务端拒绝均验证。
- A/B 的审核、媒体和身份对象隔离、未授权拒绝、幂等与审计，不从姓名推断权限。
- 空库全部迁移、业务导入两次不重写、lint/typecheck/test/build、H5 desktop/mobile 的真实 API 操作。
- 记录未测的物理手机/Safari、长期稳定性、灾备恢复与负载；不把 mock 或 Chrome 手机模拟称为实体端验收。

## 已验证阶段（2026-10-04，全集成尚未完成）

空赛事/模拟事实热修 `bf9c384e1e563b8a0649e37401d250ca4f517d66` 已推独立分支 `codex/h5-empty-organization`，GitHub CI `37173871765` 成功。
本机专用 API 已同步热修，HTTPS readiness200、真实匿名管理中心401；专用 Worker 与 Quick Tunnel 保留，没有对公网库应用新schema。
模拟业务导入首次1476行、第二次0行；账号、凭据、会话、角色及已有用户球队均保留。
实际只读应用服务DTO验证16参赛队/32比赛/17目录队、四组前二晋级8强、已赛58侧各8实际首发、3未开始比赛无实际出场或事件。
这项服务诊断不是已登录公开浏览器验收。

父 Sites version4 已发布热修，同URL/API origin/org；桌面1440与手机390 Chrome模拟登录资源、真实跨域HTTP、无溢出及CSP检查4/4通过。
`connect-src 'self'` 与精确API来源已在公开版本生效，旧CSP阻断已消除；匿名管理探测导致的预期401控制台消息不被误报为产品连接故障。

root 新规程写入固定8、省略则保存8，管理H5取消5/7/11新规程；历史已发布内容仍按不可变版本读取，不批量改历史。
模块关闭还覆盖新增阵容default/confirm端点，不能通过直接HTTP绕过关闭的入口。
独立空库 `xiaoqiu_eight_integration_test_20261004` 的17项迁移成功；定向API/Nest HTTP/真实PostgreSQL25/25、管理规程逻辑9/9、改动lint、API测试编译、H5/Admin类型检查与Prisma验证通过。

公开confirmed revision映射、未来游客入口/模块按钮接线正在各独立worktree补齐；A/B媒体与身份成果尚待集成。
最终必须再建空库覆盖全部合并迁移、seed两次、完整质量门、备份恢复演练及受控公开API同步，不能把上面的定向结果称为全集成验收。
