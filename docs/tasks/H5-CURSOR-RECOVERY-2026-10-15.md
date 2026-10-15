# 桌面 H5 光标恢复与游客登录入口修复

日期：2026-10-15。

分支：`codex/h5-cursor-recovery`，从刷新后的 `origin/main`（`4f75a23`）建立。
独立工作目录：`D:/MuDevSpace/xiaoqiu/.worktrees/h5-cursor-recovery`。
本轮文件同时同步到日常网站目录，复用 `http://127.0.0.1:3000/` 和已有真实 API；没有另开端口。
原工作目录的小程序、注册和启动脚本等未完成改动保留，不纳入本轮提交。

## 问题与结果

- 光标资源没有丢失。共享 App 曾移除 `mountCursorSkin`，导致原有默认箭头、足球和登录页分界线变形不再挂载。现在由 H5 专属 `AccountBoundary` 挂载、卸载，覆盖登录页和网站页面。
- 原默认箭头和足球的 1x/2x PNG、SVG 及变形轮廓继续复用，相关原文件无变化；登录页版式不变。
- 游客账户菜单的“登录或注册”曾调用个人中心回调，进入 `runNavigationEntry('me')` 后被私有入口检查阻止。现在该按钮直接返回独立登录页；已登录账号仍使用个人中心回调。后端权限与业务入口检查不变。
- 保留并接入 18 种状态：默认、足球、链接手形、文字、禁止、等待、后台加载、移动、抓取、抓住、精确选择、四方向缩放、帮助、放大、缩小。原有 CSS 语义和 Taro 可点击元素仍决定对应状态。
- 链接手形简化轮廓，使用浅鼠尾草绿填充、深绿细描边、珊瑚色掌纹。手形、抓取和抓住输出平滑透明 PNG。
- 加载环为六段圆角环形梯形，三深三浅。深浅共用边界在初始角度 -120°，橙色弧线从同一半径起笔，覆盖 60°；绿环和橙色弧线作为整体以 1.2 秒一周匀速旋转。
- 等待状态显示单独旋转环；后台加载状态保留箭头，旁边旋转同一环。提供 24 帧、每帧 50ms 的独立透明图片和 GIF 预览，网站使用同源 SVG 与 CSS 连续旋转。
- 只有变形或加载时临时使用不接收点击的浮层。动画图片未完成解码、损坏或用户开启减少动态效果时保留原生静态图片光标；提交中 `aria-busy` 优先于禁用状态。离开页面、失焦、元素移除等情形会清除临时隐藏鼠标的状态。

## 修改文件

| 文件 | 用途 |
| --- | --- |
| `apps/mini-program/src/components/account-boundary/index.h5.tsx` | 恢复 H5 全站光标挂载 |
| `apps/mini-program/src/components/account-boundary/index.h5.test.mjs` | 已有渲染测试隔离浏览器光标依赖 |
| `apps/mini-program/src/components/auth-cursor/index.h5.ts` | 六段加载动画、静态回退、禁用按钮优先级及浮层清理 |
| `apps/mini-program/src/components/public-shell/account-card.h5.tsx` | 游客登录按钮直接返回登录页 |
| `apps/mini-program/src/assets/login-art/cursors/loading-ring.svg` | 六段加载环源图 |
| 同目录 `busy-32.svg`、`progress-32.svg`、`hand-32.svg` | 加载及简化手形的矢量源图 |
| 同目录 `busy`、`progress`、`hand`、`grab`、`grabbing` 的 `-32.png` / `-32@2x.png` | 十张透明原生光标资源 |
| 同目录 `manifest.json` | 素材、热点、挂载与动画参数说明 |
| `scripts/build-cursor-assets.mjs` | 从矢量源图生成相关 PNG，按需输出 24 帧、GIF 和总览 |
| `scripts/verify-cursors-h5.mjs` | 真实 API / 日常网站及正式构建的无界面浏览器回归 |
| 本文 | 验证记录与交付边界 |

## 检查结果

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 全工作区通过；最终光标调整后前端类型检查再次通过 |
| `pnpm test` | 未全通过：前端 174/174、管理中心 25/25、Worker 21/21；API 184 通过、24 失败、6 跳过。失败均在缺少隔离测试数据库 `TEST_DATABASE_URL` 的前置条件；没有把它们记为通过 |
| 最终 `npm --prefix apps/mini-program test` | 174/174 通过，零跳过 |
| `npm --prefix apps/mini-program run build:h5` | 通过，保留 17 项既有 Sass / 体积警告。最终构建使用日常网站的公开 API 地址和组织标识，未把该运行配置写入源码 |
| 本轮六个代码/验证文件 ESLint | 通过 |
| `git diff --check` | 通过 |
| 36 张原生 PNG | 尺寸与文件名匹配、保留透明通道；默认箭头和足球原文件未修改 |
| 加载 GIF | 24 帧、每帧 50ms、循环播放 |
| 日常网站与正式构建浏览器验证 | 各 10 项通过，页面脚本错误和 HTTP 错误均为零；连接真实本地 API，无伪造 API 成功响应 |

浏览器检查覆盖：登录→游客首页→账户菜单→返回登录、足球与快速反向越界变形、全部 18 种光标、加载旋转、鼠标不动时忙碌/禁用/恢复、加载元素移除、减少动态效果、动画图片损坏回退、配置不可读时仍可返回登录、2x 高分屏、390×844 触屏无自定义鼠标且无水平溢出。

首次正式构建缺少日常组织标识时，公开首页与赛事目录曾返回 404；使用相同日常公开配置重建后已消除。浏览器路由载入独立构建时使用的本机网络分类测试参数仅存在于验证脚本，不修改网站或用户浏览器设置。

## 截图与动画

证据目录（不纳入 Git）：
`C:/Users/Mu Qinghan/.codex/visualizations/2026/10/15/01a1402e-8a8a-7860-a594-9ebed51c50bb/cursor-review/`。

| 文件 | 内容 |
| --- | --- |
| `desktop-before.png`、`guest-login-before.png` | 修复前登录页、已复现的游客登录入口“功能暂未开放” |
| `live/desktop-1440x900.png` | 日常网站桌面截图 |
| `live/mobile-390x844.png` | 手机 H5 隔离回归截图 |
| `live/desktop-hidpi-2x.png` | 2x 高分屏截图 |
| `live/login-football-morph.png` | 原登录页变形过程 |
| `live/cursor-busy.png`、`live/cursor-progress.png` | 运行中的加载浮层 |
| `cursor-sheet.png` | 全部 18 种光标总览 |
| `loading-filmstrip.png` | 24 帧过程总览 |
| `loading-cycle.gif`、`loading-frames.zip`、`loading-frames/*.png` | 循环动画和独立透明帧 |
| `browser-checks.json`、`live/browser-checks.json` | 正式构建与日常网站的实际浏览器结果 |

普通页面截图不捕获操作系统原生鼠标。静态样式通过实际悬停后的 CSS、图片成功解码和热点坐标核对；变形和加载浮层可直接截图。操作系统级原生鼠标最终观感尚未进行人工目视验收，不能把页面截图等同于该项证明。

## 另一端、公共文件与剩余边界

- 业务实现仅改 H5 专属文件；新增/更新素材只由 H5 光标引用。手机 H5 在精确鼠标媒体条件之外保持系统行为，微信小程序源码未修改、未构建、未运行验收。
- 没有修改共享 App、共享组件逻辑、API、DTO、数据库、契约、生成 Client、全局样式、依赖或公共文件所有权清单内文件。
- 没有向共用数据库运行 Seed，没有修改运行配置或用户资料。
- 全仓库测试需要另行配置隔离数据库才能完整通过。保留的构建警告和原生鼠标人工目视验收不计作已消除/已完成。
- 仅做本地提交；没有 push、创建远端 PR、合并 main 或部署。
