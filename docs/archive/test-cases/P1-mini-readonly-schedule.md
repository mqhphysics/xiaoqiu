# P1 小程序只读赛程测试用例

## 覆盖范围

- 赛事列表、赛事详情、赛程列表、比赛详情、球队详情五个只读页面。
- 首页赛事赛程入口与 P0 快速上报入口共存。
- Mock fixture 回退、加载中、空态、失败重试。
- 赛程按日期和阶段分组，比赛状态区分未开始、已发布、已取消、已结束。
- H5 预览构建可用。

## 用例

| 编号 | 场景 | 步骤 | 期望 |
| --- | --- | --- | --- |
| P1-MP-001 | 首页入口 | 打开首页，点击“赛事赛程”模块；再返回首页查看“快速上报 Spike” | 进入赛事列表；快速上报入口仍可见且路径不变 |
| P1-MP-002 | 赛事列表 Mock 加载 | 不配置 `TARO_APP_API_BASE_URL`，打开赛事列表 | 展示 Mock 数据标识、赛事名称、赛季、时间、球队数和比赛数 |
| P1-MP-003 | 赛事详情 | 从赛事列表进入详情，点击“查看赛程” | 详情展示规则、球队入口、近期比赛；按钮进入赛程页 |
| P1-MP-004 | 赛程分组与状态 | 打开赛程页，观察日期、阶段和比赛状态 | 比赛按日期升序、同日期按阶段分组；状态文案为未开始、已发布、已取消、已结束 |
| P1-MP-005 | 比赛详情跳转 | 从赛程页进入任一比赛详情，点击主队或客队 | 展示比赛时间、场地、状态、取消原因；球队按钮进入对应球队详情 |
| P1-MP-006 | 球队详情 | 从赛事详情或比赛详情进入球队详情 | 展示球队简称、小组、队服颜色、教练、队长和成员预览 |
| P1-MP-007 | 失败重试 | 临时让仓储层请求抛错或传入不存在 ID | 页面展示失败态和重试按钮；重试后能恢复或保持明确错误 |
| P1-MP-008 | 纯函数测试 | 执行 `npx pnpm@11.5.2 --filter @xiaoqiu/mini-program test` | 覆盖赛程排序、日期/阶段分组、状态文案和状态 tone |
| P1-MP-009 | H5 预览构建 | 执行 `npx pnpm@11.5.2 --filter @xiaoqiu/mini-program build:h5` | H5 构建成功，新增页面可被 Taro 打包 |

## Mock Fixture 字段结构

- `tournaments[]`: `id`, `name`, `code`, `seasonName`, `organizationName`, `statusText`, `startDate`, `endDate`, `teamCount`, `matchCount`, `description`, `rules`, `teams`, `recentMatches`
- `teams[]`: `id`, `tournamentId`, `name`, `shortName`, `groupName`, `coachName`, `captainName`, `colors`, `rosterPreview`
- `recentMatches[]`: `id`, `tournamentId`, `stageName`, `groupName`, `roundName`, `scheduledStartAt`, `venueName`, `pitchName`, `homeTeamId`, `awayTeamId`, `homeTeamName`, `awayTeamName`, `status`, `statusReason`

## 与 P1 API 分支待对齐

- 当前前端仓储优先读取 `TARO_APP_API_BASE_URL`，临时约定 `GET /readonly-schedule` 返回完整 fixture；P1 API 分支落地后需替换为正式只读查询端点。
- 当前状态枚举为 `PUBLISHED`, `SCHEDULED`, `CANCELLED`, `FINISHED`；若 API 使用更细状态，需要在仓储层集中映射，避免页面分散处理。
- 当前页面消费 `scheduledStartAt`, `venueName`, `pitchName`, `statusReason` 等展示字段；API 字段命名确定后需在仓储层归一化。
