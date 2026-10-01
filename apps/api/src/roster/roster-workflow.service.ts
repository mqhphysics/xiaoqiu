import { createHash } from 'node:crypto'

import { HttpStatus, Inject, Injectable } from '@nestjs/common'

import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { Prisma, type RosterSubmissionStatus } from '../generated/prisma/client'
import type { RosterWorkflowCommandDto } from './roster-workflow.dto'
import { nextRosterStatus, parseRosterPolicy, rosterError, validateRosterPlayers, type RosterPlayerInput } from './roster-workflow.rules'

const registrationInclude = {
  team: true,
  tournament: { include: { ruleVersions: { where: { status: 'PUBLISHED' as const }, orderBy: { version: 'desc' as const }, take: 1 } } },
  rosterSubmissions: { orderBy: { submissionVersion: 'desc' as const }, take: 1, include: { entries: { orderBy: { sortOrder: 'asc' as const }, include: { playerProfile: true } } } },
  rosterSnapshots: { where: { lockedAt: { not: null } }, orderBy: { snapshotVersion: 'desc' as const }, take: 1 },
} satisfies Prisma.TeamRegistrationInclude
type Registration = Prisma.TeamRegistrationGetPayload<{ include: typeof registrationInclude }>
type Tx = Prisma.TransactionClient

@Injectable()
export class RosterWorkflowService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuthService) private readonly auth: AuthService) {}

  async read(authorization: string | undefined, tournamentId: string, teamId: string) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actor, tournamentId, teamId, false)
      return this.toView(tx, await this.registration(tx, actor.organizationId, tournamentId, teamId))
    })
  }

  async execute(authorization: string | undefined, tournamentId: string, teamId: string, command: RosterWorkflowCommandDto, key: string | undefined, requestId: string) {
    const actor = await this.auth.requireSession(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw rosterError(400, '请提供有效的 Idempotency-Key（8–128 个字符）')
    const adminOnly = ['RETURN', 'APPROVE', 'LOCK', 'REOPEN'].includes(command.action)
    const route = `/roster/tournaments/${tournamentId}/teams/${teamId}`
    const requestHash = hash({ organizationId: actor.organizationId, command })

    // Serializes both first drafts and later transitions for the same registration.
    // Retry only serialization failures; the idempotency record and effects share one transaction.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await this.authorize(tx, actor, tournamentId, teamId, adminOnly)
          await tx.$queryRaw`SELECT id FROM team_registrations WHERE organization_id = ${actor.organizationId}::uuid AND tournament_id = ${tournamentId}::uuid AND team_id = ${teamId}::uuid FOR UPDATE`
          const registration = await this.registration(tx, actor.organizationId, tournamentId, teamId)
          const existing = await tx.idempotencyRecord.findUnique({ where: { userId_route_idempotencyKey: { userId: actor.userId, route, idempotencyKey: key } } })
          if (existing) {
            if (existing.organizationId !== actor.organizationId || existing.requestHash !== requestHash) throw rosterError(409, '同一幂等键不能用于不同请求')
            if (existing.responseBody === null) throw rosterError(409, '请求正在处理，请使用原幂等键重试')
            return existing.responseBody
          }
          if (['WITHDRAWN', 'SUSPENDED'].includes(registration.status)) throw rosterError(409, '已撤回或暂停的报名不能修改名单')
          const latest = registration.rosterSubmissions[0]
          const version = latest?.submissionVersion ?? 0
          if (command.expectedVersion !== version) throw rosterError(409, '名单已被更新，请读取最新版本后再编辑')
          const status = nextRosterStatus(command.action, latest?.status ?? null, command.reason) as RosterSubmissionStatus
          const ruleVersion = registration.tournament.ruleVersions[0]
          const policy = parseRosterPolicy(ruleVersion?.rules)
          if (!policy) throw rosterError(409, '赛事尚未配置名单人数、资格名单与提交期限，请联系赛事管理员')
          if (!['SAVE', 'SUBMIT'].includes(command.action) && command.players !== undefined) throw rosterError(400, '审核操作不能同时替换名单；请先退回再修订')
          const entries: RosterPlayerInput[] = command.players?.map((player) => ({ playerId: player.playerId, shirtNumber: player.shirtNumber?.trim() || null })) ?? latest?.entries.map((entry) => ({ playerId: entry.playerProfileId, shirtNumber: entry.shirtNumber })) ?? []
          const isRosterWrite = ['SAVE', 'SUBMIT', 'APPROVE', 'LOCK'].includes(command.action)
          if (isRosterWrite) {
            validateRosterPlayers(entries, policy, command.action !== 'SAVE')
            await this.requireTeamPlayers(tx, actor.organizationId, teamId, entries)
          }
          if (['SAVE', 'SUBMIT'].includes(command.action) && Date.now() >= Date.parse(policy.submissionDeadline)) {
            const lastLock = await tx.rosterSubmission.findFirst({ where: { organizationId: actor.organizationId, teamRegistrationId: registration.id, status: 'LOCKED' }, orderBy: { submissionVersion: 'desc' } })
            const supplemental = lastLock && await tx.rosterSubmission.findFirst({ where: { organizationId: actor.organizationId, teamRegistrationId: registration.id, status: 'REOPENED', submissionVersion: { gt: lastLock.submissionVersion } } })
            if (!supplemental) throw rosterError(409, '名单提交期限已过；锁定名单需由管理员说明原因后开放补报')
          }
          // A rule change must be acknowledged through a new edit/submission before approval.
          if (['APPROVE', 'LOCK'].includes(command.action) && latest) {
            const priorAudit = await tx.auditLog.findFirst({ where: { organizationId: actor.organizationId, targetType: 'RosterSubmission', targetId: latest.id }, orderBy: { createdAt: 'desc' } })
            const summary = priorAudit?.afterSummary as { ruleVersionId?: string } | null
            if (summary?.ruleVersionId !== ruleVersion?.id) throw rosterError(409, '赛事规程已变化，请退回名单重新确认资格后提交')
          }
          const nextVersion = version + 1
          const now = new Date()
          const submission = await tx.rosterSubmission.create({ data: {
            organizationId: actor.organizationId, teamRegistrationId: registration.id, submissionVersion: nextVersion, status,
            sourceFileHash: hash({ registrationId: registration.id, nextVersion, status, entries }),
            submittedAt: status === 'SUBMITTED' ? now : latest?.submittedAt ?? null,
            approvedAt: status === 'APPROVED' || status === 'LOCKED' ? now : null,
            lockedAt: status === 'LOCKED' ? now : null,
            entries: { create: entries.map((entry, sortOrder) => ({ organizationId: actor.organizationId, playerProfileId: entry.playerId, shirtNumber: entry.shirtNumber, sortOrder })) },
          } })
          if (status === 'LOCKED') {
            const profiles = await tx.playerProfile.findMany({ where: { organizationId: actor.organizationId, id: { in: entries.map((entry) => entry.playerId) } } })
            const byId = new Map(profiles.map((profile) => [profile.id, profile]))
            await tx.rosterSnapshot.create({ data: {
              organizationId: actor.organizationId, tournamentId, teamId, teamRegistrationId: registration.id,
              rosterSubmissionId: submission.id, snapshotVersion: (registration.rosterSnapshots[0]?.snapshotVersion ?? 0) + 1,
              sourceFileHash: submission.sourceFileHash, lockedAt: now,
              entries: { create: entries.map((entry, sortOrder) => ({ organizationId: actor.organizationId, playerProfileId: entry.playerId, shirtNumber: entry.shirtNumber, sortOrder, displayName: byId.get(entry.playerId)!.displayName, studentIdMasked: byId.get(entry.playerId)!.studentIdMasked })) },
            } })
          }
          if (status === 'LOCKED') await tx.teamRegistration.updateMany({ where: { id: registration.id, organizationId: actor.organizationId }, data: { status: 'APPROVED', approvedAt: now } })
          await tx.auditLog.create({ data: {
            organizationId: actor.organizationId, actorType: 'USER', actorUserId: actor.userId,
            actorRoleSnapshot: actor.user.roles as unknown as Prisma.InputJsonValue,
            action: `ROSTER_${command.action}`, targetType: 'RosterSubmission', targetId: submission.id,
            beforeSummary: { version, status: latest?.status ?? null },
            afterSummary: { version: nextVersion, status, playerCount: entries.length, registrationId: registration.id, tournamentId, teamId, ruleVersionId: ruleVersion!.id },
            reason: command.reason?.trim() ?? null, requestId, source: 'roster-workflow',
          } })
          // A real transactional event, not a fabricated delivered notification.
          // The integrator's worker must consume this topic into roster notifications.
          await tx.outboxJob.create({ data: {
            organizationId: actor.organizationId, topic: 'roster.workflow', aggregateType: 'TeamRegistration', aggregateId: registration.id,
            eventType: `ROSTER_${command.action}`, deduplicationKey: `roster:${registration.id}:${nextVersion}`,
            payload: { tournamentId, teamId, submissionId: submission.id, version: nextVersion, status, actorUserId: actor.userId, reason: command.reason?.trim() ?? null }, correlationId: requestId,
          } })
          const view = await this.toView(tx, await this.registration(tx, actor.organizationId, tournamentId, teamId))
          await tx.idempotencyRecord.create({ data: {
            organizationId: actor.organizationId, userId: actor.userId, route, idempotencyKey: key, requestHash,
            responseStatus: 200, responseBody: JSON.parse(JSON.stringify(view)) as Prisma.InputJsonValue,
            resourceType: 'RosterSubmission', resourceId: submission.id, expiresAt: new Date(now.getTime() + 7 * 86400000),
          } })
          return view
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
          if (attempt < 2) continue
          throw rosterError(409, '名单正在被更新，请使用原幂等键重试')
        }
        throw error
      }
    }
    throw rosterError(409, '请重试')
  }

  private async authorize(tx: Tx, actor: AuthenticatedSession, tournamentId: string, teamId: string, adminOnly: boolean) {
    const session = await tx.userSession.findFirst({ where: { id: actor.sessionId, userId: actor.userId, organizationId: actor.organizationId, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: 'ACTIVE' }, organization: { status: 'ACTIVE' } } })
    const membership = await tx.organizationMembership.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId, status: 'ACTIVE' } })
    if (!session || !membership) throw rosterError(401, '登录或组织成员身份已失效')
    const roles = await tx.roleAssignment.findMany({ where: { userId: actor.userId, revokedAt: null, OR: [{ organizationId: actor.organizationId }, { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' }] } })
    const admin = roles.some((role) =>
      (role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM') ||
      (role.role === 'ORGANIZATION_ADMIN' && role.scopeType === 'ORGANIZATION' && role.scopeId === actor.organizationId) ||
      (role.role === 'TOURNAMENT_ADMIN' && role.scopeType === 'TOURNAMENT' && role.scopeId === tournamentId))
    const captain = roles.some((role) => role.role === 'TEAM_CAPTAIN' && role.scopeType === 'TEAM' && role.scopeId === teamId)
    if (!admin && (adminOnly || !captain)) throw rosterError(403, adminOnly ? '此操作需要本赛事管理员权限' : '只能管理本人获授权球队的名单')
  }

  private async registration(tx: Tx, organizationId: string, tournamentId: string, teamId: string): Promise<Registration> {
    const registration = await tx.teamRegistration.findFirst({ where: { organizationId, tournamentId, teamId }, include: registrationInclude })
    if (!registration) throw rosterError(404, '本组织赛事中没有该球队的报名')
    return registration
  }

  private async requireTeamPlayers(tx: Tx, organizationId: string, teamId: string, players: RosterPlayerInput[]) {
    const ids = players.map((player) => player.playerId)
    const members = await tx.teamMembership.findMany({ where: { organizationId, teamId, status: 'ACTIVE', playerProfileId: { in: ids }, playerProfile: { organizationId } }, select: { playerProfileId: true } })
    if (new Set(members.map((member) => member.playerProfileId)).size !== ids.length) throw rosterError(400, '只能选择本组织本队已关联球员档案的现役成员')
  }

  private async toView(tx: Tx, registration: Registration) {
    const latest = registration.rosterSubmissions[0]
    const ruleVersion = registration.tournament.ruleVersions[0]
    const policy = parseRosterPolicy(ruleVersion?.rules)
    const [members, audit] = await Promise.all([
      tx.teamMembership.findMany({ where: { organizationId: registration.organizationId, teamId: registration.teamId, status: 'ACTIVE', playerProfileId: { not: null } }, include: { playerProfile: true }, orderBy: { joinedAt: 'asc' } }),
      latest ? tx.auditLog.findFirst({ where: { organizationId: registration.organizationId, targetType: 'RosterSubmission', targetId: latest.id }, orderBy: { createdAt: 'desc' } }) : null,
    ])
    return {
      tournamentId: registration.tournamentId, tournamentName: registration.tournament.name, teamId: registration.teamId,
      registrationId: registration.id, registrationStatus: registration.status, version: latest?.submissionVersion ?? 0, status: latest?.status ?? 'DRAFT',
      policy: policy ? { minPlayers: policy.minPlayers, maxPlayers: policy.maxPlayers, submissionDeadline: policy.submissionDeadline, ruleVersionId: ruleVersion!.id } : null,
      decisionReason: audit?.reason ?? null,
      lockedSnapshot: registration.rosterSnapshots[0] ? { id: registration.rosterSnapshots[0].id, version: registration.rosterSnapshots[0].snapshotVersion } : null,
      players: latest?.entries.map((entry) => ({ playerId: entry.playerProfileId, displayName: entry.playerProfile.displayName, shirtNumber: entry.shirtNumber })) ?? [],
      availablePlayers: members.flatMap((member) => member.playerProfile ? [{ playerId: member.playerProfile.id, displayName: member.playerProfile.displayName, avatarUrl: member.playerProfile.avatarUrl, position: member.position ?? member.playerProfile.position, eligible: policy?.eligiblePlayerIds.includes(member.playerProfile.id) ?? false }] : []),
    }
  }
}

function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
