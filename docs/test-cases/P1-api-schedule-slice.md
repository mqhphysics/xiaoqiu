# P1 API 赛事与赛程纵向切片测试用例

## 自动化覆盖

| 编号       | 场景                                                                                    | 预期                                                                |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P1-SCH-001 | 使用 `x-dev-role: TOURNAMENT_ADMIN` 和 `x-dev-organization-id` 创建赛季、赛事和规则版本 | 返回统一 JSON DTO，资源写入当前组织                                 |
| P1-SCH-002 | 创建两支球队、一个场地和一场比赛草案                                                    | 只能引用同组织资源，比赛初始为 `DRAFT`                              |
| P1-SCH-003 | 创建赛程草案并发布                                                                      | 创建 `ScheduleRevision`，比赛变为 `SCHEDULED`，赛事变为 `PUBLISHED` |
| P1-SCH-004 | 发布赛程草案                                                                            | 同一事务写入 `AuditLog` 和 `OutboxJob`                              |
| P1-SCH-005 | 普通只读 API 读取已发布赛事、赛程、比赛和球队                                           | 返回已发布数据                                                      |
| P1-SCH-006 | 未发布赛程读取 public schedule                                                          | 返回统一 404                                                        |
| P1-SCH-007 | 其他组织上下文读取后台资源或发布                                                        | 返回统一 404                                                        |
| P1-SCH-008 | 缺少或错误 `x-dev-role` 调用后台接口                                                    | 返回统一 403                                                        |
| P1-SCH-009 | 重复发布同一赛程草案                                                                    | 返回 `SCHEDULE.PLAN_ALREADY_PUBLISHED`                              |
| P1-SCH-010 | OpenAPI JSON                                                                            | 包含 P1 新增路径                                                    |

## 手工/集成检查

| 编号      | 场景                   | 预期                                                                                                                                                                                                                             |
| --------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-DB-001 | 空 PostgreSQL 执行迁移 | P0 与 P1 表均可创建                                                                                                                                                                                                              |
| P1-DB-002 | 执行 seed              | 默认组织、开发管理员和 P1 `TOURNAMENT_ADMIN` 上下文存在                                                                                                                                                                          |
| P1-DB-003 | 检查唯一约束           | `seasons(organization_id, season_code)`、`tournaments(organization_id, tournament_code)`、`competition_rule_versions(tournament_id, version)`、`teams(organization_id, team_code)`、`venues(organization_id, venue_code)` 均存在 |
