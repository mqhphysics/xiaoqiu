# 点墨登录艺术素材

本目录供桌面 H5 登录入口使用。视觉基准是用户确认的[点墨校园足球登录页](../../../../../参考图片/04-登录页定稿与光标-2026-10-01/01-login-approved.png)。

## 场景

`stadium-particle-plate.png` 是通过内置 ImageGen 从定稿提取的透明艺术衍生图：保留主要体育场、跑道、草地、看台建筑和上方彩色点云，去掉页面文字、品牌、分界与表单。原件在参考图片目录保留。衍生素材有细节变化，不能描述成原效果图逐像素裁切。

生成提示词：

> Precise extraction/edit for a real website asset. Extract only the left stadium artwork and pale colored dotted clouds into a transparent illustration. Preserve the original elevated front perspective, central roof building, stands, field markings, goal positions, coral running track, trees, floodlights and campus buildings as closely as possible. Remove all text, calligraphy, logos, headings, slogans and the right-side form/divider. Keep delicate pointillist dots and pencil-thin gray/sage lines; blank paper should be transparent. No redesigned viewpoint, extra architecture, glossy 3D, dramatic lighting or realistic grass.

实现将图片分成最多约 24,000 个可移动微片，保留原点墨纹理。静止时绘制同一份采样图；动态时只有移位微片和未移位区域参与绘制，没有完整、不动的底图覆盖避让区。背景按页面纸色呈现。

暂保留 PNG 原图约 2.88MiB 以优先审查纹理与相似度，后续资源压缩另行实测。加载或采样失败、减少动态效果偏好启用时，直接显示静态图。

## 光标

[热点与素材清单](cursors/manifest.json)记录实际尺寸、热点与来源：

- 左侧：28px 简笔足球，热点中心14,14。
- 右侧默认：32px透明PNG，热点2,2。PNG由浏览器在32px画布中渲染自包含的`default-32.svg`导出，原用户PNG的像素数据仍原样嵌入SVG作为可复核来源。运行文件仅约1.2KiB，避免把约212KiB的源SVG重复嵌入页面样式。
- I形32px：16,16；手形32px：12,4。均为独立的安全静态SVG与原生CSS光标。
- 第4阶段的跨线动画尚未实现，本轮采用原生区域切换。

资源只由H5入口引用。真实鼠标显示应在桌面浏览器中查看，页面截图不包含操作系统原生鼠标；浏览器解码和CSS热点已检查，未声称所有操作系统的鼠标显示都完成验收。
