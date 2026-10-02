# 点墨登录艺术素材

本目录供桌面 H5 登录入口使用。视觉基准是用户确认的[点墨校园足球登录页](../../../../../参考图片/04-登录页定稿与光标-2026-10-01/01-login-approved.png)。

## 场景

`stadium-particle-plate.png` 是通过内置 ImageGen 从定稿提取的透明艺术衍生图：保留主要体育场、跑道、草地、看台建筑和上方彩色点云，去掉页面文字、品牌、分界与表单。原件在参考图片目录保留。衍生素材有细节变化，不能描述成原效果图逐像素裁切。

生成提示词：

> Precise extraction/edit for a real website asset. Extract only the left stadium artwork and pale colored dotted clouds into a transparent illustration. Preserve the original elevated front perspective, central roof building, stands, field markings, goal positions, coral running track, trees, floodlights and campus buildings as closely as possible. Remove all text, calligraphy, logos, headings, slogans and the right-side form/divider. Keep delicate pointillist dots and pencil-thin gray/sage lines; blank paper should be transparent. No redesigned viewpoint, extra architecture, glossy 3D, dramatic lighting or realistic grass.

实现将图片分成最多约 24,000 个可移动微片，保留原点墨纹理。静止时绘制同一份采样图；动态时只有移位微片和未移位区域参与绘制，没有完整、不动的底图覆盖避让区。背景按页面纸色呈现。

紫色点云内的浅色大写 `CCNU` 由 Canvas 在采样前绘制，字体为Arial、600字重、颜色 `rgba(124,97,158,.16)`，中心落在素材的47%、22.5%处，字号为素材宽度的8%。文字属于同一份纹理，会随附近微片避让与回弹。静态/减少动态偏好降级时，使用相同坐标、字号和颜色的文字层。

暂保留 PNG 原图约 2.88MiB 以优先审查纹理与相似度，后续资源压缩另行实测。加载或采样失败、减少动态效果偏好启用时，直接显示静态图。

## 光标

[热点与素材清单](cursors/manifest.json)记录实际尺寸、热点与来源：

- 左侧：28px 简笔足球，热点中心14,14。
- 默认：32px透明PNG，热点2,2。按用户深绿描边、珊瑚色折角参考重新描成紧凑 SVG，并在内部补上不透明浅鼠尾草绿 `#e4ede5`；外围仍透明。PNG由浏览器渲染 `default-32.svg` 导出，约1.1KiB。原用户图片在参考目录保留，当前 SVG 是修改衍生图。
- I形32px：16,16；手形32px：12,4。均为独立的安全静态SVG与原生CSS光标。
- 登录左右跨线时，以同一组 Bézier 控制点在箭头轮廓和足球圆形之间连续插值，约280ms完成，折角逐渐消失、足球接缝渐显；双向移动均支持，快速折返从当前形态继续。
- 稳定状态使用原生 CSS 光标。只有变形期间出现一个不接收点击的临时 SVG 光标，同一帧隐藏原生光标，结束或失焦、滚动、离开窗口、切页时恢复；不添加尾迹或外围圆环。输入和按钮立即呈现相应语义皮肤，减少动态偏好跳过变形。
- `mountCursorSkin` 由 App 挂载一次，登录、游客进入、后续页面和弹窗持续使用皮肤。扩展后共18种资源：默认、足球、手形、I形、不可用、等待、后台处理中、移动、可抓取、抓取中、精确选择、水平/垂直/两方向斜角缩放、帮助、放大、缩小。沿用参考方案C和长条参考图的深绿线条、珊瑚色点缀，新增资源为32px透明SVG。
- 通过现有 CSS `cursor`、disabled/aria-disabled/aria-busy和真实控件语义选择类型；文件/颜色选择、勾选框使用手形。一个已悬停控件变为禁用、恢复或忙碌时也会更新皮肤。未知的copy/alias等语义保留原生行为。等待和后台处理光标使用原生静态图形，不依赖浏览器未承诺的SVG光标动画。
- 指针变化只更新DOM属性。短暂跨线变形和按下/松开后的一次刷新使用rAF；没有持续的光标跟随绘制，也不逐帧更新React状态。

资源只由H5模块引用，非H5挂载函数为空操作；窄屏及没有精细悬停设备的环境不启用。真实原生鼠标显示应在桌面浏览器中查看，普通页面截图不包含操作系统原生鼠标；变形期间的 SVG 可截图。验收详情见[本轮报告](../../../../../docs/testing/LOGIN-02-光标填充与全站皮肤-2026-10-02.md)。
