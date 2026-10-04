# H5 功能入口与访问边界

当前服务返回 `accountRequired=true`、`serverGuestAccess=false`、`guest.enabled=false`，业务 API 继续要求真实会话。本轮没有开放服务器游客权限。

登录页和桌面、移动 H5 导航沿用现有按钮名称；关闭、未知或读取失败时可点击并提示“功能暂未开放”。已有模块开启时执行原按钮对应的路由或动作。

未来服务完整实现游客只读权限后，只有 `guest.enabled=true`、`serverGuestAccess=true`、`accountRequired=false` 三项一致才能进入明确列出的公开只读页面和 GET API。页面与请求白名单由 `access-boundary.logic.ts` 定义；`me`、管理员、队长、私信、未知路径和所有业务写入仍需会话。新增页面、API 或交互仍可能需要前端适配。

配置仅在内存缓存，默认有效期 30 秒，合并同时发生的读取。焦点恢复、页面重新可见或主动失效会立即撤销旧配置；过期后的下一次请求先重新读取。过时的异步响应不能恢复旧许可。读取失败关闭入口，生产请求不回退到演示数据。

会话存在、过期或服务器返回 401 后，仅保留“需要账号”的内存布尔状态；不建立游客存储或游客令牌。失效会话不会自动降级为游客。明确退出或点击“返回登录”后才能清除账号意图。旧请求的 401 不清除后来登录的账号，能力响应只在请求前后 token 和组织一致时返回。

账号导航和私有按钮每次点击重新读取 `/me/capabilities`，核对模块、动作、当前组织及精确对象 scope。`ORGANIZATION` 不推导为 `TEAM`；设置、反馈等账号自有动作也需重新验证会话。这些检查只控制入口，业务 API 仍负责真实授权、状态和写入检查。

共享 `product.repository.ts` 和 `readonly-schedule.repository.ts` 的新增行为限定于 `Taro.ENV_TYPE.WEB`；微信使用原请求分支，配置 hook 与状态模块提供无请求的平台默认实现。保留已有的 `getPublishedTournaments`。

验证使用 Node 22：

- `tsc -p apps/mini-program/tsconfig.json --noEmit` 通过。
- 本次修改范围的 ESLint 通过。
- H5 全部 `src/**/*.test.ts`、`src/**/*.test.mjs` 与 `scripts/h5-fallback-imports.test.mjs` 共 119 项通过。
- `taro build --type h5` 通过，保留 2 项现有资源/入口体积警告。

测试执行实际 AccountBoundary 渲染、PublicShell 桌面/移动按钮回调和两套 repository 请求实现，平台、网络及会话使用虚构测试桩；另覆盖缓存过期/竞态、模块关闭、scope 隔离、真实错误透传、旧 401 和账号切换。未启动浏览器或新增服务，未验证未来游客服务器实现，未运行微信构建/真机或数据库检查。

集成时保留身份模块加入的 `IdentityCenterHost`，只在真实账号 `verified` 后挂载。此提交不修改身份页或上传组件。
