import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import { PrismaService } from '../database/prisma.service'
import { Prisma } from '../generated/prisma/client'
import type {
  AdminCenterAuditQueryDto,
  AdminCenterCreatePostDto,
  AdminCenterEditDto,
  AdminCenterMembershipDto,
  AdminCenterPageDto,
  AdminCenterReasonDto,
  AdminCenterRuleVersionDto,
  AdminCenterUsersQueryDto,
} from './admin-center.dto'
import {
  centerError,
  commandHash,
  maskEmail,
  maskIdentity,
  publicProfilePatch,
  safeAuditSummary,
} from './admin-center.policy'
import { validateManagementRules } from './admin-center.rules'

type Tx = Prisma.TransactionClient
const teamFields = {
  id: true,
  teamCode: true,
  name: true,
  shortName: true,
  collegeName: true,
  description: true,
  motto: true,
  primaryColor: true,
  secondaryColor: true,
  crestUrl: true,
  foundedYear: true,
  updatedAt: true,
} as const
const playerFields = {
  id: true,
  displayName: true,
  jerseyName: true,
  position: true,
  secondaryPosition: true,
  dominantFoot: true,
  heightCm: true,
  academicYear: true,
  major: true,
  hometown: true,
  bio: true,
  profileColor: true,
  avatarUrl: true,
  portraitUrl: true,
  isDemo: true,
  updatedAt: true,
} as const
const postFields = {
  id: true,
  tournamentId: true,
  teamId: true,
  type: true,
  status: true,
  title: true,
  body: true,
  imageUrl: true,
  publishedAt: true,
  updatedAt: true,
  author: { select: { id: true, displayName: true } },
} as const

@Injectable()
export class AdminCenterService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
  ) {}

  private async session(authorization: string | undefined) {
    const actor = await this.auth.requireSession(authorization)
    this.policy.requireOrganizationAdministrator(actor)
    return actor
  }

  private async fresh(tx: Tx, actor: AuthenticatedSession) {
    const session = await tx.userSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    })
    const member = await tx.organizationMembership.findFirst({
      where: { organizationId: actor.organizationId, userId: actor.userId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!session || !member) throw centerError(401, '登录或组织成员身份已失效')
    const roles = await tx.roleAssignment.findMany({
      where: {
        userId: actor.userId,
        revokedAt: null,
        grantedAt: { lte: new Date() },
        OR: [
          { organizationId: actor.organizationId },
          { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
        ],
      },
      select: { role: true, scopeType: true, scopeId: true },
    })
    this.policy.requireOrganizationAdministrator({ ...actor, user: { ...actor.user, roles } })
    return { ...actor, user: { ...actor.user, roles } }
  }

  private async read<T>(
    authorization: string | undefined,
    run: (tx: Tx, actor: AuthenticatedSession) => Promise<T>,
  ): Promise<T> {
    const actor = await this.session(authorization)
    return this.prisma.$transaction(async (tx) => run(tx, await this.fresh(tx, actor)), {
      isolationLevel: 'RepeatableRead',
    })
  }

  private async write<T>(
    authorization: string | undefined,
    route: string,
    body: unknown,
    key: string | undefined,
    run: (tx: Tx, actor: AuthenticatedSession) => Promise<T>,
  ): Promise<T> {
    const actor = await this.session(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw centerError(400, '请提供有效的 Idempotency-Key（8–128 个字符）')
    const requestHash = commandHash({ organizationId: actor.organizationId, body })
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const fresh = await this.fresh(tx, actor)
            const previous = await tx.idempotencyRecord.findUnique({
              where: {
                userId_route_idempotencyKey: { userId: actor.userId, route, idempotencyKey: key },
              },
            })
            if (previous) {
              if (
                previous.organizationId !== actor.organizationId ||
                previous.requestHash !== requestHash
              )
                throw centerError(409, '同一幂等键不能用于不同请求')
              if (previous.responseBody === null)
                throw centerError(409, '请求正在处理，请用原键重试')
              return previous.responseBody as T
            }
            const response = await run(tx, fresh)
            await tx.idempotencyRecord.create({
              data: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                route,
                idempotencyKey: key,
                requestHash,
                responseStatus: 200,
                responseBody: json(response),
                expiresAt: new Date(Date.now() + 7 * 86400000),
              },
            })
            return response
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        )
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        if (code === 'P2002' || code === 'P2034') {
          if (attempt < 2) continue
          throw centerError(409, '正在处理并发变更，请用原幂等键重试')
        }
        throw error
      }
    }
    throw centerError(409, '请重试')
  }

  private auditWrite(
    tx: Tx,
    actor: AuthenticatedSession,
    action: string,
    targetType: string,
    targetId: string,
    reason: string,
    requestId: string,
    before: unknown,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorType: 'ADMIN',
        actorUserId: actor.userId,
        actorRoleSnapshot: json(actor.user.roles),
        action,
        targetType,
        targetId,
        reason,
        requestId,
        source: 'ADMIN_CENTER',
        beforeSummary: json(before),
        afterSummary: json(after),
      },
    })
  }

  overview(authorization: string | undefined) {
    return this.read(authorization, async (tx, actor) => {
      const organizationId = actor.organizationId
      const [organization, users, teams, players, openFeedback, pendingRosters, pendingReports] =
        await Promise.all([
          tx.organization.findUniqueOrThrow({
            where: { id: organizationId },
            select: { id: true, name: true },
          }),
          tx.organizationMembership.count({ where: { organizationId, status: { not: 'LEFT' } } }),
          tx.team.count({ where: { organizationId } }),
          tx.playerProfile.count({ where: { organizationId } }),
          tx.contentReport.count({
            where: { organizationId, status: { in: ['OPEN', 'IN_REVIEW'] } },
          }),
          tx.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) AS count FROM roster_submissions s WHERE s.organization_id = ${organizationId}::uuid AND s.status = 'SUBMITTED' AND s.submission_version = (SELECT max(s2.submission_version) FROM roster_submissions s2 WHERE s2.team_registration_id = s.team_registration_id AND s2.organization_id = ${organizationId}::uuid)`,
          tx.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) AS count FROM matches m JOIN match_report_revisions r ON r.match_id = m.id AND r.version = m.report_version AND r.organization_id = m.organization_id WHERE m.organization_id = ${organizationId}::uuid AND r.status = 'SUBMITTED'`,
        ])
      return {
        organization,
        counts: {
          users,
          teams,
          players,
          pendingRosters: Number(pendingRosters[0]?.count ?? 0),
          pendingReports: Number(pendingReports[0]?.count ?? 0),
          openFeedback,
        },
        checkedAt: new Date().toISOString(),
      }
    })
  }

  users(authorization: string | undefined, query: AdminCenterUsersQueryDto) {
    return this.read(authorization, async (tx, actor) => {
      const term = query.query
      const where: Prisma.OrganizationMembershipWhereInput = {
        organizationId: actor.organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(term
          ? {
              user: {
                OR: [
                  { displayName: { contains: term, mode: 'insensitive' } },
                  { loginNameNormalized: { contains: term, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      }
      const [total, members] = await Promise.all([
        tx.organizationMembership.count({ where }),
        tx.organizationMembership.findMany({
          where,
          orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
          ...paging(query),
          select: {
            status: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                loginNameNormalized: true,
                displayName: true,
                studentId: true,
                email: true,
                avatarUrl: true,
                status: true,
                verificationLevel: true,
                playerProfile: { select: { id: true, displayName: true } },
                passwordCredential: { select: { id: true } },
                roleAssignments: {
                  where: {
                    revokedAt: null,
                    OR: [
                      { organizationId: actor.organizationId },
                      { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
                    ],
                  },
                  select: { role: true, scopeType: true, scopeId: true },
                },
              },
            },
          },
        }),
      ])
      const sessions = await tx.userSession.groupBy({
        by: ['userId'],
        where: {
          organizationId: actor.organizationId,
          userId: { in: members.map((row) => row.user.id) },
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        _count: { _all: true },
      })
      const counts = new Map(sessions.map((row) => [row.userId, row._count._all]))
      return page(
        query,
        total,
        members.map(({ status, updatedAt, user }) => ({
          id: user.id,
          username: user.loginNameNormalized ?? '',
          displayName: user.displayName,
          studentIdMasked: maskIdentity(user.studentId),
          emailMasked: maskEmail(user.email),
          avatarUrl: user.avatarUrl,
          userStatus: user.status,
          membershipStatus: status,
          membershipUpdatedAt: updatedAt.toISOString(),
          verificationLevel: user.verificationLevel,
          linkedPlayer: user.playerProfile,
          roles: user.roleAssignments,
          activeSessionCount: counts.get(user.id) ?? 0,
          hasPassword: !!user.passwordCredential,
        })),
      )
    })
  }

  membership(
    authorization: string | undefined,
    id: string,
    body: AdminCenterMembershipDto,
    key: string | undefined,
    requestId: string,
  ) {
    id = id.toLowerCase()
    return this.write(
      authorization,
      `POST /admin/center/users/${id}/membership`,
      body,
      key,
      async (tx, actor) => {
        if (id === actor.userId && body.status === 'SUSPENDED')
          throw centerError(403, '不能停用自己当前的组织身份')
        const member = await tx.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId: actor.organizationId, userId: id } },
        })
        if (!member) throw centerError(404, '本组织中不存在该用户')
        if (!['ACTIVE', 'SUSPENDED'].includes(member.status))
          throw centerError(409, '仅能停用或恢复现有组织成员')
        if (body.status === 'SUSPENDED') {
          const admin = await tx.roleAssignment.findFirst({
            where: {
              userId: id,
              revokedAt: null,
              OR: [
                { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
                {
                  organizationId: actor.organizationId,
                  role: 'ORGANIZATION_ADMIN',
                  scopeType: 'ORGANIZATION',
                  scopeId: actor.organizationId,
                },
              ],
            },
            select: { id: true },
          })
          if (admin) throw centerError(403, '组织与平台管理员受到保护，不能在此停用')
        }
        const expected = new Date(body.expectedUpdatedAt)
        const changed = await tx.organizationMembership.updateMany({
          where: { id: member.id, organizationId: actor.organizationId, updatedAt: expected },
          data: { status: body.status },
        })
        if (changed.count !== 1) throw centerError(409, '组织身份已变化，请刷新后再操作')
        const revoked =
          body.status === 'SUSPENDED'
            ? await tx.userSession.updateMany({
                where: { organizationId: actor.organizationId, userId: id, revokedAt: null },
                data: { revokedAt: new Date() },
              })
            : { count: 0 }
        const updated = await tx.organizationMembership.findUniqueOrThrow({
          where: { id: member.id },
          select: { updatedAt: true },
        })
        const response = {
          id,
          membershipStatus: body.status,
          membershipUpdatedAt: updated.updatedAt.toISOString(),
          revokedCount: revoked.count,
        }
        await this.auditWrite(
          tx,
          actor,
          'ORGANIZATION_MEMBERSHIP_UPDATED',
          'User',
          id,
          body.reason,
          requestId,
          { status: member.status },
          { status: body.status, revokedCount: revoked.count },
        )
        return response
      },
    )
  }

  revokeSessions(
    authorization: string | undefined,
    id: string,
    body: AdminCenterReasonDto,
    key: string | undefined,
    requestId: string,
  ) {
    id = id.toLowerCase()
    return this.write(
      authorization,
      `POST /admin/center/users/${id}/revoke-sessions`,
      body,
      key,
      async (tx, actor) => {
        const member = await tx.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId: actor.organizationId, userId: id } },
          select: { id: true },
        })
        if (!member) throw centerError(404, '本组织中不存在该用户')
        if (id === actor.userId) throw centerError(403, '请使用账户退出撤销自己的当前会话')
        const revoked = await tx.userSession.updateMany({
          where: {
            organizationId: actor.organizationId,
            userId: id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { revokedAt: new Date() },
        })
        const response = { id, revokedCount: revoked.count }
        await this.auditWrite(
          tx,
          actor,
          'ORGANIZATION_USER_SESSIONS_REVOKED',
          'User',
          id,
          body.reason,
          requestId,
          null,
          response,
        )
        return response
      },
    )
  }

  teams(authorization: string | undefined, query: AdminCenterPageDto) {
    return this.read(authorization, async (tx, actor) => {
      const where: Prisma.TeamWhereInput = {
        organizationId: actor.organizationId,
        ...(query.query
          ? {
              OR: [
                { name: { contains: query.query, mode: 'insensitive' } },
                { teamCode: { contains: query.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      }
      const [total, rows] = await Promise.all([
        tx.team.count({ where }),
        tx.team.findMany({
          where,
          select: {
            ...teamFields,
            _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          ...paging(query),
        }),
      ])
      return page(
        query,
        total,
        rows.map(({ _count, ...row }) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
          memberCount: _count.memberships,
        })),
      )
    })
  }

  players(authorization: string | undefined, query: AdminCenterPageDto) {
    return this.read(authorization, async (tx, actor) => {
      const where: Prisma.PlayerProfileWhereInput = {
        organizationId: actor.organizationId,
        ...(query.query ? { displayName: { contains: query.query, mode: 'insensitive' } } : {}),
      }
      const [total, rows] = await Promise.all([
        tx.playerProfile.count({ where }),
        tx.playerProfile.findMany({
          where,
          select: {
            ...playerFields,
            teamMemberships: {
              where: { organizationId: actor.organizationId, status: 'ACTIVE' },
              select: { team: { select: { id: true, name: true } } },
            },
          },
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          ...paging(query),
        }),
      ])
      return page(
        query,
        total,
        rows.map(({ teamMemberships, ...row }) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
          teams: teamMemberships.map((membership) => membership.team),
        })),
      )
    })
  }

  edit(
    authorization: string | undefined,
    kind: 'Team' | 'PlayerProfile',
    id: string,
    body: AdminCenterEditDto,
    key: string | undefined,
    requestId: string,
  ) {
    id = id.toLowerCase()
    const patch = publicProfilePatch(kind, body.patch)
    return this.write(
      authorization,
      `PATCH /admin/center/${kind === 'Team' ? 'teams' : 'players'}/${id}`,
      { ...body, patch },
      key,
      async (tx, actor) => {
        const where = { id, organizationId: actor.organizationId }
        const current =
          kind === 'Team'
            ? await tx.team.findFirst({ where, select: teamFields })
            : await tx.playerProfile.findFirst({ where, select: playerFields })
        if (!current) throw centerError(404, '本组织中不存在该档案')
        const cas = { ...where, updatedAt: new Date(body.expectedUpdatedAt) }
        const updated =
          kind === 'Team'
            ? await tx.team.updateMany({
                where: cas,
                data: patch as Prisma.TeamUpdateManyMutationInput,
              })
            : await tx.playerProfile.updateMany({
                where: cas,
                data: patch as Prisma.PlayerProfileUpdateManyMutationInput,
              })
        if (updated.count !== 1) throw centerError(409, '资料已由其他人员更新，请刷新后重新核对')
        const result =
          kind === 'Team'
            ? await tx.team.findFirstOrThrow({ where, select: teamFields })
            : await tx.playerProfile.findFirstOrThrow({ where, select: playerFields })
        await this.auditWrite(
          tx,
          actor,
          kind === 'Team' ? 'TEAM_PROFILE_UPDATED' : 'PLAYER_PROFILE_UPDATED',
          kind,
          id,
          body.reason,
          requestId,
          {
            fields: Object.fromEntries(
              Object.keys(patch).map((field) => [
                field,
                (current as Record<string, unknown>)[field],
              ]),
            ),
          },
          { fields: patch, changedFields: Object.keys(patch) },
        )
        return { ...result, updatedAt: result.updatedAt.toISOString() }
      },
    )
  }

  audit(authorization: string | undefined, query: AdminCenterAuditQueryDto) {
    return this.read(authorization, async (tx, actor) => {
      const where: Prisma.AuditLogWhereInput = {
        organizationId: actor.organizationId,
        ...(query.action ? { action: query.action } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.query
          ? {
              OR: [
                { action: { contains: query.query, mode: 'insensitive' } },
                { targetId: { contains: query.query, mode: 'insensitive' } },
                { actorUser: { displayName: { contains: query.query, mode: 'insensitive' } } },
              ],
            }
          : {}),
      }
      const [total, rows] = await Promise.all([
        tx.auditLog.count({ where }),
        tx.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...paging(query),
          select: {
            id: true,
            actorType: true,
            actorUserId: true,
            actorUser: { select: { displayName: true } },
            action: true,
            targetType: true,
            targetId: true,
            reason: true,
            requestId: true,
            createdAt: true,
            beforeSummary: true,
            afterSummary: true,
          },
        }),
      ])
      const response = page(
        query,
        total,
        rows.map(({ actorUser, beforeSummary, afterSummary, ...row }) => ({
          ...row,
          actorName: actorUser?.displayName ?? '系统',
          before: safeAuditSummary(beforeSummary),
          after: safeAuditSummary(afterSummary),
          createdAt: row.createdAt.toISOString(),
        })),
      )
      return response
    })
  }

  media(authorization: string | undefined, query: AdminCenterPageDto) {
    return this.read(authorization, async (tx, actor) => {
      const organizationId = actor.organizationId
      const search = `%${query.query ?? ''}%`
      const records = Prisma.sql`WITH refs AS (
        SELECT 'USER_AVATAR:' || u.id::text AS id, 'USER_AVATAR' AS kind, u.id AS owner_id, u.display_name AS owner_name, u.avatar_url AS url, 'PUBLIC' AS visibility, u.updated_at FROM app_users u JOIN organization_memberships m ON m.user_id=u.id WHERE m.organization_id=${organizationId}::uuid AND u.avatar_url IS NOT NULL
        UNION ALL SELECT 'PLAYER_AVATAR:' || id::text, 'PLAYER_AVATAR', id, display_name, avatar_url, 'PUBLIC', updated_at FROM player_profiles WHERE organization_id=${organizationId}::uuid AND avatar_url IS NOT NULL
        UNION ALL SELECT 'PLAYER_PORTRAIT:' || id::text, 'PLAYER_PORTRAIT', id, display_name, portrait_url, 'PUBLIC', updated_at FROM player_profiles WHERE organization_id=${organizationId}::uuid AND portrait_url IS NOT NULL
        UNION ALL SELECT 'TEAM_CREST:' || id::text, 'TEAM_CREST', id, name, crest_url, 'PUBLIC', updated_at FROM teams WHERE organization_id=${organizationId}::uuid AND crest_url IS NOT NULL
        UNION ALL SELECT 'POST_IMAGE:' || id::text, 'POST_IMAGE', id, COALESCE(title,'动态图片'), image_url, CASE WHEN status='PUBLISHED' THEN 'PUBLIC' ELSE 'HIDDEN' END, updated_at FROM posts WHERE organization_id=${organizationId}::uuid AND image_url IS NOT NULL
      )`
      const counts = await tx.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`${records} SELECT count(*) AS count FROM refs WHERE owner_name ILIKE ${search}`,
      )
      const rows = await tx.$queryRaw<
        Array<{
          id: string
          kind: string
          ownerId: string
          ownerName: string
          url: string
          visibility: string
          updatedAt: Date
        }>
      >(
        Prisma.sql`${records} SELECT id,kind,owner_id AS "ownerId",owner_name AS "ownerName",url,visibility,updated_at AS "updatedAt" FROM refs WHERE owner_name ILIKE ${search} ORDER BY updated_at DESC,id ASC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      )
      return page(
        query,
        Number(counts[0]?.count ?? 0),
        rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      )
    })
  }

  system(authorization: string | undefined) {
    return this.read(authorization, async (tx, actor) => {
      const started = performance.now()
      await tx.$queryRaw`SELECT 1`
      const latencyMs = Math.round((performance.now() - started) * 100) / 100
      const where = { organizationId: actor.organizationId }
      const [groups, oldest, last, failures] = await Promise.all([
        tx.outboxJob.groupBy({ by: ['status'], where, _count: { _all: true } }),
        tx.outboxJob.findFirst({
          where: { ...where, status: { in: ['PENDING', 'FAILED_RETRYABLE'] } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        tx.outboxJob.findFirst({
          where: { ...where, status: 'SUCCEEDED' },
          orderBy: { processedAt: 'desc' },
          select: { processedAt: true },
        }),
        tx.outboxJob.findMany({
          where: { ...where, status: { in: ['FAILED_RETRYABLE', 'FAILED_PERMANENT'] } },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 10,
          select: {
            id: true,
            topic: true,
            eventType: true,
            status: true,
            attemptCount: true,
            lastErrorCode: true,
            updatedAt: true,
          },
        }),
      ])
      const counts: Record<string, number> = Object.fromEntries(
        [
          'PENDING',
          'PROCESSING',
          'SUCCEEDED',
          'FAILED_RETRYABLE',
          'FAILED_PERMANENT',
          'CANCELLED',
        ].map((status) => [status, groups.find((row) => row.status === status)?._count._all ?? 0]),
      )
      return {
        api: {
          status: 'ok',
          version: process.env.APP_VERSION ?? '0.1.0',
          checkedAt: new Date().toISOString(),
        },
        database: { status: 'ok', latencyMs },
        worker: {
          status: 'UNKNOWN',
          reason: '当前没有 Worker 心跳接口，最近完成任务不证明进程仍健康',
          lastProcessedAt: last?.processedAt?.toISOString() ?? null,
        },
        outbox: {
          counts,
          total: Object.values(counts).reduce((a, b) => a + b, 0),
          pendingCount: counts.PENDING! + counts.PROCESSING! + counts.FAILED_RETRYABLE!,
          failedCount: counts.FAILED_RETRYABLE! + counts.FAILED_PERMANENT!,
          oldestPendingAt: oldest?.createdAt.toISOString() ?? null,
          recentFailures: failures.map((row) => ({
            ...row,
            updatedAt: row.updatedAt.toISOString(),
          })),
        },
        storage: {
          status: 'UNMEASURED',
          reason: '媒体引用列表不包含磁盘容量、未引用文件和私有材料',
        },
        backup: { status: 'UNVERIFIED', reason: '尚未接入备份结果与恢复验证记录' },
      }
    })
  }

  posts(authorization: string | undefined, query: AdminCenterPageDto) {
    return this.read(authorization, async (tx, actor) => {
      const where: Prisma.PostWhereInput = {
        organizationId: actor.organizationId,
        ...(query.query
          ? {
              OR: [
                { title: { contains: query.query, mode: 'insensitive' } },
                { body: { contains: query.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      }
      const [total, rows] = await Promise.all([
        tx.post.count({ where }),
        tx.post.findMany({
          where,
          select: postFields,
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          ...paging(query),
        }),
      ])
      return page(query, total, rows.map(postView))
    })
  }

  createPost(
    authorization: string | undefined,
    body: AdminCenterCreatePostDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.write(authorization, 'POST /admin/center/posts', body, key, async (tx, actor) => {
      const tournament = await tx.tournament.findFirst({
        where: { id: body.tournamentId, organizationId: actor.organizationId, status: 'PUBLISHED' },
        select: { id: true },
      })
      if (!tournament) throw centerError(409, '请选择本组织已发布的赛事')
      const result = await tx.post.create({
        data: {
          organizationId: actor.organizationId,
          tournamentId: tournament.id,
          authorUserId: actor.userId,
          type: 'OFFICIAL',
          status: 'PUBLISHED',
          title: body.title,
          body: body.body,
        },
        select: postFields,
      })
      await this.auditWrite(
        tx,
        actor,
        'OFFICIAL_POST_PUBLISHED',
        'Post',
        result.id,
        body.reason,
        requestId,
        null,
        { status: 'PUBLISHED', changedFields: ['title', 'body'] },
      )
      return postView(result)
    })
  }

  editPost(
    authorization: string | undefined,
    id: string,
    body: AdminCenterEditDto,
    key: string | undefined,
    requestId: string,
  ) {
    id = id.toLowerCase()
    const patch: { title?: string | null; body?: string; status?: 'PUBLISHED' | 'HIDDEN' } = {}
    if (!Object.keys(body.patch).length) throw centerError(400, '请至少修改一个内容字段')
    for (const [field, value] of Object.entries(body.patch)) {
      if (!['title', 'body', 'status'].includes(field))
        throw centerError(400, `不允许修改字段 ${field}`)
      if (field === 'status') {
        if (value !== 'PUBLISHED' && value !== 'HIDDEN')
          throw centerError(400, '内容状态仅支持发布或隐藏')
        patch.status = value
      } else if (field === 'title' && value === null) patch.title = null
      else {
        if (
          typeof value !== 'string' ||
          value.trim().length > (field === 'title' ? 180 : 2000) ||
          (field === 'body' && !value.trim())
        )
          throw centerError(400, `${field} 内容长度不符合要求`)
        if (field === 'title') patch.title = value.trim() || null
        else patch.body = value.trim()
      }
    }
    return this.write(
      authorization,
      `PATCH /admin/center/posts/${id}`,
      { ...body, patch },
      key,
      async (tx, actor) => {
        const where = { id, organizationId: actor.organizationId }
        const current = await tx.post.findFirst({ where, select: postFields })
        if (!current) throw centerError(404, '本组织中不存在该内容')
        if (current.type === 'OFFICIAL' && patch.title === null)
          throw centerError(400, '官方公告标题不能为空')
        const updated = await tx.post.updateMany({
          where: { ...where, updatedAt: new Date(body.expectedUpdatedAt) },
          data: patch,
        })
        if (updated.count !== 1) throw centerError(409, '内容已变化，请刷新后重新核对')
        const result = await tx.post.findFirstOrThrow({ where, select: postFields })
        await this.auditWrite(
          tx,
          actor,
          'POST_MODERATED',
          'Post',
          id,
          body.reason,
          requestId,
          { status: current.status, fields: { title: current.title, body: current.body } },
          { status: result.status, fields: patch, changedFields: Object.keys(patch) },
        )
        return postView(result)
      },
    )
  }

  createRuleVersion(
    authorization: string | undefined,
    id: string,
    body: AdminCenterRuleVersionDto,
    key: string | undefined,
    requestId: string,
  ) {
    id = id.toLowerCase()
    return this.write(
      authorization,
      `POST /admin/center/tournaments/${id}/rule-versions`,
      body,
      key,
      async (tx, actor) => {
        const tournaments = await tx.$queryRaw<
          Array<{ id: string; status: string }>
        >`SELECT id,status FROM tournaments WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`
        const tournament = tournaments[0]
        if (!tournament) throw centerError(404, '本组织中不存在该赛事')
        if (tournament.status === 'ARCHIVED') throw centerError(409, '已归档赛事不能发布新的规程')
        const latest = await tx.competitionRuleVersion.findFirst({
          where: { organizationId: actor.organizationId, tournamentId: id },
          orderBy: { version: 'desc' },
          select: { version: true },
        })
        const current = latest?.version ?? 0
        if (body.expectedVersion !== current)
          throw centerError(409, '规程版本已变化，请刷新并重新核对')
        if (body.version <= current)
          throw centerError(409, '新规程版本必须高于当前最大版本，不能覆盖历史')
        const boundReport = await tx.match.findFirst({
          where: {
            organizationId: actor.organizationId,
            tournamentId: id,
            reportVersion: { gt: 0 },
          },
          select: { id: true },
        })
        if (boundReport)
          throw centerError(
            409,
            '赛事已有绑定规程的报告，需完成显式规程迁移评审；此入口暂不允许发布新版本',
          )
        const ruleVersionId = randomUUID()
        const rules = await validateManagementRules(
          tx,
          actor.organizationId,
          id,
          ruleVersionId,
          body.rules,
        )
        const row = await tx.competitionRuleVersion.create({
          data: {
            id: ruleVersionId,
            organizationId: actor.organizationId,
            tournamentId: id,
            version: body.version,
            name: body.name,
            rules: json(rules),
            status: 'PUBLISHED',
          },
          select: {
            id: true,
            organizationId: true,
            tournamentId: true,
            version: true,
            name: true,
            status: true,
            rules: true,
            publishedAt: true,
          },
        })
        await this.auditWrite(
          tx,
          actor,
          'COMPETITION_RULE_VERSION_PUBLISHED',
          'Tournament',
          id,
          body.reason,
          requestId,
          { version: current },
          { version: row.version, status: row.status, changedFields: ['rules'] },
        )
        return { ...row, publishedAt: row.publishedAt.toISOString() }
      },
    )
  }
}

function paging(query: AdminCenterPageDto) {
  return { take: query.pageSize, skip: (query.page - 1) * query.pageSize }
}
function page<T>(query: AdminCenterPageDto, total: number, items: T[]) {
  return { items, total, page: query.page, pageSize: query.pageSize }
}
function json(value: unknown): Prisma.InputJsonValue {
  return value === null ? {} : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue)
}
function postView(row: Prisma.PostGetPayload<{ select: typeof postFields }>) {
  return {
    ...row,
    type: row.type === 'OFFICIAL' ? 'OFFICIAL' : row.teamId ? 'TEAM' : 'COMMUNITY',
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
