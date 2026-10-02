# SCHEDULE-02：赛程跳转、返回与动画

2026-10-02 用户安排检查赛程相关页面跳转、点击逻辑和动画。依照[架构基线](../architecture/晓球产品与技术架构最终版.md)、[AGENTS](../../AGENTS.md)及[上一轮赛程任务](SCHEDULE-01-H5-赛程参考图.md)执行，仅推进桌面 H5。

## 修改文件

- `apps/mini-program/src/pages/readonly-schedule/desktop-schedule.h5.tsx`：全部跳转入口统一接入导航保护；“查看球队主页”指向所选球队详情；返回页面刷新主队；原生重试按钮支持键盘；接入结果和日期切换动画。
- `apps/mini-program/src/pages/readonly-schedule/schedule-interaction.h5.tsx`：一次跳转期间拦截重复点击、显示导航失败、复用现有顶部导航过渡、恢复 Taro 页面滚动位置与入口焦点、短动画及键盘/减少动画处理。
- `apps/mini-program/src/pages/readonly-schedule/detail-back.h5.ts`：比赛和球队详情的桌面键盘返回、重复点击保护；没有页面栈时进入明确的回退页面。
- `apps/mini-program/src/pages/readonly-schedule/detail-back.ts`：其他平台的空实现，沿用原行为。
- `apps/mini-program/src/pages/readonly-schedule/index.h5.scss`：按压、悬停箭头、跳转忙碌与错误反馈；减少动画和键盘操作边界。
- `apps/mini-program/src/pages/readonly-match-detail/index.tsx`：接入返回处理，H5 错误状态仍保留赛事参数。
- `apps/mini-program/src/pages/readonly-team-detail/index.tsx`：接入返回处理。
- 本任务卡。

没有新增依赖或公共契约变更。本轮未改共享导航正在进行的独立任务成果；调用其既有 H5 动画接口。两个详情页共享代码只增加平台模块调用，非 H5 模块为空实现；没有执行微信构建或真机验收。

## 已满足验收

1. 本地 API 的 28 场比赛逐个打开实际比赛详情；16 支球队逐个打开实际球队详情并核对 URL 中的球队与赛事 ID，每次返回一次到赛程。
2. 同一详情入口连续点击三次只进入一次；从比赛详情进入球队详情后，连续点击返回三次仍只回到比赛详情，再返回一次到赛程。
3. 返回保留比赛状态筛选和对阵图视图，恢复入口焦点。Taro 页面真实滚动位置实测为进入前 1251px、返回后 1251px。
4. 主队卡标题和队徽进入当前主队详情，“下一场比赛”进入该比赛。游客选择主队进入登录；未选主队的登录用户进入选择页。
5. 主队信息返回后重新读取；刷新期间保留已读取的主队，过期异步响应被忽略。
6. 列表/对阵图、筛选结果和日期周切换使用 160ms 的透明度/位移动画，按压反馈 120ms，悬停箭头 160ms；跳转复用顶部导航指示线及内容过渡。
7. 键盘 Enter 打开详情、Space 返回可用；键盘切换视图立即生效。系统减少动画模式下，不启动结果、日期与导航运动动画。
8. 直接打开加载失败的比赛详情时，键盘返回可进入带赛事 ID 的赛程；赛程错误状态的原生按钮可用 Enter 重试。
9. 768、1024、1440、1619px 无页面横向溢出，390px 使用原赛程组件。

## 命令与结果

- 启动现有本地 API：`node apps/api/dist/main.js`，使用现有本地演示环境配置，恢复 3001 服务；没有迁移或重新 Seed。
- `pnpm --filter @xiaoqiu/mini-program typecheck`：通过。
- 仓库现有 `eslint@10.5.0` 检查本轮六个 TS/TSX 文件：通过。
- 仓库现有 `prettier@3.8.4 --check` 检查本轮源码与样式：通过。
- `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --experimental-strip-types src/features/readonly-schedule/readonly-schedule.logic.test.ts`：9/9 通过。
- `pnpm --filter @xiaoqiu/mini-program build:h5`：通过，保留现有图片与应用入口体积警告。
- 浏览器自动验收：19 组交互检查（含全部 28 场/16 队），加 4 组嵌套返回和错误恢复检查，全部通过；没有捕获页面脚本异常。结果位于本次聊天可视化目录的 `interaction-results.json`、`nested-results.json` 和 `schedule-interaction-final.png`。
- `git diff --check`：本任务范围通过。

验证使用真实本地 3000 H5 / 3001 API。主队变更、无主队和 HTTP 503 为明确拦截的边界模拟，没有改写账号球队偏好或比赛数据；正常跳转与详情加载来自实际 API。

## 未解决问题与协调

其他三个赛事的 `competition-data` 仍返回 HTTP 422，正常切换成功尚未证明；已验证显式报错后可以返回当前演示赛事，需 API / 赛事上下文负责人处理。

公共文件及依赖变更建议：无。共享导航与数据页的其他任务成果按其独立提交处理。本轮只提交上述八个文件；不推送、合并或部署。
