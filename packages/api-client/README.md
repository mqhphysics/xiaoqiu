# API Client

此包由 NestJS OpenAPI 文档生成。DTO 是请求契约来源，生成结果位于 `src/generated/`，文档快照位于 `docs/api/openapi.json`。

禁止手改生成代码。接口变更后，在仓库根目录执行 `node scripts/generate-api-client.mjs`，或在参数中传入已由 API 导出的 OpenAPI JSON 文件；再运行本包的 typecheck/build。默认读取本机3001的 API，不写数据库。

使用固定版 [openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen) 0.29.0 生成 Fetch 客户端，不新增项目运行依赖。新维护分支生成器在本次 Windows 环境启动失败，后续升级需单独验证。

调用前配置 `OpenAPI.BASE`、`OpenAPI.TOKEN` 和必要的组织头。旧接口中未声明返回 DTO 的方法仍是宽类型；自动生成通过不代表这些返回契约已补齐。已有网站和管理中心继续使用其现有请求层，本次不替换其缓存、鉴权或错误处理。
