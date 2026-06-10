# Spike-01 Taro 复杂表单与弱网草稿

## 结论

**通过。**

Taro + React + TypeScript 可以承载快速比赛报告的长表单、动态事件、本地草稿、弱网保留和版本冲突对比。微信小程序与 H5 均构建成功，未发现阻断性组件兼容问题；当前原型不需要引入重量级状态管理或第三方表单组件。

## 使用版本

```text
Taro                 4.2.0
React                18.3.1
TypeScript           5.9.3
Node.js（验证环境）   24.15.0
pnpm                 11.5.2
```

## 原型位置

```text
apps/mini-program/src/pages/quick-report/
apps/mini-program/src/features/quick-report/
apps/mini-program/src/index.html
```

首页提供“P0 · SPIKE 01”入口。原型使用 Taro 原生 `View`、`Text`、`Input`、`Textarea` 和 `Button`，数据访问通过 repository 隔离。

## 已验证场景

### 复杂表单

- 主客队比分编辑。
- 正常完赛、主队弃权、客队弃权和比赛中止。
- 动态新增、编辑和删除进球事件。
- 长备注和底部固定提交操作区。
- 提交前确认。

### 本地草稿

- 草稿 key 为：

```text
draft:{organizationId}:{matchId}:{userId}:{reportType}
```

- 修改后 650ms debounce 保存。
- 页面进入后台或卸载时立即补写草稿。
- 草稿保存 `baseVersion`、基线字段、当前字段和保存时间。
- 进入页面自动检测草稿；版本一致时恢复，版本变化时进入冲突页。
- 超过 7 天的草稿自动失效。
- 提交成功或用户主动丢弃后删除草稿。

### 弱网与生命周期

- mock repository 可切换为“提交断网”模式。
- 网络失败前先落本地草稿，失败后不清除输入。
- 页面进入后台后不发起新的版本检查；回到前台后按需检查当前服务端版本。
- 后台期间完成的 mock 请求结果不会直接覆盖页面编辑状态。

### 版本冲突

- mock repository 可模拟另一位信息员提交并增加服务端版本。
- 冲突页同时展示“我的提交”和“当前数据”。
- 用户可以显式放弃本地修改。
- “保留无冲突修改”使用三方合并：仅本地修改的字段保留，仅服务端修改的字段采用服务端值，双方同时修改的字段标记冲突并采用当前服务端数据，不静默覆盖。

### 自动化验证

- 草稿 key 组成。
- 新鲜草稿恢复、版本变化冲突和 7 天过期判断。
- 非冲突字段三方合并。
- 双方同时修改同一字段时不静默覆盖。
- 微信小程序构建成功，并生成快速报告页面的 JS、JSON、WXML 和 WXSS。
- H5 构建成功，生成 `index.html`，本地静态烟测首页和主脚本均返回 HTTP 200。
- TypeScript、ESLint、Prettier 和 5 项纯逻辑测试通过。

## 阻塞点

无阻断问题。

非阻断观察：

- H5 生产构建入口约 301 KiB，超过 webpack 默认 244 KiB 建议值。当前主要是 Taro/H5 运行时基线体积，P1 页面增加后应再评估分包和按需加载。
- H5 构建出现 webpack 持久化缓存的 `NullDependency` 序列化警告，不影响本次产物。
- 未使用微信开发者工具真机验证输入法、安全区和低端机滚动性能；正式快速报告页面进入 P3 前需要补真机测试。
- 本任务按任务卡使用 mock repository，不验证真实上传、真实 HTTP 超时、TanStack Query 或后端幂等处理。

## 采用方案

1. 保留 Taro 原生表单组件作为快速报告关键路径的默认实现。
2. 保留 repository 边界，页面不感知 mock、HTTP Client 或本地存储细节。
3. 保留纯函数实现草稿 key、恢复判断和三方冲突合并。
4. 不为单页表单引入全局状态管理；使用页面 state、ref 和小型 repository 足够。
5. 正式实现继续在 `useDidHide`、`useDidShow` 和 `useUnload` 中处理保存与恢复，但真实请求层需要支持取消或忽略过期响应。

## 替代方案

- 若后续第三方组件在微信端出现兼容问题，关键输入继续使用 Taro 原生组件封装。
- 若表单字段显著增加，可引入轻量 reducer 管理页面状态，但不直接升级为全局状态库。
- 若真实 API 请求缓存库在小程序端不稳定，保留生成 API Client，使用当前 repository 接口接入轻量 Query Store。

## 后续 API 契约建议

读取快速报告：

```http
GET /matches/{matchId}/quick-report
```

建议响应：

```json
{
  "matchId": "match_001",
  "version": 3,
  "homeTeam": { "id": "team_home", "name": "绿茵学院" },
  "awayTeam": { "id": "team_away", "name": "星火学院" },
  "report": {
    "homeScore": 1,
    "awayScore": 0,
    "outcome": "FINISHED",
    "goals": [],
    "notes": ""
  },
  "updatedAt": "2026-06-10T12:00:00.000Z"
}
```

提交快速报告：

```http
POST /matches/{matchId}/quick-report
Idempotency-Key: <client-generated-uuid>
```

建议请求：

```json
{
  "expectedVersion": 3,
  "report": {
    "homeScore": 2,
    "awayScore": 1,
    "outcome": "FINISHED",
    "goals": [
      {
        "clientEventId": "goal-local-001",
        "teamId": "team_home",
        "minute": 18,
        "scorerPlayerId": "player_007"
      }
    ],
    "notes": "现场已与双方确认"
  }
}
```

版本冲突使用实施方案中的统一错误结构：

```json
{
  "code": "MATCH_VERSION_CONFLICT",
  "message": "比赛数据已被其他人员更新",
  "requestId": "req_xxx",
  "details": {
    "expectedVersion": 3,
    "currentVersion": 4,
    "changedFields": ["awayScore", "goals"],
    "currentResource": {}
  }
}
```

建议后端同时返回当前可见资源，避免小程序在弱网下为冲突页额外请求一次。`currentResource` 仍需经过比赛作用域权限和字段可见性过滤。

## 是否需要 ADR

不需要。原型验证结果符合既定的 Taro 技术路线，没有更换框架、契约源或状态管理方案。
