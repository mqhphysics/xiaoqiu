# RELEASE-09：GitHub 最新版与 Sites 同步

用户授权：下载已上传的更新，完成后端验证，将完整新版前端发布到原 Sites 网站，先查看效果；真实赛事完整数据另行安排。

- 基线：`origin/codex/eight-integration` / `236ecd1`。
- 独立工作树：`.worktrees/sites-latest-sync-20261007`；分支 `codex/sites-latest-sync-20261007`。
- 范围：已有 H5、同站管理后台与后端成果的同步、检查及必要修复；不扩展微信或真实赛事导入。
- 保留 `trial-owner`、原专用数据库、上传文件、3301 API/Worker 与 Cloudflare 连接。
- API、Worker 的数据库验证只使用本轮创建的隔离库；不在原库运行测试或 Seed。
- 本任务独占本文和本轮验收报告；公共模型、契约、锁文件无新增修改计划。
- Sites 沿用已有项目与公开范围，构建完整 H5 + `/admin/`，使用当前 HTTPS API 和组织配置。
- 游客入口按当前已上传代码交付：按钮可见、后端尚未开放时明确提示；本轮不自行改动匿名权限契约。
- 验收包含实际隔离 PostgreSQL/HTTP 测试、Worker、H5/Admin 检查、生产构建及适当的无头浏览器验证。
- 完成后本地提交本任务文档/修复，按明确授权发布已有 Sites；主目录 main 集成另行安排。
