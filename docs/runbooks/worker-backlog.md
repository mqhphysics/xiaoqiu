# Worker 堆积排查

本流程是 P0 占位 Runbook。Outbox 表和管理重放 API 落地后，应将示例查询与实际
字段、状态和权限再次核对。

## 触发条件

- `outbox_pending_oldest_seconds` 在比赛日超过 60 秒。
- Pending 或 Retryable 数量持续增长。
- 同一 Topic 连续失败。
- Worker 容器重启或没有心跳日志。

## 前置条件

- 只读数据库账号或经授权的应用数据库访问。
- 当前部署提交哈希和 Worker 日志访问权限。
- 禁止直接编辑 Outbox payload。

## 排查

先检查进程和日志：

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml --profile app ps worker
docker compose --env-file infra/.env -f infra/compose.yaml --profile app logs --tail 200 worker
```

Outbox 表落地后，在 `psql` 中执行只读查询：

```sql
SELECT status, topic, count(*) AS jobs, min(available_at) AS oldest_available_at
FROM outbox_jobs
WHERE status IN ('PENDING', 'PROCESSING', 'FAILED_RETRYABLE')
GROUP BY status, topic
ORDER BY oldest_available_at;

SELECT id, topic, status, attempt_count, max_attempts, last_error_code,
       last_error, available_at, locked_by, locked_until, correlation_id
FROM outbox_jobs
WHERE status IN ('FAILED_RETRYABLE', 'FAILED_PERMANENT')
ORDER BY available_at
LIMIT 50;

SELECT status, topic, count(*) AS jobs
FROM outbox_jobs
WHERE status IN ('SUCCEEDED', 'CANCELLED')
  AND updated_at >= now() - interval '1 hour'
GROUP BY status, topic
ORDER BY status, topic;
```

判断故障类型：

- 数据库连接、锁或租约问题。
- Handler 代码错误。
- 外部服务超时或限流。
- 永久参数错误、资源不存在或权限配置错误。

## 恢复

1. 必要时暂停故障 Topic 或 Worker，不暂停比分主业务。
2. 修复根因后先重放单个任务。
3. 验证 Handler 幂等和副作用。
4. 再分批恢复同 Topic。
5. 不可重试任务标记为 `FAILED_PERMANENT`，保留错误和审计。
6. 已成功任务保持 `SUCCEEDED`，管理员取消的未执行任务保持 `CANCELLED`。
7. 记录 `last_error_code`、`last_error`、`correlation_id`、事故时间线、
   最大堆积年龄和恢复结果。

管理重放 API 尚未落地时，不通过临时 SQL 篡改 payload 或伪造成功状态。

## 失败处理

- 租约长期不释放：先确认 Worker 是否存活，再由正式回收逻辑处理超时租约。
- 重放产生重复通知或错误投影：立即停止重放，修复 Handler 幂等。
- 外部通知不可用：保持站内通知和核心比分写入，延后外部投递。
- 榜单任务失败：继续提供上一成功快照，不直接手改投影行。
