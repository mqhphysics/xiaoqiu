# grabbing 光标：收起前侧拇指

承接 `88dfd3d`。本轮只修第三个 grabbing 手形：去掉横在掌心前面的斜弯拇指线和侧面鼓包，改为紧凑的四个圆指节、三条短指缝，保留原配色、腕部短线及 (16,16) 热点。default、grab、加载动画和其他光标均无变化。

## 修改文件

- `apps/mini-program/src/assets/login-art/cursors/grabbing-32.svg`
- 同目录 `grabbing-32.png`、`grabbing-32@2x.png`：32px / 64px 透明原生图片。
- 同目录 `manifest.json`：更新该手形说明。
- 本验收记录。

## 检查与影响

- `pnpm typecheck`：全工作区通过。
- `pnpm test`：前端 174/174、管理中心 25/25、Worker 21/21 通过。API 数据库集成前置条件仍缺 `TEST_DATABASE_URL`，全仓测试不记为通过。
- H5 正式构建：通过，保留 17 项 Sass/体积警告。
- 日常网站 10 项浏览器检查通过，页面错误和 HTTP 错误均为零；实际加载新的 grabbing 图片，并覆盖桌面、高分屏和触屏隔离。
- 新图片实际尺寸 32×32 / 64×64，均保留透明通道；`git diff --check` 通过。差异核对确认其余光标图片无变化。
- 手机/小程序、共享代码、公共文件、API 和数据库均未修改。日常网站复用 3000，未新开端口；没有 push、合并或部署。
- 操作系统原生鼠标人工目视验收未做，静态形状以源图/图片预览及浏览器解码核查。

## 预览与截图

位于 `D:/MuDevSpace/xiaoqiu/private-data/cursor-grabbing-fix-2026-10-16/`，不纳入 Git：

- `cursor-focus.png`：三个光标对照，上排放大、下排实际32px；仅第三个变化。
- `live/desktop-1440x900.png`、`live/mobile-390x844.png`、`live/desktop-hidpi-2x.png`：桌面、手机和高分屏截图。
- `live/browser-checks.json`：实际网站回归结果。
