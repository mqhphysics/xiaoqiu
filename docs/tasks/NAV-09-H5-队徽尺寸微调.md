# NAV-09：桌面导航队徽尺寸微调

用户要求未选中时队徽小一些，选中时也稍微收小；延续已授权的导航 main 集成与日常 3000 入口。

## 修改范围

- `apps/mini-program/src/components/public-shell/index.scss`：仅桌面 H5 媒体查询内的导航队徽设为 64px，兼容队徽外层已有的资料入口，窄桌面和减少动态效果选择器同步适配。无主队时的占位从 40px 缩小到 36px。
- `apps/mini-program/src/components/public-shell/team-nav-focus.h5.scss`：选中队徽最终尺寸为 68px（64 × 1.0625），试样队徽使用相同尺寸并保持居中，保留上移 6px；选中占位为约 49.68px。
- 本任务卡记录检查与集成结果。

保留现有抬升位置、渐变缩放、关联单色、浅轮廓和逐线生长；导航按钮点击区域、移动 H5 与微信行为不变。公共模型、API 契约、依赖与锁文件无变更。

浏览器检查发现日常 main 的 TeamCrest 已有 TeamTrigger 包裹层，原来的直接子元素选择器未匹配真实队徽，未选中和选中均显示为 72px。最终以实际界面为基准：未选中缩小约 11%，选中缩小约 6%。不改动 TeamTrigger 本身或资料弹窗交互。

## 检查结果

- `node node_modules/typescript/bin/tsc -p apps/mini-program/tsconfig.json --noEmit`：通过。
- 已安装 Sass 的 `compile()` 编译两个修改样式文件：通过。
- `node node_modules/prettier/bin/prettier.cjs --check apps/mini-program/src/components/public-shell/team-nav-focus.h5.scss docs/tasks/NAV-09-H5-队徽尺寸微调.md`：通过；既有共享 index.scss 保留原格式，只修改指定行。
- `git diff --check`：通过。
- Headless Playwright 通过真实本机 API 登录演示账号 student，读取现有主队，不保存主队偏好。将候选样式应用到真实 main 页面进行预检查：1440px 队徽未选中 64px、选中 68px；980px 选中 68px；导航宽 416/352px、花纹宽 168/140.39px 保持原样；6 条浅轮廓及 654 条逐线绘制正常。
- 390px 队徽实测 37.4375px，花纹隐藏；本次样式全部在桌面媒体查询中。无页面异常。
- 本轮为样式微调，采用 Sass 编译及浏览器测量，不重复完整构建，不运行微信构建。日常 main 集成后已重新验证源码样式，未注入候选 CSS，结果一致。

## 集成与边界

沿用本次会话的导航 main 合并授权。只合入本任务三个文件，不推送或部署。未发现待修复问题；公共文件无变更建议，暂无需要协调的事项。浏览器检查脚本、截图、编译输出和日志位于被忽略的 private-data，均不提交。

## main 最终结果

- 任务提交 `a3da0fe`，main 合并提交 `de758ee`，正常合并无冲突，保留已有资料入口与其它 main 成果。
- 日常 [3000](http://127.0.0.1:3000/) 已自动加载源码更新，没有新开端口或覆盖主目录构建产物。
- 合并后 Headless Playwright 使用真实网站源码，未注入候选样式：未选中 64px、选中 68px；980px 选中仍为 68px。减少动态效果时队徽 transition 为 0s。
- 日常导航宽度、花纹宽度、浅轮廓数量、654 条生长线与移动尺寸均通过检查，无页面异常；没有保存主队偏好或修改本机演示数据。
- 已完成本轮要求。仅本地提交/合并，没有推送、部署或微信改动；暂无需协调事项。
