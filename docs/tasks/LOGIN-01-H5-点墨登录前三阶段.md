# LOGIN-01 桌面 H5 点墨登录页前三阶段

用户于 2026-10-02 明确授权实施定稿方案第 1–3 部分，并直接提供可体验的粒子避让效果。子任务起点为 `2daf269919d7b3b07258ffdb37d159e9546ba35c`。主目录在工作期间被另一项集成任务切换到 `main` 并纳入两个子任务提交；父任务随后在当前目录基于 `123fd7f` 创建并切换到专用分支 `codex/login-art-stages-1-3`，保留其它工作区改动，仅提交本轮文件。

必读：[当前架构](../architecture/晓球产品与技术架构最终版.md)、根目录 [AGENTS.md](../../AGENTS.md)、[用户定稿与实施步骤](../planning/登录入口-定稿实施方案-2026-10-01.md)。

范围：桌面 H5 登录页、点墨体育场艺术层、左侧简化足球与右侧语义图片光标、Canvas 局部避让和回弹。第 4 部分跨线变形动画留到后续。微信和移动 H5 保留当前入口及表现。

父任务独占：`pages/login/index.h5.tsx`、`index.h5.scss`、`components/auth-scene/index.h5.tsx`、体育场成品素材和本轮报告。原 `pages/login/index.tsx/.scss` 只读复用，App 返回结构保持既有行为。

隔离子任务：

- `codex/login-particle-engine`，`.worktrees/login-particle-engine`：只写 `components/auth-scene/particle-field.h5.ts`。
- `codex/login-cursor-assets`，`.worktrees/login-cursor-assets`：只写 `assets/login-art/cursors/` 和 `components/auth-cursor/native-cursors.h5.scss`。

子任务各自检查并提交后，由父任务审查指定文件并复制整合；不合并或提交其他 V2/微信任务的进行中修改。根任务完成检查后只提交本轮 H5 文件。无 push/main 合并/部署授权。

验收：真实浏览器中静止艺术接近定稿；草地、看台、点云处可见局部避让和回弹；没有不动的强底图或双鼠标；账号操作、密码显示、注册、找回密码和游客入口可用；记录尺寸、热点、绘制统计与截图。执行 H5 typecheck、定向 lint、H5 build 和差异检查，不例行构建 weapp。
