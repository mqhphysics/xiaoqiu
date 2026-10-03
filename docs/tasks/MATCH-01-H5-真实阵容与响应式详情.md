# MATCH-01：H5 真实阵容与响应式比赛详情

用户要求比赛详情改为响应式弹窗/手机抽屉，明确真实首发、替补与比赛事件，并保留晓球既有深绿、金色、砖红视觉。工作树 `release-match-detail`，分支 `codex/release-match-detail`，基线 `565ae8d`。

## 写入范围

- `apps/mini-program/src/components/match-overlay/`：一次挂载的 H5 详情 Host、真实 API 读取、错误重试、焦点管理和滚动锁；其他平台空 Host。
- `apps/mini-program/src/components/match-trigger/` 与 `features/product/match-navigation.*`：全站统一入口，H5 所有宽度打开弹层，其他平台保留页面导航。
- `features/readonly-match/`：H5 评分/评论与战报内容、首发球场和名单、独立替补列表、事件时间轴、展示纯函数及回归。
- `pages/readonly-match-detail/index.h5.tsx`：直接访问链接时复用同一详情，缓存页面隐藏时移除 Portal，关闭时返回赛程。
- `pages/readonly-schedule/schedule-interaction.h5.tsx` 和 `schedule-compact.tsx`：桌面及移动赛程入口。共享 compact 仅改为平台导航模块；微信模块仍导航至原比赛页面并保留赛事参数。

## 行为与边界

1. 首发由 API 明确 `starter` 标记决定，绝不从报名名单或前 11 人推断。没有正式出场记录则展示尚未公布。
2. 阵型和坐标只有 API 提供时使用；缺失时显示“阵型：未提供”和“站位未提供”，球场背景内以非战术名单网格展示真实首发。没有读取私有队长阵容计划。
3. 桌面展示双方，720px 以下切换单队并保留辅助名单。首发/替补分组展示出场分钟，未出场替补有文字说明。
4. 每次配对换人均保留：`player=换下`、`relatedPlayer=换上`。替补先上后下和多次上下场均显示完整分钟。进球/助攻只从当前事件计算，乌龙球单独标识，点球未进不增加进球。
5. 球员按钮可触摸/键盘展开详细分钟和资料入口；事件时间轴明确“换下/换上”，不会把换上球员称作助攻。
6. X、Escape 与浏览器 Back 关闭；重复打开同场比赛不叠加历史，重复关闭在 popstate 到来前有锁。打开球队/球员/人物资料立即清理比赛 marker 和内容，使现有资源详情可见；不用异步 Back 误关新资源弹层。
7. 仅调用真实 Repository，API 失败明确报错并提供重试。没有添加 Mock、依赖、公共契约、迁移或私有数据。

## 集成接线

- `app.tsx` 一次挂载 `import { MatchOverlayHost } from './components/match-overlay'`、`<MatchOverlayHost />`。此公共文件由集成负责人修改。
- 首页、数据、球队、球员及通用比赛卡入口调用 `openMatch(matchId, tournamentId)`；已有路由字符串可用 `openMatchFromUrl(url)`。赛程已接线。
- 公开类型由集成负责人加入 `formation: string | null`、`lineupSource`、`pitchPosition: { x, y } | null`；没有依据的正式位置必须返回 null。展示兼容字段缺失。
- 测试命令需注册 `src/features/readonly-match/lineup.logic.test.ts` 与 `navigation.logic.test.ts`。

## 验证

- 固定锁离线安装通过：`pnpm --trust-lockfile install --offline --frozen-lockfile --store-dir ../pnpm-store`。
- `node node_modules/typescript/bin/tsc -p apps/mini-program/tsconfig.json --noEmit`：通过。
- 本任务 TS/TSX 范围 ESLint：通过。
- 新增 Node 回归 7/7：配对换人、先上后下、分钟、正确统计、更正撤销、明确首发、有效 URL、Back/关闭重开及异步重复关闭。
- 合并执行现有赛程、quick-report 与新增详情回归：27/27，通过，无跳过。
- `node node_modules/@tarojs/cli/bin/taro build --type h5`：首次沙箱执行因 esbuild 无法读取上级目录失败；同一隔离构建经执行权限重试通过，保留既有图片及应用入口体积警告。后续集成浏览器验收单独记录。
- 详情内容按需分包，并与真实 API 请求并行加载；代码或 API 加载失败均进入可重试错误状态。分包后的 H5 构建再次通过。

全新数据库、seed、后端角色/事件流程和浏览器桌面/手机联调由集成负责人统一执行。未执行微信构建或真机测试，未启动/修改日常 API、数据库、Worker，未 push、PR、合并或部署。

# 真实浏览器复核修复

- 实际 Chrome 验收确认 Taro 浏览器 Back 会替换赛程源按钮 DOM；MatchOverlayHost 现在以同一路径的可访问标签/完整链接恢复新按钮焦点，资源导航取消恢复避免抢焦点。
- 实际手机验收确认 Taro navigateTo 不触发原生 hashchange；MatchOverlayHost 订阅 \_\_afterTaroRouterChange，在真实路径改变时清除比赛层，使球队/球员页面可见。
- 焦点身份回归新增 3 项，结合阵容和 history 回归 10/10 通过；H5 TypeScript、改动 ESLint 通过。完整浏览器复核等待集成后的统一 H5 构建。
- 专用 task 测试数据库已正式 HTTP 确认的虚构比赛 d825b51f-9181-4bda-97ac-ff0d3ded93f5，desktop1440/phone390 真实 GET 与展示逐项一致：每队 8 首发+2 替补、8 事件、50′及72+1′两次成对换人，替补先上后下及65′进球/助攻；无阵型/站位如实显示未提供。该 fixture 的 appearance 由授权测试 setup 明确建立，事件通过真实 submit/confirm，不代表生产赛事事实。
