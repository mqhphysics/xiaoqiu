# P0-SB-06 CI 与部署骨架

## 状态

Ready

## 分支

`ai/p0-ci-infra`

## 独占写入范围

```text
.github/workflows/**
infra/**
docs/runbooks/**
```

不得修改应用代码、根配置、公共 packages 或 `pnpm-lock.yaml`。如果现有根脚本不足，在完成报告中提出精确修改建议。

## 目标

建立能验证 monorepo 的 CI、PostgreSQL 本地基础设施和首版部署/恢复操作文档。

## 工作内容

1. 创建 GitHub Actions CI：
   - 固定 Node 与 pnpm 版本
   - 使用 frozen lockfile 安装
   - 执行 lint、typecheck、test、build
   - 缓存 pnpm store
   - 对失败步骤提供清晰日志
2. 在 `infra/` 中创建：
   - 本地 PostgreSQL compose 配置
   - 数据持久卷与健康检查
   - API、Worker、Admin Web 的容器构建骨架，Dockerfile 可统一放在 `infra/docker/`
   - 不含真实凭据的环境变量示例
3. 在 `docs/runbooks/` 中补充：
   - 本地启动与停止
   - 数据库备份与恢复
   - 应用版本回滚
   - Worker 堆积排查占位流程

## 约束

- CI 暂不执行发布和云部署。
- 不假定 GitHub 仓库已创建。
- 镜像构建采用 monorepo 根目录作为 context，但 Dockerfile 保持在本任务写入范围内。
- 数据库 schema 默认只前向迁移；回滚文档不得承诺自动 schema 降级。
- 所有密码使用环境变量和非生产默认值。

## 验收标准

- Workflow YAML 语法有效，步骤与根脚本一致。
- `docker compose config` 通过。
- PostgreSQL 可启动并通过健康检查。
- 构建骨架覆盖 API、Worker 和 Admin Web。
- Runbook 包含可直接执行的命令、前置条件和失败处理。
- 本分支不包含应用代码、根配置或锁文件修改。

## 完成报告补充

如果受环境限制无法实际构建镜像，必须说明已验证到哪一步以及剩余风险。
