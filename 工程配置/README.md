# 工程配置入口

这些快捷方式指向仍在项目根目录的原文件。常用工程配置设为隐藏，使外层只显示日常启动文件；没有复制、迁走或更改配置内容。

| 原文件 | 用途 |
| --- | --- |
| [package.json](../package.json) | 全仓命令、包管理器和开发依赖 |
| [pnpm-workspace.yaml](../pnpm-workspace.yaml) | 应用与共享包的工作区声明 |
| [pnpm-lock.yaml](../pnpm-lock.yaml) | 固定依赖版本，由集成负责人维护 |
| [tsconfig.base.json](../tsconfig.base.json) | TypeScript 共享编译基线 |
| [eslint.config.mjs](../eslint.config.mjs) | 代码检查规则 |
| [.prettierrc.json](../.prettierrc.json)、[.prettierignore](../.prettierignore) | 格式化规则与排除项 |
| [.editorconfig](../.editorconfig) | 编辑器缩进和换行约定 |
| [.gitignore](../.gitignore) | 排除依赖、私有资料和生成内容 |
| [.dockerignore](../.dockerignore) | Docker 构建上下文排除规则 |
| [.env.example](../.env.example) | 环境变量模板 |
| [AGENTS.md](../AGENTS.md) | AI 协作与文件所有权规则 |
| [README.md](../README.md) | 原工程入口与开发命令 |
| [贡献说明](../docs/development/CONTRIBUTING.md) | 已归入开发文档 |

`.github/` 的 CI 配置也须保持根目录位置；`.git/` 为版本库元数据。`node_modules/`、`.pnpm-store/`、`.worktrees/` 是依赖、缓存与 Git 工作区，当前隐藏但保留。

Windows `.lnk` 仅用于本机导航，不提交 Git。以后搬迁整个项目时，Markdown 相对链接仍有效；需重新创建快捷方式。恢复隐藏状态的命令见[目录说明](../docs/目录说明.md)。
