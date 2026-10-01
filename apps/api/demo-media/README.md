# 本地演示图片

这些图片只供 `DEMO_FIXTURE` 在本地预览界面使用。16 张照片会循环用于 224 名虚构球员；照片中的人不是档案所写的学生，也不证明其真实参赛身份。正式数据上线前必须逐人换成本人确认的照片。

- `crests/`：16 张完整的真实俱乐部徽章 PNG，按 `DEMO_TEAMS` 顺序作为校园演示球队的视觉占位。图片由 [football-data.org 的队徽地址](https://www.football-data.org/documentation/quickstart)取得，逐张 URL 见 `sources.json`。这些标志不属于对应的虚构校园球队，只供本地内部测试；正式队徽须由球队提交或授权。上一版 OpenMoji 图案已保存在被 Git 忽略的 `private-data/archives/openmoji-crests-20260926/`。
- `portraits/`：16 张取自 [Unsplash](https://unsplash.com/license) 的摄影示意图，原始页面与图片 ID 见 `sources.json`。本地压缩裁剪版本用于演示，不将照片中的真人指认为虚构球员或用户。

`sources.json` 记录每张队徽和照片的来源。上线前应替换或确认图片使用范围、商标、肖像授权、本人同意与素材归属。运行时由 API 的 `/api/media/demo/` 只读路由提供这些文件；用户上传的头像另存于被 Git 忽略的 `private-data/media/avatars/`。
