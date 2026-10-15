# 光标第二轮修整：固定橙弧、原图箭头、抓取手形

本记录承接 `01a6614`，并取代上一轮记录中的“整个加载环同步旋转”和“简化箭头继续复用”两项设计。仍在独立分支 `codex/h5-cursor-recovery` 工作，日常目录其他未提交改动保留。本轮刷新远端后，`origin/main` 仍为 `4f75a23`。

## 本轮结果

1. **加载**：六段轮廓保持固定，三深三浅的颜色以 1.2 秒为周期顺时针追逐，过渡只改变填色。橙色弧线固定在右上角（-84° 至 -28°），没有组旋转、位移或自身动画。网站与 24 帧 GIF 使用同样的颜色顺序。
2. **默认箭头**：上一版是简化矢量重画，确实不是用户原图只加填色。本轮先以 imagegen 对原始透明 PNG 进行内部填色，再用 SVG 裁剪把该结果限制在内腔；用户的真实原图位图图层覆盖其上，外轮廓与弯曲橙色折角不再用简化路径替代。只裁去透明留白，按原比例生成 32px / 64px PNG，保留点击热点 (2,2)。原参考 PNG 文件不变。
3. **grab / grabbing**：张开手掌采用四根错落的手指和独立拇指；握住状态缩短指节，并让拇指收在掌面。两者统一细描边、浅绿填色与珊瑚色腕部短线。
4. **相关接入**：后台加载中的箭头和登录页变形的箭头端点也使用实际原图版本，移除旧的橙色三角替代图层。文字、链接手形、足球、禁止、移动、缩放等其余样式不变。

## 修改文件

| 文件 | 变化 |
| --- | --- |
| `apps/mini-program/src/components/auth-cursor/index.h5.ts` | 接入颜色追逐 SVG，移除加载组旋转；变形过渡显示真实箭头图片 |
| `apps/mini-program/src/assets/login-art/cursors/default-interior-fill-source.png` | 原图填色编辑结果，仅供内腔填色图层使用 |
| 同目录 `default-32.svg`、`default-32.png`、`default-32@2x.png` | 保留原图图层的默认箭头及其原生运行尺寸 |
| 同目录 `grab-32.svg/.png`、`grab-32@2x.png`、`grabbing-32.svg/.png`、`grabbing-32@2x.png` | 两种修整后的手形 |
| 同目录 `loading-ring.svg`、`loading-ring-animated.svg` | 静态回退和六段填色追逐动画，右上橙弧固定 |
| 同目录 `busy-32.svg/.png`、`busy-32@2x.png`、`progress-32.svg/.png`、`progress-32@2x.png` | 等待和后台加载的静态回退 |
| 同目录 `manifest.json` | 实际素材来源、裁剪、动画参数与静态回退说明 |
| `scripts/build-cursor-assets.mjs` | 可重复生成素材、24 帧、GIF、完整/局部光标总览 |
| `scripts/verify-cursors-h5.mjs` | 改为比较实际截图像素，验证橙色不动、绿色在变 |
| 本文 | 本轮验收和剩余边界 |

## 检查

- `pnpm typecheck`：全工作区通过。
- `pnpm test`：前端 174/174、管理中心 25/25、Worker 21/21 通过；API 184 通过、24 失败、6 跳过，仍缺隔离测试数据库 `TEST_DATABASE_URL`，全仓测试没有标成通过。类型检查与测试首次并行触发 Prisma 生成文件竞争，随后在类型检查完成后串行重跑，以上为最终结果。
- H5 正式构建：通过，17 项 Sass/体积警告仍在；使用日常网站已有的公开 API 地址和组织标识，不修改或提交运行配置。
- 本轮代码 ESLint、Prettier 与 `git diff --check`：通过。
- 正式构建与日常 3000 网站：各 10 项浏览器检查通过，页面错误和 HTTP 错误均为零。保留游客返回登录、18 种光标、快速反向变形、禁用/忙碌状态、减少动态效果、图片损坏静态回退、2x 分辨率、390×844 触屏隔离检查。
- 日常网站加载帧像素对比：等待状态橙色变化 **0** 像素、绿色变化 **178** 像素；后台加载橙色变化 **0** 像素、绿色变化 **117** 像素。每对截图间隔 240ms，比较的是浏览器实际渲染结果。

## 预览和截图

证据目录为 `D:/MuDevSpace/xiaoqiu/private-data/cursor-refinement-2026-10-16/`，不提交 Git。

- `loading-cycle.gif`、`loading-filmstrip.png`、`loading-frames/*.png`、`loading-frames.zip`：新版动画与 24 帧。
- `cursor-focus.png`：default、grab、grabbing 的放大形状和实际 32px 尺寸。
- `cursor-sheet.png`：全部光标总览，其他样式保留。
- `built/desktop-1440x900.png`、`built/mobile-390x844.png`：正式构建桌面/手机截图。
- `live/desktop-1440x900.png`、`live/mobile-390x844.png`、`live/desktop-hidpi-2x.png`：日常网站截图。
- `live/busy-frame-a.png` / `busy-frame-b.png`、`live/progress-frame-a.png` / `progress-frame-b.png`：像素对比的原始截图。
- `built/browser-checks.json`、`live/browser-checks.json`：实际浏览器验证结果；日常结果包含 `animationPixels` 数值。

没有更改手机/小程序、共享组件、公共文件、API、数据库或其他光标形态。仅本地提交，不 push、合并或部署。操作系统原生鼠标的人工目视验收未做；截图、解码和像素比较证明的是浏览器资源与动画行为。
