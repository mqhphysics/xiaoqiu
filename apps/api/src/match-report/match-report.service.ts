import { createHash } from 'node:crypto'
import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { Prisma, type MatchReportRevision } from '../generated/prisma/client'
import { parseResultsRules } from '../results/parse-rules'
import type {
  ReportFieldsDto,
  ReportHistoryQueryDto,
  WriteMatchReportDto,
} from './match-report.dto'
import {
  canonicalFields,
  nextReportStatus,
  ReportRuleError,
  reportFieldsEqual,
  requireForfeitScore,
  validateReportFields,
  type ReportStatus,
} from './match-report.logic'

const MATCH_INCLUDE = { homeTeam: true, awayTeam: true, stage: true } as const
type ReportMatch = Prisma.MatchGetPayload<{ include: typeof MATCH_INCLUDE }>
type Database = Prisma.TransactionClient
const DAY = 24 * 60 * 60 * 1000

@Injectable()
export class MatchReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async get(authorization: string | undefined, matchId: string) {
    matchId = matchId.toLowerCase()
    const session = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(
      async (tx) => {
        const match = await this.requireMatch(tx, session.organizationId, matchId)
        const privilege = await this.privilege(tx, session, match)
        this.requireRead(privilege)
        return this.workspace(tx, match, privilege)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  async history(authorization: string | undefined, matchId: string, query: ReportHistoryQueryDto) {
    matchId = matchId.toLowerCase()
    const session = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(
      async (tx) => {
        const match = await this.requireMatch(tx, session.organizationId, matchId)
        this.requireRead(await this.privilege(tx, session, match))
        const limit = query.limit ?? 30
        const revisions = await tx.matchReportRevision.findMany({
          where: {
            organizationId: session.organizationId,
            matchId,
            ...(query.beforeVersion ? { version: { lt: query.beforeVersion } } : {}),
          },
          orderBy: { version: 'desc' },
          take: limit + 1,
        })
        const page = revisions.slice(0, limit)
        const authors = await this.authors(tx, page)
        const items = await Promise.all(
          page.map(async (revision) => {
            const context = await this.context(tx, match, revision)
            return {
              ...this.revisionView(revision, authors),
              homePlayers: context.home?.entries.map(playerView) ?? [],
              awayPlayers: context.away?.entries.map(playerView) ?? [],
            }
          }),
        )
        return {
          items,
          nextBeforeVersion: revisions.length > limit ? (page.at(-1)?.version ?? null) : null,
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  async write(
    authorization: string | undefined,
    matchId: string,
    body: WriteMatchReportDto,
    requestId: string,
  ): Promise<unknown> {
    matchId = matchId.toLowerCase()
    const session = await this.auth.requireSession(authorization)
    const route = `POST /matches/${matchId}/report`
    const requestHash = createHash('sha256')
      .update(JSON.stringify(canonicalCommand(body)))
      .digest('hex')
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const match = await this.requireMatch(tx, session.organizationId, matchId)
          const privilege = await this.privilege(tx, session, match)
          this.requireRead(privilege)
          if (['RETURN', 'CONFIRM', 'CORRECT'].includes(body.action) && !privilege.administrator)
            throw forbidden('此操作需要本赛事的管理员权限')
          const existing = await tx.idempotencyRecord.findUnique({
            where: {
              userId_route_idempotencyKey: {
                userId: session.userId,
                route,
                idempotencyKey: body.clientActionId,
              },
            },
          })
          if (existing) return this.replay(existing, requestHash, session.organizationId)
          await tx.idempotencyRecord.create({
            data: {
              organizationId: session.organizationId,
              userId: session.userId,
              route,
              idempotencyKey: body.clientActionId,
              requestHash,
              expiresAt: new Date(Date.now() + 30 * DAY),
            },
          })
          if (match.reportVersion !== body.expectedVersion)
            throw conflict('其他工作人员已保存新版本。请先核对最新版本。', {
              currentVersion: match.reportVersion,
              expectedVersion: body.expectedVersion,
            })
          const previous = await this.latest(tx, match)
          if (previous) this.requireUnchangedMatchContext(match, previous)
          let status: ReportStatus
          try {
            status = nextReportStatus(
              (previous?.status as ReportStatus) ?? null,
              body.action,
              privilege.administrator,
            )
          } catch (cause) {
            if (cause instanceof ReportRuleError) throw conflict(cause.message)
            throw cause
          }
          const reviewing = body.action === 'RETURN' || body.action === 'CONFIRM'
          if (
            reviewing &&
            (body.fields !== undefined ||
              body.homeRosterSnapshotId !== undefined ||
              body.awayRosterSnapshotId !== undefined ||
              body.ruleVersionId !== undefined)
          )
            throw invalid('审核只能复制已经提交的版本，不能替换比分、事件或快照')
          if (
            !reviewing &&
            (!body.fields ||
              !body.homeRosterSnapshotId ||
              !body.awayRosterSnapshotId ||
              !body.ruleVersionId)
          )
            throw invalid('保存必须提供完整报告和双方锁定名单、规程版本')
          const binding = reviewing
            ? previous!
            : {
                homeRosterSnapshotId: body.homeRosterSnapshotId!,
                awayRosterSnapshotId: body.awayRosterSnapshotId!,
                ruleVersionId: body.ruleVersionId!,
              }
          if (
            previous &&
            (binding.homeRosterSnapshotId !== previous.homeRosterSnapshotId ||
              binding.awayRosterSnapshotId !== previous.awayRosterSnapshotId ||
              binding.ruleVersionId !== previous.ruleVersionId)
          )
            throw conflict('该报告已绑定固定名单和规程版本，不能悄悄替换上下文')
          const context = await this.context(tx, match, binding)
          if (!context.home || !context.away || !context.rule)
            throw conflict('双方名单必须锁定且对应本比赛，赛事必须有已发布规程版本')
          const blockingReasons = this.blockingReasons(match, context)
          if (body.action !== 'RETURN' && blockingReasons.length)
            throw conflict(blockingReasons.join('；'))
          const fields = reviewing ? parseFields(previous!.fields) : body.fields!
          try {
            validateReportFields(
              fields,
              {
                homePlayerIds: new Set(context.home.entries.map((entry) => entry.playerProfileId)),
                awayPlayerIds: new Set(context.away.entries.map((entry) => entry.playerProfileId)),
                isKnockout: match.stage?.type === 'KNOCKOUT',
              },
              body.action === 'SUBMIT' || body.action === 'CONFIRM',
            )
          } catch (cause) {
            if (cause instanceof ReportRuleError) throw invalid(cause.message)
            throw cause
          }
          const reason = body.reason.trim()
          if (body.action === 'CONFIRM') {
            try {
              requireForfeitScore(fields, context.rule.rules)
            } catch (cause) {
              if (cause instanceof ReportRuleError) throw invalid(cause.message)
              throw cause
            }
          }
          if (
            (body.action === 'RETURN' ||
              body.action === 'CORRECT' ||
              (!reviewing &&
                ((fields.outcome !== 'FINISHED' && !previous?.reason) ||
                  (previous && !reportFieldsEqual(parseFields(previous.fields), fields))))) &&
            reason.length < 2
          )
            throw invalid('请填写至少两个字的退回、修正或比赛判定原因')
          const version = match.reportVersion + 1
          const cas = await tx.match.updateMany({
            where: {
              id: match.id,
              organizationId: session.organizationId,
              reportVersion: body.expectedVersion,
            },
            data: { reportVersion: version },
          })
          if (cas.count !== 1) throw conflict('报告已被其他工作人员更新，你的修改未覆盖新版本')
          const revision = await tx.matchReportRevision.create({
            data: {
              organizationId: session.organizationId,
              matchId: match.id,
              version,
              status,
              action: body.action,
              fields: { ...canonicalFields(fields), _matchContext: this.matchContext(match) },
              homeRosterSnapshotId: context.home.id,
              awayRosterSnapshotId: context.away.id,
              ruleVersionId: context.rule.id,
              createdByUserId: session.userId,
              reason: reason || (fields.outcome !== 'FINISHED' ? (previous?.reason ?? '') : ''),
            },
          })
          if (body.action === 'CONFIRM') {
            const abandoned = fields.outcome === 'ABANDONED'
            await tx.match.updateMany({
              where: {
                id: match.id,
                organizationId: session.organizationId,
                reportVersion: version,
              },
              data: {
                confirmedReportVersion: version,
                status: abandoned ? 'CANCELLED' : 'FINISHED',
                homeScore: abandoned ? null : Number(fields.homeScore),
                awayScore: abandoned ? null : Number(fields.awayScore),
                homePenaltyScore:
                  abandoned || !fields.homePenaltyScore ? null : Number(fields.homePenaltyScore),
                awayPenaltyScore:
                  abandoned || !fields.awayPenaltyScore ? null : Number(fields.awayPenaltyScore),
                statusReason:
                  fields.outcome === 'FINISHED'
                    ? null
                    : {
                        ABANDONED: '比赛中止',
                        HOME_FORFEIT: '主队弃权',
                        AWAY_FORFEIT: '客队弃权',
                        BOTH_FORFEIT: '双方弃权',
                      }[fields.outcome],
              },
            })
            await tx.matchEvent.deleteMany({
              where: { organizationId: session.organizationId, matchId: match.id },
            })
            if (!abandoned && fields.events.length)
              await tx.matchEvent.createMany({
                data: fields.events.map((event, index) => ({
                  organizationId: session.organizationId,
                  matchId: match.id,
                  teamId: event.side === 'HOME' ? match.homeTeamId! : match.awayTeamId!,
                  playerId: event.playerId,
                  relatedPlayerId: event.relatedPlayerId || null,
                  type: event.kind,
                  minute: Number(event.minute),
                  stoppageMinute: event.addedMinute ? Number(event.addedMinute) : null,
                  sortOrder: index,
                })),
              })
            await tx.outboxJob.create({
              data: {
                organizationId: session.organizationId,
                topic: 'match.report',
                aggregateType: 'Match',
                aggregateId: match.id,
                eventType: 'MatchReportConfirmed',
                deduplicationKey: `match-report-confirmed:${match.id}:${version}`,
                correlationId: requestId,
                payload: {
                  revisionId: revision.id,
                  organizationId: session.organizationId,
                  matchId: match.id,
                  tournamentId: match.tournamentId,
                  reportVersion: version,
                  confirmedReportVersion: version,
                  previousConfirmedReportVersion: match.confirmedReportVersion,
                  homeRosterSnapshotId: context.home.id,
                  awayRosterSnapshotId: context.away.id,
                  ruleVersionId: context.rule.id,
                },
              },
            })
          }
          await this.notifications(tx, session, match, revision, previous, requestId)
          await tx.auditLog.create({
            data: {
              organizationId: session.organizationId,
              actorType: privilege.administrator ? 'ADMIN' : 'MATCH_REPORTER',
              actorUserId: session.userId,
              actorRoleSnapshot: privilege.roles,
              action: `MATCH_REPORT_${body.action}`,
              targetType: 'MatchReport',
              targetId: match.id,
              beforeSummary: {
                version: match.reportVersion,
                confirmedReportVersion: match.confirmedReportVersion,
              },
              afterSummary: {
                version,
                status,
                action: body.action,
                homeRosterSnapshotId: context.home.id,
                awayRosterSnapshotId: context.away.id,
                ruleVersionId: context.rule.id,
              },
              reason: reason || null,
              requestId,
              source: 'MATCH_REPORT_API',
            },
          })
          const updated = await this.requireMatch(tx, session.organizationId, match.id)
          const response = {
            ...(await this.workspace(tx, updated, privilege)),
            savedVersion: revision.version,
          }
          await tx.idempotencyRecord.update({
            where: {
              userId_route_idempotencyKey: {
                userId: session.userId,
                route,
                idempotencyKey: body.clientActionId,
              },
            },
            data: {
              responseStatus: 200,
              responseBody: response as unknown as Prisma.InputJsonValue,
              resourceType: 'MatchReportRevision',
              resourceId: revision.id,
            },
          })
          return response
        },
        { maxWait: 10_000, timeout: 20_000 },
      )
    } catch (cause) {
      // The duplicate insert waits for the winner. PostgreSQL then aborts this transaction;
      // re-read outside it, after rechecking the live actor and object permission.
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        await this.get(authorization, matchId)
        const existing = await this.prisma.idempotencyRecord.findUnique({
          where: {
            userId_route_idempotencyKey: {
              userId: session.userId,
              route,
              idempotencyKey: body.clientActionId,
            },
          },
        })
        if (existing) return this.replay(existing, requestHash, session.organizationId)
      }
      throw cause
    }
  }

  private async requireMatch(tx: Database, organizationId: string, matchId: string) {
    const match = await tx.match.findFirst({
      where: { id: matchId, organizationId },
      include: MATCH_INCLUDE,
    })
    if (!match)
      throw new ApiHttpException(HttpStatus.NOT_FOUND, {
        code: ERROR_CODES.NOT_FOUND,
        message: '当前组织中没有这场比赛',
      })
    return match
  }
  private matchContext(match: ReportMatch) {
    return {
      organizationId: match.organizationId,
      matchId: match.id,
      tournamentId: match.tournamentId,
      stageId: match.stageId,
      groupId: match.groupId,
      roundId: match.roundId,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      scheduledStartAt: match.scheduledStartAt?.toISOString() ?? null,
    }
  }
  private requireUnchangedMatchContext(match: ReportMatch, revision: MatchReportRevision) {
    const value = revision.fields as unknown as { _matchContext?: Record<string, unknown> }
    const before = value._matchContext
    const current = this.matchContext(match)
    if (!before || Object.entries(current).some(([key, value]) => before[key] !== value))
      throw conflict('比赛对阵、阶段、分组或时间已变化。原报告已保留，请先由管理员核对比赛上下文。')
  }
  private latest(tx: Database, match: ReportMatch) {
    return tx.matchReportRevision.findFirst({
      where: {
        organizationId: match.organizationId,
        matchId: match.id,
        version: match.reportVersion,
      },
    })
  }

  private async notifications(
    tx: Database,
    session: AuthenticatedSession,
    match: ReportMatch,
    revision: MatchReportRevision,
    previous: MatchReportRevision | null,
    requestId: string,
  ) {
    if (!['SUBMIT', 'RETURN', 'CONFIRM', 'CORRECT'].includes(revision.action)) return
    const recipients = new Set<string>()
    if (revision.action === 'SUBMIT') {
      const candidates = await tx.user.findMany({
        where: {
          status: 'ACTIVE',
          memberships: { some: { organizationId: match.organizationId, status: 'ACTIVE' } },
          roleAssignments: {
            some: {
              revokedAt: null,
              role: { in: ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'TOURNAMENT_ADMIN'] },
            },
          },
        },
        select: {
          id: true,
          roleAssignments: {
            where: {
              revokedAt: null,
              grantedAt: { lte: new Date() },
              OR: [
                { organizationId: match.organizationId },
                { organizationId: null, role: 'PLATFORM_ADMIN' },
              ],
            },
            select: { role: true, scopeType: true, scopeId: true },
          },
        },
      })
      const policy = new AccessPolicyService(tx as PrismaService)
      for (const candidate of candidates) {
        // An authorization view for the real notification recipient, not a login session.
        const subject = {
          ...session,
          userId: candidate.id,
          user: { ...session.user, id: candidate.id, roles: candidate.roleAssignments },
        }
        try {
          await policy.requireTournamentAdministrator(subject, match.tournamentId)
          recipients.add(candidate.id)
        } catch (cause) {
          if (!(cause instanceof ApiHttpException && cause.getStatus() === HttpStatus.FORBIDDEN))
            throw cause
        }
      }
      if (!recipients.size)
        throw invalid('当前赛事没有有效审核人。请先由组织管理员安排审核权限；报告仍可保存为草稿。')
    } else {
      const submitted =
        previous?.status === 'SUBMITTED'
          ? previous
          : await tx.matchReportRevision.findFirst({
              where: {
                organizationId: match.organizationId,
                matchId: match.id,
                status: 'SUBMITTED',
                version: { lt: revision.version },
              },
              orderBy: { version: 'desc' },
            })
      if (submitted) {
        const recipient = await tx.user.findFirst({
          where: {
            id: submitted.createdByUserId,
            status: 'ACTIVE',
            memberships: { some: { organizationId: match.organizationId, status: 'ACTIVE' } },
          },
          select: { id: true },
        })
        if (recipient) recipients.add(recipient.id)
      }
    }
    const title =
      revision.action === 'SUBMIT'
        ? '比赛报告待审核'
        : revision.action === 'RETURN'
          ? '比赛报告已退回'
          : revision.action === 'CORRECT'
            ? '已确认结果正在修正'
            : '比赛报告已确认'
    const notificationIds: string[] = []
    for (const recipientUserId of recipients) {
      const notification = await tx.userNotification.create({
        data: {
          organizationId: match.organizationId,
          recipientUserId,
          actorUserId: session.userId,
          type: revision.action === 'SUBMIT' ? 'MATCH_REPORT_SUBMITTED' : 'MATCH_REPORT_REVIEWED',
          title,
          body: `${match.title} · v${revision.version}${revision.reason ? ' · ' + revision.reason : ''}`.slice(
            0,
            500,
          ),
          linkPath: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(match.id)}`,
          deduplicationKey: `match-report:${revision.id}:${recipientUserId}`,
          metadata: {
            matchId: match.id,
            revisionId: revision.id,
            reportVersion: revision.version,
            action: revision.action,
          },
        },
      })
      notificationIds.push(notification.id)
    }
    await tx.outboxJob.create({
      data: {
        organizationId: match.organizationId,
        topic: 'match.report.notification',
        aggregateType: 'MatchReportRevision',
        aggregateId: revision.id,
        eventType: 'MatchReportNotificationCreated',
        deduplicationKey: `match-report-notification:${revision.id}`,
        correlationId: requestId,
        payload: {
          organizationId: match.organizationId,
          matchId: match.id,
          tournamentId: match.tournamentId,
          revisionId: revision.id,
          reportVersion: revision.version,
          recipientUserIds: [...recipients],
          notificationIds,
          action: revision.action,
        },
      },
    })
  }

  private async privilege(tx: Database, session: AuthenticatedSession, match: ReportMatch) {
    const active = await tx.organizationMembership.findFirst({
      where: {
        userId: session.userId,
        organizationId: session.organizationId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        organization: { status: 'ACTIVE' },
      },
    })
    if (!active) throw forbidden('当前账号或组织已不可用')
    const assignments = await tx.roleAssignment.findMany({
      where: {
        userId: session.userId,
        revokedAt: null,
        OR: [
          { organizationId: session.organizationId },
          { organizationId: null, role: 'PLATFORM_ADMIN' },
        ],
      },
    })
    const roles = assignments
      .filter((assignment) => assignment.grantedAt.getTime() <= Date.now())
      .map(({ role, scopeType, scopeId }) => ({ role, scopeType, scopeId }))
    const currentSession = { ...session, user: { ...session.user, roles } }
    // Reuse the authoritative policy with the real transaction's delegates.
    // Both its object queries and the refreshed roles belong to this transaction.
    const policy = new AccessPolicyService(tx as PrismaService)
    await policy.requireMatchReporter(currentSession, match.id)
    let administrator = true
    try {
      await policy.requireTournamentAdministrator(currentSession, match.tournamentId)
    } catch (cause) {
      if (cause instanceof ApiHttpException && cause.getStatus() === HttpStatus.FORBIDDEN)
        administrator = false
      else throw cause
    }
    return { administrator, reporter: true, roles }
  }
  private requireRead(privilege: { administrator: boolean; reporter: boolean }) {
    if (!privilege.administrator && !privilege.reporter) throw forbidden('你没有这场比赛的报告权限')
  }

  private async context(
    tx: Database,
    match: ReportMatch,
    binding?: { homeRosterSnapshotId: string; awayRosterSnapshotId: string; ruleVersionId: string },
  ) {
    // Read original player choices from the immutable report, not the current parent.
    if (binding && 'fields' in binding) {
      const stored = binding.fields as unknown as { _matchContext?: Record<string, unknown> }
      const frozen = stored._matchContext
      if (
        !frozen ||
        frozen.organizationId !== match.organizationId ||
        frozen.matchId !== match.id ||
        typeof frozen.tournamentId !== 'string' ||
        typeof frozen.homeTeamId !== 'string' ||
        typeof frozen.awayTeamId !== 'string'
      )
        throw conflict('历史报告的固定比赛上下文缺失或不一致，无法重建名单')
      match = {
        ...match,
        tournamentId: frozen.tournamentId,
        homeTeamId: frozen.homeTeamId,
        awayTeamId: frozen.awayTeamId,
      }
    }
    const [home, away, rule] = await Promise.all([
      match.homeTeamId
        ? tx.rosterSnapshot.findFirst({
            where: {
              organizationId: match.organizationId,
              tournamentId: match.tournamentId,
              teamId: match.homeTeamId,
              lockedAt: { not: null },
              ...(binding ? { id: binding.homeRosterSnapshotId } : {}),
            },
            include: { entries: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { snapshotVersion: 'desc' },
          })
        : null,
      match.awayTeamId
        ? tx.rosterSnapshot.findFirst({
            where: {
              organizationId: match.organizationId,
              tournamentId: match.tournamentId,
              teamId: match.awayTeamId,
              lockedAt: { not: null },
              ...(binding ? { id: binding.awayRosterSnapshotId } : {}),
            },
            include: { entries: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { snapshotVersion: 'desc' },
          })
        : null,
      tx.competitionRuleVersion.findFirst({
        where: {
          organizationId: match.organizationId,
          tournamentId: match.tournamentId,
          status: 'PUBLISHED',
          ...(binding ? { id: binding.ruleVersionId } : {}),
        },
        orderBy: { version: 'desc' },
      }),
    ])
    return { home, away, rule }
  }
  private async workspace(
    tx: Database,
    match: ReportMatch,
    privilege: { administrator: boolean; reporter: boolean },
  ) {
    const latest = await this.latest(tx, match)
    if (latest) this.requireUnchangedMatchContext(match, latest)
    const context = await this.context(tx, match, latest ?? undefined)
    const blockingReasons = this.blockingReasons(match, context)
    const ready = blockingReasons.length === 0
    const editable = !latest || latest.status === 'DRAFT' || latest.status === 'RETURNED'
    const authors = await this.authors(tx, latest ? [latest] : [])
    return {
      organizationId: match.organizationId,
      matchId: match.id,
      title: match.title,
      ruleVersionId: context.rule?.id ?? null,
      isKnockout: match.stage?.type === 'KNOCKOUT',
      reportVersion: match.reportVersion,
      confirmedReportVersion: match.confirmedReportVersion,
      homeTeam: {
        id: match.homeTeamId ?? '',
        name: match.homeTeam?.name ?? '主队待定',
        rosterSnapshotId: context.home?.id ?? null,
        players: context.home?.entries.map(playerView) ?? [],
      },
      awayTeam: {
        id: match.awayTeamId ?? '',
        name: match.awayTeam?.name ?? '客队待定',
        rosterSnapshotId: context.away?.id ?? null,
        players: context.away?.entries.map(playerView) ?? [],
      },
      permissions: {
        canEdit: ready && editable,
        canSubmit: ready && editable,
        canViewHistory: true,
        canCorrect: ready && privilege.administrator && latest?.status === 'CONFIRMED',
        canConfirm: ready && privilege.administrator && latest?.status === 'SUBMITTED',
        canReturn: privilege.administrator && latest?.status === 'SUBMITTED',
      },
      blockingReasons,
      latest: latest ? this.revisionView(latest, authors) : null,
      reviewNote: latest?.status === 'RETURNED' ? latest.reason : null,
      officialResult: {
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        homePenaltyScore: match.homePenaltyScore,
        awayPenaltyScore: match.awayPenaltyScore,
        status: match.status,
      },
    }
  }
  private async authors(tx: Database, revisions: MatchReportRevision[]) {
    const users = await tx.user.findMany({
      where: { id: { in: [...new Set(revisions.map((revision) => revision.createdByUserId))] } },
      select: { id: true, displayName: true },
    })
    return new Map(users.map((user) => [user.id, user.displayName]))
  }
  private blockingReasons(
    match: ReportMatch,
    context: Awaited<ReturnType<MatchReportService['context']>>,
  ) {
    const reasons: string[] = []
    if (
      !match.stageId ||
      !match.stage ||
      match.stage.organizationId !== match.organizationId ||
      match.stage.tournamentId !== match.tournamentId
    )
      reasons.push('比赛尚未绑定本赛事赛制阶段，请先完成赛事配置')
    if (!context.home || !context.away) reasons.push('双方报名名单尚未锁定')
    if (!context.rule) reasons.push('赛事没有可用的已发布规程')
    else {
      try {
        parseResultsRules(context.rule.id, context.rule.rules)
      } catch {
        reasons.push('赛事尚未配置完整的赛果规程，无法保存或确认正式报告')
      }
    }
    return reasons
  }
  private revisionView(revision: MatchReportRevision, authors: Map<string, string>) {
    return {
      version: revision.version,
      savedAt: revision.createdAt.toISOString(),
      savedBy: authors.get(revision.createdByUserId) ?? '赛事工作人员',
      status: revision.status,
      action: revision.action,
      reason: revision.reason ?? '',
      fields: canonicalFields(parseFields(revision.fields)),
      homeRosterSnapshotId: revision.homeRosterSnapshotId,
      awayRosterSnapshotId: revision.awayRosterSnapshotId,
      ruleVersionId: revision.ruleVersionId,
    }
  }
  private replay(
    record: {
      organizationId: string | null
      requestHash: string
      responseBody: Prisma.JsonValue | null
    },
    requestHash: string,
    organizationId: string,
  ) {
    if (record.organizationId !== organizationId || record.requestHash !== requestHash)
      throw new ApiHttpException(HttpStatus.CONFLICT, {
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: '此保存标识已经用于另一份内容，请使用新的保存请求',
      })
    if (!record.responseBody) throw conflict('原保存仍在处理中，请稍后重试同一次请求')
    return record.responseBody
  }
}

function playerView(entry: {
  playerProfileId: string
  displayName: string
  shirtNumber: string | null
}) {
  return {
    id: entry.playerProfileId,
    displayName: entry.displayName,
    shirtNumber: entry.shirtNumber,
  }
}
function parseFields(value: Prisma.JsonValue): ReportFieldsDto {
  return value as unknown as ReportFieldsDto
}
function canonicalCommand(body: WriteMatchReportDto) {
  return {
    action: body.action,
    expectedVersion: body.expectedVersion,
    reason: body.reason.trim(),
    homeRosterSnapshotId: body.homeRosterSnapshotId ?? null,
    awayRosterSnapshotId: body.awayRosterSnapshotId ?? null,
    ruleVersionId: body.ruleVersionId ?? null,
    fields: body.fields ? canonicalFields(body.fields) : null,
  }
}
function invalid(message: string) {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, {
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
  })
}
function forbidden(message: string) {
  return new ApiHttpException(HttpStatus.FORBIDDEN, { code: ERROR_CODES.FORBIDDEN, message })
}
function conflict(message: string, details?: Record<string, unknown>) {
  return new ApiHttpException(HttpStatus.CONFLICT, {
    code: ERROR_CODES.CONFLICT,
    message,
    ...(details ? { details } : {}),
  })
}
