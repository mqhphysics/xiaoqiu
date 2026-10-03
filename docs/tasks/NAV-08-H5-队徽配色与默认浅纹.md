# NAV-08：队徽关联单色与未选中浅纹

依据：[架构基线](../architecture/晓球产品与技术架构最终版.md)、[AGENTS](../../AGENTS.md)。用户认可当前线稿，要求单色跟队徽配色关联，未选中增加少量极浅的两侧线条避免空白，并明确授权合入main。本轮没有推送或部署授权。

## 修改文件与实现

- `apps/mini-program/src/components/public-shell/team-nav-palette.h5.ts`：从现有队徽主色提取柔和单色；白色主色使用辅色避免看不清。已有演示队徽按既有俱乐部样本映射，自定义队徽用球队声明颜色，仍统一为一个色相。
- `team-nav-palette.h5.test.mjs`：增加四种单色随队徽变化及自定义白色队徽回退的测试。
- `team-nav-focus.h5.tsx`：使用真实主队或显式试样决定颜色；未选中增加6条浅色外卷/叶心线，保留2段基本短弧，其他完整线条仍在选中后绘制。
- `team-nav-focus.h5.scss`：SVG统一继承当前单色；浅轮廓透明度0.14，选中后降为0.04；保留654条线的真实生长以及紧凑导航。
- 本任务卡记录结果，NAV-07添加后续状态提示。

四种试样：曼联暖红`#e26155`、曼城天蓝`#93bfe0`、利物浦偏深红`#d54f62`、切尔西蓝`#4776ab`。这表示导航纹样与当前队徽的配色关联，不表示修改球队数据或队徽本体。

## 任务分支验证

- TypeScript `tsc -p apps/mini-program/tsconfig.json --noEmit`：通过。
- ESLint及Prettier定向检查：通过。
- 配色测试 `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test apps/mini-program/src/components/public-shell/team-nav-palette.h5.test.mjs`：9/9通过。
- H5构建：通过，保留资源/入口体积警告，只输出当前工作树dist。
- 浏览器：未选中6条浅轮廓透明度0.14，其余完整路径隐藏；四个队徽的纹样各只有一种颜色，并随试样切换，无账号主队写入。
- 沿用已验证的逐线生长、当前布局和移动边界；本轮未修改几何、动画时序、移动H5或微信组件。
- `git diff --check`：通过。

## main集成范围与约束

用户本轮授权合并整条导航任务分支。合并前主目录main为`e8265ae`且干净，导航任务与main公共祖先为`5096ae5`。main上的球队/人物资料等已有成果必须保留；只执行本地合并，不推送。

已完成main合并与日常3000浏览器验证，结果见[集成检查](../status/NAV-08-main集成与日常验证-2026-10-03.md)。普通3000入口应使用真实主队配色，不显示仅限3101的试样控件。

公共模型、API、依赖及锁文件无变更建议。参考图与派生线稿的来源许可仍待单独确认，当前合并不代表素材发布授权或生产验收；微信/真机未做。没有新增端口或重置本机数据。
