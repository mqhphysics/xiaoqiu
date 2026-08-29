# 开发期报名 JSON 导入

此命令只允许在非生产环境运行。输入文件必须是 `schemaVersion: 1` JSON；仓库内的
`fixtures/registration-v1.example.json` 只包含虚构数据，可用于本地验证。

运行前设置：

```text
DATABASE_URL=<开发数据库连接>
REGISTRATION_IMPORT_HASH_SECRET=<至少 16 字符的本地稳定密钥>
```

执行：

```text
pnpm --filter @xiaoqiu/api db:import:registration -- \
  --file <运行时 JSON 路径> \
  --tournament-code <赛事代码> \
  --acknowledge-warnings
```

相对路径按执行上述 `pnpm` 命令时所在的目录解析，也可以直接传绝对路径。

`REGISTRATION_IMPORT_HASH_SECRET` 用于把规范化学号或外部稳定 ID 转为 HMAC 匹配键。
同一环境必须保持该密钥稳定；源码、日志和导入输出中不得出现密钥或原始身份值。

JSON 顶层字段：

- `schemaVersion`: 固定为 `1`。
- `team`: `teamCode`、`name` 必填；领队、教练和联系信息可选。
- `players[]`: `displayName` 必填；必须提供 `studentId`、`externalSourceId` 或
  `stableKey` 之一；`shirtNumber` 为可空字符串。
- `warnings` / `warningCodes`: 可选。存在警告时必须显式传
  `--acknowledge-warnings`。

命令输出仅包含批次 ID、球队代码、人数、警告数和结果，不输出原始文件路径、学号、
手机号或人员姓名。
