# 数据库备份与恢复

## 原则

- 恢复前先保护当前数据库，不直接覆盖唯一副本。
- Schema 默认只前向迁移，不承诺自动降级。
- 先恢复到临时数据库，验证后再切换连接或生成受控修复 SQL。
- 生产操作必须记录操作者、时间、提交哈希、迁移版本和原因。

## 前置条件

- PostgreSQL 容器健康。
- 备份目录位于受控存储，且空间充足。
- 恢复演练使用非生产环境。
- 以下本地命令从仓库根目录执行。

## 本地备份

```powershell
New-Item -ItemType Directory -Force backups
docker compose --env-file infra/.env -f infra/compose.yaml exec -T postgres pg_dump -U xiaoqiu -d xiaoqiu --format=custom --file=/tmp/xiaoqiu.dump
docker compose --env-file infra/.env -f infra/compose.yaml cp postgres:/tmp/xiaoqiu.dump backups/xiaoqiu.dump
Get-Item backups/xiaoqiu.dump
```

可选校验备份目录：

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml cp backups/xiaoqiu.dump postgres:/tmp/verify.dump
docker compose --env-file infra/.env -f infra/compose.yaml exec -T postgres pg_restore --list /tmp/verify.dump
```

## 恢复到临时数据库

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml cp backups/xiaoqiu.dump postgres:/tmp/xiaoqiu.dump
docker compose --env-file infra/.env -f infra/compose.yaml exec -T postgres dropdb -U xiaoqiu --if-exists xiaoqiu_restore
docker compose --env-file infra/.env -f infra/compose.yaml exec -T postgres createdb -U xiaoqiu xiaoqiu_restore
docker compose --env-file infra/.env -f infra/compose.yaml exec -T postgres pg_restore -U xiaoqiu -d xiaoqiu_restore --exit-on-error /tmp/xiaoqiu.dump
docker compose --env-file infra/.env -f infra/compose.yaml exec -T postgres psql -U xiaoqiu -d xiaoqiu_restore -c "\dt"
```

随后校验：

1. 数据库迁移版本。
2. 组织、赛事、比赛、名单快照和审计记录数量。
3. 对象存储引用。
4. 最新成功榜单快照。
5. 未完成 Outbox 是否可幂等恢复。

## 切换

验证通过后，优先把应用 `DATABASE_URL` 切到已验证的恢复实例。若必须回写原实例，
先停止高风险写入并再做一次当前状态备份。恢复后重新启动 API 与 Worker，检查：

```bash
curl --fail --show-error https://api-staging.example.edu/api/health/live
curl --fail --show-error https://api-staging.example.edu/api/health/ready
```

## 失败处理

- `pg_restore` 报版本不兼容：使用与目标 PostgreSQL 主版本兼容的客户端重试。
- 空间不足：停止恢复，扩容临时实例；不要删除当前唯一备份。
- 恢复后数据量异常：保持应用只读，比较备份时间点和迁移版本。
- Worker 产生重复副作用：暂停 Worker，按堆积 Runbook 核查 Handler 幂等后再恢复。
