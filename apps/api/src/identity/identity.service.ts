import { createHash } from 'node:crypto'
import { Inject, Injectable, type HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'
import { ApiHttpException } from '../common/api-http.exception'
import { AccessPolicyService } from '../auth/access-policy.service'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { Prisma } from '../generated/prisma/client'
import type {
  IdentityApplicationDto,
  IdentityKind,
  IdentityRecordDto,
  IdentityReviewDto,
  RevokeIdentityRecordDto,
} from './identity.dto'

type Tx = Prisma.TransactionClient
type Candidate = {
  id: string
  kind: IdentityKind
  displayName: string
  teamId: string | null
  teamName: string | null
}
const includeApplication = { team: { select: { id: true, name: true } } } as const

@Injectable()
export class IdentityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
  ) {}

  async myIdentity(authorization: string | undefined) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(
      async (tx) => {
        await this.fresh(tx, actor, false)
        const user = await tx.user.findUniqueOrThrow({
          where: { id: actor.userId },
          select: { realName: true },
        })
        const name = user.realName?.trim()
        const [players, records, applications, teams] = await Promise.all([
          name
            ? tx.playerProfile.findMany({
                where: {
                  organizationId: actor.organizationId,
                  displayName: { equals: name, mode: 'insensitive' },
                  linkedUser: null,
                },
                select: {
                  id: true,
                  displayName: true,
                  teamMemberships: {
                    where: { status: 'ACTIVE', organizationId: actor.organizationId },
                    select: { team: { select: { id: true, name: true } } },
                    take: 1,
                  },
                },
                orderBy: { id: 'asc' },
                take: 21,
              })
            : Promise.resolve([]),
          name
            ? tx.identityRecord.findMany({
                where: {
                  organizationId: actor.organizationId,
                  displayName: { equals: name, mode: 'insensitive' },
                  status: 'ACTIVE',
                  linkedUserId: null,
                },
                include: { team: { select: { name: true } } },
                orderBy: { id: 'asc' },
                take: 21,
              })
            : Promise.resolve([]),
          tx.identityApplication.findMany({
            where: { organizationId: actor.organizationId, userId: actor.userId },
            include: includeApplication,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 100,
          }),
          tx.team.findMany({
            where: { organizationId: actor.organizationId },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: 200,
          }),
        ])
        const candidates: Candidate[] = [
          ...players.map((p) => ({
            id: `player:${p.id}`,
            kind: 'PLAYER' as const,
            displayName: p.displayName,
            teamId: p.teamMemberships[0]?.team.id ?? null,
            teamName: p.teamMemberships[0]?.team.name ?? null,
          })),
          ...records.map((r) => ({
            id: `record:${r.id}`,
            kind: r.kind as IdentityKind,
            displayName: r.displayName,
            teamId: r.teamId,
            teamName: r.team?.name ?? null,
          })),
        ]
        return {
          candidates: candidates.slice(0, 20),
          hasMoreCandidates: candidates.length > 20,
          applications,
          teams,
          notice: '姓名仅用于提示可能匹配。申请需管理员核实，确认候选不会获得权限。',
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async apply(
    authorization: string | undefined,
    body: IdentityApplicationDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(authorization, 'identity:apply', body, key, false, async (tx, actor) => {
      const currentUser = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { realName: true, playerProfileId: true },
      })
      let candidate: Candidate | undefined
      if (body.candidateId) {
        candidate = await this.candidate(tx, actor.organizationId, body.candidateId)
        const user = currentUser
        if (!user.realName || normalize(candidate.displayName) !== normalize(user.realName))
          throw fail(400, '该候选不属于当前姓名匹配，请主动提交无匹配申请')
        if (candidate.kind !== body.kind) throw fail(400, '申请身份与候选不一致')
      }
      const teamId = body.teamId?.toLowerCase() ?? candidate?.teamId ?? null
      if (candidate?.teamId && candidate.teamId !== teamId) throw fail(400, '申请球队与候选不一致')
      if (body.kind === 'TEAM_CAPTAIN' || body.kind === 'TEAM_COACH') {
        if (!teamId) throw fail(400, '队长或教练申请必须选择球队')
      }
      if (
        teamId &&
        !(await tx.team.findFirst({
          where: { id: teamId, organizationId: actor.organizationId },
          select: { id: true },
        }))
      )
        throw fail(404, '本组织不存在该球队')
      if (body.kind === 'PLAYER' && currentUser.playerProfileId)
        throw fail(409, '账号已经关联球员档案，请联系管理员修正')
      if (
        await tx.identityApplication.findFirst({
          where: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            status: 'PENDING',
            kind: body.kind,
            teamId,
          },
        })
      )
        throw fail(409, '已有同身份和球队的待审核申请，请等待处理')
      const result = await tx.identityApplication.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.userId,
          kind: body.kind,
          teamId,
          candidateId: body.candidateId ?? null,
          message: body.message,
        },
        include: includeApplication,
      })
      await this.audit(tx, actor, 'IDENTITY_APPLICATION_CREATED', result.id, requestId, {
        kind: body.kind,
        teamId,
        status: result.status,
      })
      return result
    })
  }

  async applications(authorization: string | undefined, requestId: string) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(
      async (tx) => {
        await this.fresh(tx, actor, true)
        await this.audit(
          tx,
          actor,
          'IDENTITY_APPLICATIONS_VIEWED',
          actor.organizationId,
          requestId,
          {},
        )
        const include = {
          ...includeApplication,
          user: { select: { id: true, displayName: true, realName: true } },
        } as const
        const pending = await tx.identityApplication.findMany({
          where: { organizationId: actor.organizationId, status: 'PENDING' },
          include,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 201,
        })
        const items = pending.slice(0, 200)
        if (items.length < 200)
          items.push(
            ...(await tx.identityApplication.findMany({
              where: { organizationId: actor.organizationId, status: { not: 'PENDING' } },
              include,
              orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
              take: 200 - items.length,
            })),
          )
        return { items, hasMorePending: pending.length > 200 }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async records(authorization: string | undefined) {
    const actor = await this.auth.requireSession(authorization)
    this.policy.requireOrganizationAdministrator(actor)
    const [items, teams, players, tournaments, matches] = await Promise.all([
      this.prisma.identityRecord.findMany({
        where: { organizationId: actor.organizationId },
        include: { team: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.team.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      this.prisma.playerProfile.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, displayName: true },
        orderBy: { displayName: 'asc' },
        take: 500,
      }),
      this.prisma.tournament.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, name: true },
        take: 200,
      }),
      this.prisma.match.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, matchCode: true },
        take: 500,
      }),
    ])
    return { items, teams, players, tournaments, matches }
  }

  async createRecord(
    authorization: string | undefined,
    body: IdentityRecordDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(
      authorization,
      'identity:record:create',
      body,
      key,
      true,
      async (tx, actor) => {
        let scopeType = 'ORGANIZATION',
          scopeId = actor.organizationId
        if (body.kind === 'TEAM_CAPTAIN' || body.kind === 'TEAM_COACH') {
          if (!body.teamId || body.scopeId || body.scopeType)
            throw fail(400, '队长和教练必须且只能指定本组织球队')
          if (
            !(await tx.team.findFirst({
              where: { id: body.teamId, organizationId: actor.organizationId },
              select: { id: true },
            }))
          )
            throw fail(404, '本组织不存在该球队')
          scopeType = 'TEAM'
          scopeId = body.teamId.toLowerCase()
        } else if (body.kind === 'MATCH_REPORTER') {
          if (!body.scopeType || !body.scopeId || body.teamId)
            throw fail(400, '信息管理员必须指定比赛或赛事范围')
          const found =
            body.scopeType === 'MATCH'
              ? await tx.match.findFirst({
                  where: { id: body.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
              : await tx.tournament.findFirst({
                  where: { id: body.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
          if (!found) throw fail(404, '本组织不存在该授权对象')
          scopeType = body.scopeType
          scopeId = found.id
        } else if (body.teamId || body.scopeId || body.scopeType)
          throw fail(400, '学生和球员身份不能指定管理权限范围')
        if (body.kind === 'PLAYER') {
          if (
            !body.playerProfileId ||
            !(await tx.playerProfile.findFirst({
              where: { id: body.playerProfileId, organizationId: actor.organizationId },
              select: { id: true },
            }))
          )
            throw fail(400, '球员身份必须选择本组织球员档案')
        } else if (body.playerProfileId)
          throw fail(400, '教练及其他工作人员身份独立于球员档案，请分别认证')
        const result = await tx.identityRecord.create({
          data: {
            organizationId: actor.organizationId,
            displayName: body.displayName,
            kind: body.kind,
            teamId: body.teamId ?? null,
            playerProfileId: body.playerProfileId ?? null,
            scopeType,
            scopeId,
            createdByUserId: actor.userId,
          },
        })
        await this.audit(
          tx,
          actor,
          'IDENTITY_RECORD_CREATED',
          result.id,
          requestId,
          { kind: result.kind, scopeType, scopeId },
          body.reason,
        )
        return result
      },
    )
  }

  async review(
    authorization: string | undefined,
    id: string,
    body: IdentityReviewDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(
      authorization,
      `identity:review:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const application = await tx.identityApplication.findFirst({
          where: { id, organizationId: actor.organizationId },
        })
        if (!application) throw fail(404, '申请不存在')
        if (application.userId === actor.userId) throw fail(403, '不能审核自己的认证申请')
        if (application.status !== 'PENDING' || application.version !== body.expectedVersion)
          throw fail(409, '申请已处理或版本变化，请刷新后核对')
        const applicant = await tx.user.findFirst({
          where: {
            id: application.userId,
            status: 'ACTIVE',
            memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
          },
          select: { id: true, playerProfileId: true, verificationLevel: true },
        })
        if (!applicant) throw fail(409, '申请人的账号或组织成员身份已失效')
        const resolved = body.resolvedCandidateId ?? application.candidateId
        if (body.decision === 'APPROVED') {
          if (!resolved) throw fail(400, '批准前必须指定核实后的名单记录或球员档案，并填写核实依据')
          const candidate = await this.candidate(tx, actor.organizationId, resolved)
          if (
            candidate.kind !== application.kind ||
            (application.teamId && candidate.teamId !== application.teamId)
          )
            throw fail(400, '核实对象与申请身份或球队不一致')
          const parsed = parseCandidate(resolved)
          const record =
            parsed.type === 'record'
              ? await tx.identityRecord.findUniqueOrThrow({ where: { id: parsed.id } })
              : null
          const playerId = record?.playerProfileId ?? (parsed.type === 'player' ? parsed.id : null)
          if (application.kind === 'PLAYER') {
            if (!playerId) throw fail(400, '球员记录未指定球员档案')
            if (applicant.playerProfileId && applicant.playerProfileId !== playerId)
              throw fail(409, '申请人已关联其他球员，不能覆盖')
            const claimed = await tx.user.findFirst({
              where: { playerProfileId: playerId, id: { not: applicant.id } },
              select: { id: true },
            })
            if (claimed) throw fail(409, '球员档案已关联其他账号，请人工核查')
            await tx.user.update({
              where: { id: applicant.id },
              data: { playerProfileId: playerId, verificationLevel: 'PLAYER_CONFIRMED' },
            })
          } else if (application.kind === 'STUDENT') {
            if (applicant.verificationLevel === 'UNVERIFIED')
              await tx.user.update({
                where: { id: applicant.id },
                data: { verificationLevel: 'STUDENT_VERIFIED' },
              })
          } else {
            if (!record) throw fail(400, '工作人员角色必须关联管理员录入的任职记录')
            const role = record.kind as 'TEAM_CAPTAIN' | 'TEAM_COACH' | 'MATCH_REPORTER'
            if (
              await tx.identityRecord.findFirst({
                where: {
                  organizationId: actor.organizationId,
                  linkedUserId: applicant.id,
                  kind: role,
                  scopeType: record.scopeType,
                  scopeId: record.scopeId,
                  status: 'ACTIVE',
                },
              })
            )
              throw fail(409, '账号已有同范围有效任职记录，请先核查并撤销原任职')
            if (
              await tx.roleAssignment.findFirst({
                where: {
                  userId: applicant.id,
                  role,
                  scopeType: record.scopeType as 'TEAM' | 'MATCH' | 'TOURNAMENT',
                  scopeId: record.scopeId,
                  revokedAt: null,
                },
              })
            )
              throw fail(409, '该账号已持有该范围任职，请核查现有授权，不能重复关联任职记录')
            const assignment = await tx.roleAssignment.upsert({
              where: {
                userId_role_scopeType_scopeId: {
                  userId: applicant.id,
                  role,
                  scopeType: record.scopeType as 'TEAM' | 'MATCH' | 'TOURNAMENT',
                  scopeId: record.scopeId,
                },
              },
              create: {
                organizationId: actor.organizationId,
                userId: applicant.id,
                role,
                scopeType: record.scopeType as 'TEAM' | 'MATCH' | 'TOURNAMENT',
                scopeId: record.scopeId,
                grantedByUserId: actor.userId,
              },
              update: { revokedAt: null, grantedAt: new Date(), grantedByUserId: actor.userId },
            })
            await tx.identityRecord.update({
              where: { id: record.id },
              data: { grantedAssignmentId: assignment.id },
            })
            if (applicant.verificationLevel === 'UNVERIFIED')
              await tx.user.update({
                where: { id: applicant.id },
                data: { verificationLevel: 'STAFF_VERIFIED' },
              })
          }
          if (record)
            await tx.identityRecord.update({
              where: { id: record.id },
              data: { linkedUserId: applicant.id, version: { increment: 1 } },
            })
        }
        const result = await tx.identityApplication.update({
          where: { id },
          data: {
            status: body.decision,
            reviewedByUserId: actor.userId,
            reviewedAt: new Date(),
            decisionNote: body.note,
            resolvedCandidateId: body.decision === 'APPROVED' ? resolved : null,
            version: { increment: 1 },
          },
          include: includeApplication,
        })
        await this.audit(
          tx,
          actor,
          `IDENTITY_APPLICATION_${body.decision}`,
          id,
          requestId,
          {
            userId: applicant.id,
            kind: application.kind,
            status: result.status,
            resolvedCandidateId: result.resolvedCandidateId,
            version: result.version,
          },
          body.note,
        )
        return result
      },
    )
  }

  async revokeRecord(
    authorization: string | undefined,
    id: string,
    body: RevokeIdentityRecordDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(
      authorization,
      `identity:record:revoke:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const record = await tx.identityRecord.findFirst({
          where: { id, organizationId: actor.organizationId },
        })
        if (!record) throw fail(404, '任职记录不存在')
        if (record.status !== 'ACTIVE' || record.version !== body.expectedVersion)
          throw fail(409, '任职记录已变化，请刷新')
        if (record.grantedAssignmentId)
          await tx.roleAssignment.updateMany({
            where: {
              id: record.grantedAssignmentId,
              organizationId: actor.organizationId,
              userId: record.linkedUserId ?? '',
              role: record.kind as 'TEAM_COACH' | 'TEAM_CAPTAIN' | 'MATCH_REPORTER',
              scopeId: record.scopeId,
            },
            data: { revokedAt: new Date() },
          })
        const result = await tx.identityRecord.update({
          where: { id },
          data: { status: 'REVOKED', version: { increment: 1 } },
        })
        await this.audit(
          tx,
          actor,
          'IDENTITY_RECORD_REVOKED',
          id,
          requestId,
          { kind: record.kind, linkedUserId: record.linkedUserId, version: result.version },
          body.reason,
        )
        return result
      },
    )
  }

  private async candidate(tx: Tx, organizationId: string, value: string): Promise<Candidate> {
    const parsed = parseCandidate(value)
    if (parsed.type === 'player') {
      const player = await tx.playerProfile.findFirst({
        where: { id: parsed.id, organizationId, linkedUser: null },
        select: {
          id: true,
          displayName: true,
          teamMemberships: {
            where: { organizationId, status: 'ACTIVE' },
            select: { team: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      })
      if (!player) throw fail(409, '候选已关联、撤销或不存在，请刷新后核查')
      return {
        id: value,
        kind: 'PLAYER',
        displayName: player.displayName,
        teamId: player.teamMemberships[0]?.team.id ?? null,
        teamName: player.teamMemberships[0]?.team.name ?? null,
      }
    }
    const record = await tx.identityRecord.findFirst({
      where: { id: parsed.id, organizationId, status: 'ACTIVE', linkedUserId: null },
      include: { team: { select: { name: true } } },
    })
    if (!record) throw fail(409, '候选已关联、撤销或不存在，请刷新后核查')
    return {
      id: value,
      kind: record.kind as IdentityKind,
      displayName: record.displayName,
      teamId: record.teamId,
      teamName: record.team?.name ?? null,
    }
  }

  private async fresh(tx: Tx, actor: AuthenticatedSession, admin: boolean) {
    const session = await tx.userSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          status: 'ACTIVE',
          memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
        },
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    })
    if (!session) throw fail(401, '登录或组织身份已失效')
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
    const fresh = { ...actor, user: { ...actor.user, roles } }
    if (admin) this.policy.requireOrganizationAdministrator(fresh)
    return fresh
  }

  private async command<T>(
    authorization: string | undefined,
    route: string,
    body: unknown,
    key: string | undefined,
    admin: boolean,
    run: (tx: Tx, actor: AuthenticatedSession) => Promise<T>,
  ): Promise<T> {
    const actor = await this.auth.requireSession(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw fail(400, '请提供8–128字符的 Idempotency-Key')
    const hash = createHash('sha256')
      .update(JSON.stringify({ organizationId: actor.organizationId, body }))
      .digest('hex')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const fresh = await this.fresh(tx, actor, admin)
            const prior = await tx.idempotencyRecord.findUnique({
              where: {
                userId_route_idempotencyKey: { userId: actor.userId, route, idempotencyKey: key },
              },
            })
            if (prior) {
              if (prior.organizationId !== actor.organizationId || prior.requestHash !== hash)
                throw fail(409, '幂等键不能用于不同请求')
              return prior.responseBody as T
            }
            const result = await run(tx, fresh)
            await tx.idempotencyRecord.create({
              data: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                route,
                idempotencyKey: key,
                requestHash: hash,
                responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
                responseStatus: 200,
                expiresAt: new Date(Date.now() + 7 * 86400000),
              },
            })
            return result
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        )
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        ) {
          if (attempt < 2) continue
          throw fail(409, '申请、角色或关联已存在或正在处理，请刷新后重试')
        }
        throw error
      }
    }
    throw fail(409, '并发变更，请重试')
  }

  private audit(
    tx: Tx,
    actor: AuthenticatedSession,
    action: string,
    targetId: string,
    requestId: string,
    after: Prisma.InputJsonObject,
    reason?: string,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorType: 'USER',
        actorUserId: actor.userId,
        actorRoleSnapshot: actor.user.roles.map(({ role, scopeType, scopeId }) => ({
          role,
          scopeType,
          scopeId,
        })),
        action,
        targetType: 'Identity',
        targetId,
        afterSummary: after,
        reason: reason ?? null,
        requestId,
        source: 'API',
      },
    })
  }
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN')
}
function parseCandidate(value: string) {
  const [type, id, extra] = value.split(':')
  if ((type !== 'player' && type !== 'record') || !id || extra || !isUUID(id))
    throw fail(400, '候选编号无效')
  return { type, id: id.toLowerCase() }
}
function fail(status: number, message: string) {
  const code =
    status === 400
      ? ERROR_CODES.BAD_REQUEST
      : status === 401
        ? ERROR_CODES.UNAUTHORIZED
        : status === 403
          ? ERROR_CODES.FORBIDDEN
          : status === 404
            ? ERROR_CODES.NOT_FOUND
            : ERROR_CODES.CONFLICT
  return new ApiHttpException(status as HttpStatus, { code, message })
}
