# EMAIL-01 邮箱注册验证、登录与找回

状态：独立分支代码与定向验收完成，授权码、真实收件和main接入待完成；见[实现与验收](../status/EMAIL-01-实现与验收-2026-10-08.md)。

2026-10-08 用户要求先使用其指定QQ邮箱启动功能，并解释SMTP开启与授权码配置；已明确授权本任务必要公共文件修改。

在 `.worktrees/email-auth` / `codex/email-auth` 从 `7a6a777` 开发；主目录分支和日常3000不切换，不自行合入main、推送或部署。

范围：auth 邮件服务、验证码、DTO/controller/module/guard、注册/资料更新、绑定邮箱验证与改密；User邮箱验证字段、新验证码表与增量迁移；API邮件依赖声明；H5登录、恢复与本人邮箱验证、匿名认证请求白名单；本机配置工具和独立数据库/HTTP测试。管理员修改邮箱需清除旧验证状态，属于本轮必要配套修改。

不包含微信页面/配置、微信扫码和人工核验后端、队伍/赛事功能或正式部署。API开启邮箱服务后注册必须提交验证码，小程序现有注册表单尚未适配，将返回验证码缺失错误；密码登录保留。公共锁文件由集成阶段统一更新；本分支不修改锁文件或生成API Client。

约定：POST /auth/email/code（REGISTER / LOGIN / RESET_PASSWORD / VERIFY_EMAIL）；POST /auth/email/login；POST /auth/email/verify（当前会话）；POST /auth/password/reset-by-email；注册增加emailCode。私人发件地址和授权码只保存在被忽略的本机配置。

验收：独立PostgreSQL迁移与真实HTTP注册→验证码登录→改密→旧会话撤销；旧未验证邮箱拒绝恢复；登录后验证当前邮箱；用途/组织/邮箱/用户隔离、错误尝试、过期、重发、并发和发送失败；H5类型、lint、隔离build和无新增预览端口的浏览器检查。外部邮件只在提供授权码后验证，测试邮件替身不能计为真实送达。
