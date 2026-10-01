# V2 认证与对象授权入口

本模块沿用数据库会话，每次请求重新检查会话撤销、有效期、用户、组织、成员身份及未撤销角色。开发角色头和用户头不授予权限。首次后端修复中的登录歧义、注册、恢复限制和会话节流继续保留。

## 组织和赛事选择

- 正式组织选择头是 `x-organization-id`，必须是单个 UUID。带登录身份时必须与会话组织一致；没有显式选择时优先使用会话组织。
- 游客和登录入口可使用 `DEFAULT_ORGANIZATION_ID`。生产环境缺少明确组织配置会拒绝请求，不自动选演示组织。
- 非生产环境保留 `x-dev-organization-id` 作为组织选择兼容别名；与正式选择头冲突返回 400。它不代表角色或组织成员授权。
- `x-dev-role`、`x-dev-user-id` 不参与授权。
- `selectPublicTournament(prisma, organizationId, tournamentId?)` 只选择本组织、可用组织、同组织赛季下的 `PUBLISHED` 赛事。顺序是显式 UUID、`DEFAULT_TOURNAMENT_ID`、最新赛季下的已发布赛事。指定对象不可读取时拒绝，不回退到另一个赛事。
- 首页、搜索、社区列表、主队可选列表支持可选 `tournamentId` 查询参数；数据、球队和球员读取也校验实际选择。请求/响应 JSON 的原字段不变。赛事上下文在前端的持久化及共享契约更新由集成负责人协调。
- 当前社区发布和主队保存回读仍使用部署默认赛事；跨赛事写入参数尚未形成公共契约，不能声称客户端完整切换已实现。

## 服务层使用

`AuthModule` 导出 `AuthService`、`AccessPolicyService`。先取得新鲜会话，再立即校验对象范围，最后在应用服务事务中写业务记录、审计及 Outbox。

```ts
const session = await this.authService.requireSession(authorization)
await this.accessPolicy.requireMatchReporter(session, matchId)
// All subsequent reads/writes remain scoped by session.organizationId.
```

| Helper                                                  | 返回                            | 权限含义                                                    |
| ------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| `requireSession(authorization)`                         | `Promise<AuthenticatedSession>` | 实时校验身份；失效返回 401                                  |
| `isOrganizationAdministrator(session)`                  | `boolean`                       | 平台范围管理员或当前组织范围管理员                          |
| `requireOrganizationAdministrator(session)`             | `void`                          | 组织级基础资料操作                                          |
| `administeredTournamentIds(session)`                    | `Promise<string[] \| null>`     | 赛事管理员的实际授权赛事；`null` 表示组织范围               |
| `requireTournamentAdministrator(session, tournamentId)` | `Promise<void>`                 | 对象必须属于当前组织，且有对应组织/赛事管理权               |
| `requireTeamCaptain(session, teamId, tournamentId?)`    | `Promise<void>`                 | 仅明确授权的本队；给定赛事时核对参赛关系                    |
| `requireMatchReporter(session, matchId)`                | `Promise<void>`                 | 组织/赛事管理员，或明确 `MATCH` / `TOURNAMENT` 范围的信息员 |

跨组织对象返回 404，同组织但无相应权限返回 403。不能把普通角色名称解释成全组织、全赛事授权，不能缓存这次请求的角色判断供下一次使用。名单资格、截止时间、锁定版本和报告状态校验仍由对应应用服务完成。

## HTTP Guard 接线

`AuthModule` 注册全局 `AuthContextGuard`。它使用 Express 实际匹配的路由模板，并规范化大小写和尾斜杠，避免请求 URL 的不同写法跳过授权。

既有赛程/名单读取的授权范围有明确路由表。旧 `schedule/dev-context.ts` 名称暂留作适配，但只消费服务端已验证的会话、组织和对象授权标记，不读取开发角色头。工作台只返回当前管理员有权管理的赛事及关联资料。

新的 `admin` handler 默认拒绝。需要由新模块自己的应用服务执行权限时，显式使用以下元数据；该装饰器只声明授权交接，**不授予管理员权限**。每个 handler 对应的应用服务仍必须调用真实 `requireSession` 和对象策略，不能仅用装饰器返回业务数据。

```ts
import { AuthorizeInApplicationService } from '../auth/application-authorization'

@AuthorizeInApplicationService()
@Post('admin/match-reports/:id/confirm')
confirm(/* ... */) {
  return this.reportService.confirm(/* ... */)
}
```

既有实名目录和反馈审核继续执行原应用服务授权。私有响应使用 `private, no-store`，公开响应按组织选择头设置 `Vary`。

## 公开资料与赛程保护

- 搜索球员必须存在所选赛事已批准报名的锁定名单；搜索球队只返回已批准参赛球队；搜索比赛排除草案。
- 球员号码和球队来自最近锁定版本，公开映射不返回完整学号、绑定邮箱、密码或会话令牌。本人资料仍允许本人读取受限字段。
- 未发布赛事、草案比赛和待审球队不能通过对应公开详情或搜索进入结果。
- 草案创建只允许 `DRAFT`、未加入草案、没有已发布修订且没有任何比分的比赛。事务内预留避免两个草案抢走同一场比赛。
- 赛程发布用草案及比赛的条件更新保护；已进行、结束、发布或已有比分时拒绝覆盖。失败时修订、比赛状态、审计和 Outbox 一起回滚；重复发布保持既有 409 语义。
- 正常已确认比赛结果受到非草案/已发布修订/比分条件保护。独立确认报告关系尚不在本提交基线 schema 中；其额外谓词在集成负责人发布模型后接入并另验。

## 验证与尚未交付

专属测试使用真实 AuthService、Prisma、独立 PostgreSQL 和 HTTP。队长/信息员策略通过测试专属 handler 调用，并非名单/报告完整工作流。需要提供独立 `TEST_DATABASE_URL`；本专属测试缺少配置时直接失败，不静默跳过。日常数据库不能用于测试；CI 使用仓库既有的可弃 `xiaoqiu_ci` 服务。

固定七天会话、默认关闭的演示身份恢复保持原策略。未实现自动续期、设备管理、邮箱发送/验证、正式恢复、通知设置、压测、生产备份或部署；前端和微信未修改。
