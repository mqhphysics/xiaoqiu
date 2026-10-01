import { createHash, randomUUID } from 'node:crypto'

import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { AccessPolicyService } from '../auth/access-policy.service'
import { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { selectPublicTournament } from '../common/public-tournament'
import { PrismaService } from '../database/prisma.service'
import { type Prisma } from '../generated/prisma/client'
import { CompetitionRuleError, requireRule, type ResultFact } from './competition-rules'
import { confirmedResultFact } from './confirmed-result'
import { resolveKnockoutResult } from './knockout'
import { parseResultsRules } from './parse-rules'
import { parseProgressionRules } from './progression-rules'
import { progressionSourceHash, type ProgressionSource } from './progression-source'
import { type ProgressionConfirmDto, type ProgressionPreviewDto } from './results.dto'
import {
  loadGroups,
  loadParticipants,
  loadResultFixtures,
  type ResultsTransaction,
} from './results.repository'
import { calculateResultStandings } from './standings'

function failure(status: HttpStatus, message: string, reason: string): ApiHttpException {
  return new ApiHttpException(status, {
    code: status === HttpStatus.CONFLICT ? ERROR_CODES.CONFLICT : ERROR_CODES.BAD_REQUEST,
    message,
    details: { reason },
  })
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
type PlannedSlot = { targetMatchId: string; side: 'HOME' | 'AWAY'; teamId: string }

@Injectable()
export class ResultsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
  ) {}

  private async rules(
    tx: ResultsTransaction,
    organizationId: string,
    tournamentId: string,
    ruleVersionId?: string,
  ) {
    const row = await tx.competitionRuleVersion.findFirst({
      where: {
        organizationId,
        tournamentId,
        ...(ruleVersionId ? { id: ruleVersionId } : {}),
        status: 'PUBLISHED',
      },
      orderBy: { version: 'desc' },
    })
    if (!row)
      throw failure(HttpStatus.UNPROCESSABLE_ENTITY, '赛事规程尚未配置', 'RESULTS_RULES_REQUIRED')
    try {
      return { row, engine: parseResultsRules(row.id, row.rules) }
    } catch (error) {
      throw failure(
        HttpStatus.UNPROCESSABLE_ENTITY,
        '赛事规程尚未配置或不支持当前计算',
        error instanceof CompetitionRuleError ? error.code : 'INVALID_RESULTS_RULES',
      )
    }
  }

  async readTournamentResults(organizationId: string, tournamentId: string) {
    await selectPublicTournament(this.prisma, organizationId, tournamentId)
    return this.prisma.$transaction(
      async (tx) => {
        const { row, engine } = await this.rules(tx, organizationId, tournamentId)
        const [fixtures, participants, groups] = await Promise.all([
          loadResultFixtures(tx, organizationId, tournamentId),
          loadParticipants(tx, organizationId, tournamentId),
          loadGroups(tx, organizationId, tournamentId),
        ])
        const facts = fixtures
          .map(confirmedResultFact)
          .filter((fact): fact is ResultFact & { ruleVersionId: string } => fact !== null)
        try {
          requireRule(
            facts.every((fact) => fact.ruleVersionId === row.id),
            'CONFIRMED_RULE_VERSION_MISMATCH',
          )
          return {
            tournamentId,
            ruleVersionId: row.id,
            mode: 'OFFICIAL' as const,
            groups: groups.map((group) => ({
              id: group.id,
              standings: calculateResultStandings(
                { organizationId, tournamentId, stageId: group.stageId, groupId: group.id },
                participants.filter((team) => team.groupId === group.id).map((team) => team.teamId),
                facts.filter((fact) => fact.groupId === group.id),
                engine,
                'OFFICIAL',
              ),
            })),
            confirmedResults: facts.map((fact) => ({
              ...fact,
              playedAt: fact.playedAt.toISOString(),
            })),
            sourceVersions: Object.fromEntries(
              fixtures.map((fixture) => [fixture.id, fixture.confirmedReportVersion ?? 0]),
            ),
          }
        } catch (error) {
          this.ruleFailure(error)
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async preview(
    authorization: string | undefined,
    tournamentId: string,
    dto: ProgressionPreviewDto,
  ) {
    const session = await this.auth.requireSession(authorization)
    await this.policy.requireTournamentAdministrator(session, tournamentId)
    return this.prisma.$transaction(
      (tx) => this.buildPreview(tx, session.organizationId, tournamentId, dto.ruleVersionId, false),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private ruleFailure(error: unknown): never {
    if (error instanceof ApiHttpException) throw error
    if (error instanceof CompetitionRuleError)
      throw failure(HttpStatus.UNPROCESSABLE_ENTITY, '赛果或规程不能完成当前计算', error.code)
    throw error
  }

  private async buildPreview(
    tx: ResultsTransaction,
    organizationId: string,
    tournamentId: string,
    ruleVersionId: string,
    lock: boolean,
  ) {
    try {
      const tournamentRows = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `SELECT id, progression_version AS version FROM tournaments WHERE organization_id = $1::uuid AND id = $2::uuid ${lock ? 'FOR UPDATE' : ''}`,
        organizationId,
        tournamentId,
      )
      const tournament = tournamentRows[0]
      if (!tournament)
        throw failure(HttpStatus.NOT_FOUND, '当前组织不存在该赛事', 'TOURNAMENT_NOT_FOUND')
      const { row, engine } = await this.rules(tx, organizationId, tournamentId, ruleVersionId)
      const progression = parseProgressionRules(row.rules)
      const targets = [...new Set(progression.slots.map((slot) => slot.targetMatchId))]
      const [fixtures, teams, groups] = await Promise.all([
        loadResultFixtures(
          tx,
          organizationId,
          tournamentId,
          lock,
          progression.sourceStageId,
          targets,
        ),
        loadParticipants(tx, organizationId, tournamentId),
        loadGroups(tx, organizationId, tournamentId),
      ])
      const sourceFixtures = fixtures.filter(
        (fixture) => fixture.stageId === progression.sourceStageId,
      )
      requireRule(sourceFixtures.length > 0, 'NO_SOURCE_MATCHES')
      requireRule(
        targets.every((id) =>
          fixtures.some(
            (fixture) => fixture.id === id && fixture.stageId !== progression.sourceStageId,
          ),
        ),
        'INVALID_PROGRESSION_TARGET',
      )
      const source: ProgressionSource = {
        organizationId,
        tournamentId,
        stageId: progression.sourceStageId,
        ruleVersionId: row.id,
        teams,
        matches: sourceFixtures.map((fixture) => ({
          matchId: fixture.id,
          confirmedReportVersion: fixture.confirmedReportVersion ?? 0,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          groupId: fixture.groupId,
        })),
      }
      const sourceHash = progressionSourceHash(source)
      const reasons: string[] = []
      const facts = sourceFixtures
        .map(confirmedResultFact)
        .filter((fact): fact is ResultFact & { ruleVersionId: string } => fact !== null)
      if (facts.length !== sourceFixtures.length) reasons.push('SOURCE_UNCONFIRMED')
      if (facts.some((fact) => fact.status === 'VOID')) reasons.push('SOURCE_VOID')
      if (facts.some((fact) => fact.ruleVersionId !== row.id))
        reasons.push('CONFIRMED_RULE_VERSION_MISMATCH')
      const assignments: PlannedSlot[] = []
      if (!reasons.length)
        for (const slot of progression.slots) {
          const slotSource = slot.source
          let teamId: string | undefined
          if (slotSource.type === 'GROUP_RANK') {
            const group = groups.find(
              (item) =>
                item.id === slotSource.groupId && item.stageId === progression.sourceStageId,
            )
            requireRule(group, 'INVALID_PROGRESSION_GROUP')
            const table = calculateResultStandings(
              {
                organizationId,
                tournamentId,
                stageId: progression.sourceStageId,
                groupId: group.id,
              },
              teams.filter((team) => team.groupId === group.id).map((team) => team.teamId),
              facts.filter((fact) => fact.groupId === group.id),
              engine,
              'OFFICIAL',
            )
            const candidates = table.rows.filter((standing) => standing.rank === slotSource.rank)
            if (candidates.length !== 1) reasons.push('UNRESOLVED_GROUP_RANK')
            else teamId = candidates[0]!.teamId
          } else {
            const fact = facts.find((item) => item.id === slotSource.matchId)
            requireRule(fact, 'INVALID_PROGRESSION_MATCH')
            const result = resolveKnockoutResult(
              {
                organizationId,
                tournamentId,
                stageId: progression.sourceStageId,
                groupId: fact.groupId,
              },
              fact,
              engine,
            )
            if (result.status === 'BLOCKED') reasons.push(result.reason)
            else
              teamId = slotSource.type === 'MATCH_WINNER' ? result.winnerTeamId : result.loserTeamId
          }
          if (teamId)
            assignments.push({ targetMatchId: slot.targetMatchId, side: slot.side, teamId })
        }
      for (const targetId of targets) {
        const target = fixtures.find((fixture) => fixture.id === targetId)!
        if (
          !['DRAFT', 'SCHEDULED', 'POSTPONED'].includes(target.status) ||
          target.reportVersion > 0 ||
          target.confirmedReportVersion !== null
        )
          reasons.push('TARGET_ALREADY_STARTED_OR_REPORTED')
        const home =
          assignments.find((slot) => slot.targetMatchId === targetId && slot.side === 'HOME')
            ?.teamId ?? target.homeTeamId
        const away =
          assignments.find((slot) => slot.targetMatchId === targetId && slot.side === 'AWAY')
            ?.teamId ?? target.awayTeamId
        if (home && home === away) reasons.push('SAME_TEAM_TARGET')
      }
      return {
        tournamentId,
        ruleVersionId: row.id,
        version: tournament.version,
        sourceHash,
        sourceVersions: source,
        slots: assignments,
        status: reasons.length ? ('BLOCKED' as const) : ('READY' as const),
        reasons: [...new Set(reasons)],
      }
    } catch (error) {
      this.ruleFailure(error)
    }
  }

  async confirm(
    authorization: string | undefined,
    tournamentId: string,
    dto: ProgressionConfirmDto,
    idempotencyKey: string | undefined,
    requestId: string,
  ) {
    if (
      !idempotencyKey ||
      idempotencyKey.length > 128 ||
      !idempotencyKey.trim() ||
      !dto.reason.trim()
    )
      throw failure(HttpStatus.BAD_REQUEST, '需要幂等键和确认原因', 'PROGRESSION_REQUEST_REQUIRED')
    const session = await this.auth.requireSession(authorization)
    await this.policy.requireTournamentAdministrator(session, tournamentId)
    const route = `/admin/tournaments/${tournamentId}/progression/confirm`
    const command = {
      ruleVersionId: dto.ruleVersionId,
      expectedVersion: dto.expectedVersion,
      sourceHash: dto.sourceHash,
      reason: dto.reason.trim(),
    }
    const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex')
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const preview = await this.buildPreview(
            tx,
            session.organizationId,
            tournamentId,
            dto.ruleVersionId,
            true,
          )
          const existing = await tx.idempotencyRecord.findFirst({
            where: {
              organizationId: session.organizationId,
              userId: session.userId,
              route,
              idempotencyKey,
            },
          })
          if (existing) {
            if (existing.requestHash !== requestHash)
              throw failure(HttpStatus.CONFLICT, '幂等键已用于其他请求', 'IDEMPOTENCY_CONFLICT')
            if (preview.sourceHash !== dto.sourceHash)
              throw failure(
                HttpStatus.CONFLICT,
                '来源赛果已变化，请重新预览',
                'PROGRESSION_SOURCE_CHANGED',
              )
            return existing.responseBody
          }
          if (preview.sourceHash !== dto.sourceHash)
            throw failure(
              HttpStatus.CONFLICT,
              '来源赛果已变化，请重新预览',
              'PROGRESSION_SOURCE_CHANGED',
            )
          if (preview.status !== 'READY')
            throw failure(HttpStatus.CONFLICT, '当前不能确认晋级', preview.reasons.join(','))
          if (preview.version !== dto.expectedVersion)
            throw failure(
              HttpStatus.CONFLICT,
              '晋级版本已变化，请重新预览',
              'PROGRESSION_VERSION_CONFLICT',
            )
          const version = dto.expectedVersion + 1
          const affected = await tx.$executeRawUnsafe(
            'UPDATE tournaments SET progression_version = $3::integer, updated_at = now() WHERE organization_id = $1::uuid AND id = $2::uuid AND progression_version = $4::integer',
            session.organizationId,
            tournamentId,
            version,
            dto.expectedVersion,
          )
          if (affected !== 1)
            throw failure(HttpStatus.CONFLICT, '晋级版本已变化', 'PROGRESSION_VERSION_CONFLICT')
          for (const slot of preview.slots) {
            const column = slot.side === 'HOME' ? 'home_team_id' : 'away_team_id'
            const count = await tx.$executeRawUnsafe(
              `UPDATE matches SET ${column} = $3::uuid, updated_at = now() WHERE organization_id = $1::uuid AND tournament_id = $2::uuid AND id = $4::uuid AND report_version = 0 AND confirmed_report_version IS NULL AND status IN ('DRAFT','SCHEDULED','POSTPONED')`,
              session.organizationId,
              tournamentId,
              slot.teamId,
              slot.targetMatchId,
            )
            if (count !== 1)
              throw failure(
                HttpStatus.CONFLICT,
                '目标比赛不能再更换球队',
                'TARGET_ALREADY_STARTED_OR_REPORTED',
              )
          }
          const progressionId = randomUUID()
          await tx.$executeRawUnsafe(
            `INSERT INTO tournament_progressions (id, organization_id, tournament_id, version, source_hash, source_versions, slots, rule_version_id, created_by_user_id, reason)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7::jsonb,$8::uuid,$9::uuid,$10)`,
            progressionId,
            session.organizationId,
            tournamentId,
            version,
            dto.sourceHash,
            JSON.stringify(preview.sourceVersions),
            JSON.stringify(preview.slots),
            dto.ruleVersionId,
            session.userId,
            command.reason,
          )
          const response = {
            id: progressionId,
            tournamentId,
            version,
            sourceHash: dto.sourceHash,
            slots: preview.slots,
          }
          await tx.auditLog.create({
            data: {
              organizationId: session.organizationId,
              actorType: 'ADMIN',
              actorUserId: session.userId,
              action: 'TOURNAMENT_PROGRESSION_CONFIRMED',
              targetType: 'Tournament',
              targetId: tournamentId,
              beforeSummary: { version: dto.expectedVersion },
              afterSummary: json(response),
              reason: command.reason,
              requestId,
              source: 'API',
            },
          })
          await tx.outboxJob.create({
            data: {
              organizationId: session.organizationId,
              topic: 'tournament.progression',
              aggregateType: 'Tournament',
              aggregateId: tournamentId,
              eventType: 'TournamentProgressionConfirmed',
              payload: json(response),
              deduplicationKey: `tournament-progression-confirmed:${tournamentId}:${version}`,
              correlationId: requestId,
            },
          })
          await tx.idempotencyRecord.create({
            data: {
              organizationId: session.organizationId,
              userId: session.userId,
              route,
              idempotencyKey,
              requestHash,
              responseStatus: 200,
              responseBody: json(response),
              resourceType: 'TournamentProgression',
              resourceId: progressionId,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          })
          return response
        },
        { isolationLevel: 'Serializable', timeout: 10000 },
      )
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034')
        throw failure(
          HttpStatus.CONFLICT,
          '并发变更，请重新预览或重试',
          'PROGRESSION_CONCURRENT_CHANGE',
        )
      throw error
    }
  }
}
