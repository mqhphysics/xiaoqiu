# 产品配置与账号能力 v1

`GET /api/product/config` 可匿名访问，只返回产品开关，不包含组织、账号或赛事数据。`GET /api/me/capabilities` 必须由 `AuthService.requireSession` 当次验证会话；组织选择不一致返回 403。名称含 `public/` 的球队、赛事等业务接口继续要求登录。

公共契约源为 `packages/contracts/src/product-config.ts`，集成负责人将它从 contracts/index 导出，并在 AppModule 接入 ProductConfigModule。当前固定 `EIGHT_A_SIDE / playersPerSide=8`；`accountRequired=true / serverGuestAccess=false / guest.enabled=false` 不受环境变量覆盖。游客按钮保留原名称并可点击，未开放点击提示“功能暂未开放”，不写游客存储、不导航。未来开放匿名业务需要真实服务端授权及会话边界实现，不能只改一个显示开关。

模块环境变量只接受 `1`、`true` 开启及 `0`、`false` 关闭，大小写和首尾空格归一；未指定保留现有功能，其他非空值按关闭处理：

| 模块                 | 环境变量                              |
| -------------------- | ------------------------------------- |
| home                 | XIAOQIU_FEATURE_HOME                  |
| schedule             | XIAOQIU_FEATURE_SCHEDULE              |
| data                 | XIAOQIU_FEATURE_DATA                  |
| teams                | XIAOQIU_FEATURE_TEAMS                 |
| community            | XIAOQIU_FEATURE_COMMUNITY             |
| teamManagement       | XIAOQIU_FEATURE_TEAM_MANAGEMENT       |
| matchReporting       | XIAOQIU_FEATURE_MATCH_REPORTING       |
| administration       | XIAOQIU_FEATURE_ADMINISTRATION        |
| directMessages       | XIAOQIU_FEATURE_DIRECT_MESSAGES       |
| identityApplications | XIAOQIU_FEATURE_IDENTITY_APPLICATIONS |
| goalMedia            | XIAOQIU_FEATURE_GOAL_MEDIA            |

身份申请和进球媒体作为预留键始终关闭，相关 actions 始终无 scopes；A/B 的真实服务和策略接线后，由集成负责人明确启用并补对应路由与验收，不能仅设置环境变量宣称实现。开关值在 API 进程环境中读取，改变部署环境后按正常发布流程重启。`revision` 是规范化公开配置的确定性摘要，与私有用户信息无关。

已实现模块通过全局 ProductModuleGuard 检查明确的已注册 route template，关闭的直接 HTTP 请求返回 403 `功能暂未开放`。健康、登录、注册、注销、配置、非私有媒体文件发送不受它拦截；AuthContextGuard 和应用服务对象权限继续执行。模块开关是功能开放策略，不是字段隐私策略：聚合首页、搜索及人物详情的摘要字段仍由原业务接口和对象授权控制。新增模块或路由必须扩展稳定契约和 guard 映射并测试，不能承诺任何未来功能零前端开发。

能力服务重新查询未撤销且 `grantedAt<=now` 的角色；球队、赛事、比赛查询均附当前组织，随后复用实际 AccessPolicyService 对每个候选范围核验。私信发送复用现有 `canSendDirectMessages`，仅 PLATFORM scope 的 PLATFORM_ADMIN 有此能力。能力是入口提示，命令仍校验真实会话、对象关系、当前状态、版本和幂等，不能把能力快照或客户端角色声明当写权限。

前端 `productConfigRepository` 匿名配置请求不发送 token/组织；配置 hook 首次及窗口 focus 刷新，获取失败/未知 schema/缺失键关闭入口。`runFeatureAction` 为未开放按钮提供统一提示，已开放执行原业务动作；`capabilityAllows` 只判断同类型同 ID 的明确 scope。组织级管理能力返回 ORGANIZATION scope，调用方应按当前组织上下文判断；最终服务端仍核对对象。登录页已使用配置，其余公共导航与角色入口由集成负责人接此 repository/helper，避免与其他任务的壳层和“我的”页面冲突。

微信共享登录页仅新增可选 guestPolicy；未传属性时保留原 allowGuest 行为。本轮只构建与验证 H5，微信构建/真机不在此子任务验收范围。

本分支验证（2026-10-04，Node 22.14.0）：API 配置/能力/HTTP 定向测试 11/11，H5 全量测试 85/85，contracts/API/H5 TypeScript、变更范围 ESLint 与 H5 构建通过。H5 构建保留既有资产/入口体积警告。API 单元和 HTTP 测试使用明确测试 fixture/mock，不连接公网或真实组织数据库；HTTP 测试只临时监听随机 loopback 端口并在 after 关闭，没有保留预览服务。生产模块接线、A/B 真实数据库权限、整轮数据库回归及浏览器截图由集成负责人验收；没有在当前公网数据库执行迁移或更改现有服务。
