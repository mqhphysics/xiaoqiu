import { createHash } from 'node:crypto'

import {
  CompetitionRuleVersionStatus,
  DataQualityStatus,
  MatchEventType,
  MatchStatus,
  RosterSubmissionStatus,
  SchedulePlanStatus,
  ScheduleRevisionStatus,
  StageType,
  TeamRegistrationStatus,
  TournamentStatus,
} from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import {
  DEMO_MATCHES,
  DEMO_PLAYERS,
  DEMO_TEAMS,
  fixtureId,
  type DemoMatchDefinition,
} from './demo-fixture'

export interface SeedTournamentFixture {
  year: '2025' | '2026'
  id: string
  seasonId: string
  schedulePlanId: string
  scheduleRevisionId: string
  groupStageId?: string | undefined
  knockoutStageId: string
  groups: Partial<Record<'A' | 'B', string>>
  rounds: Record<string, string>
}

export const DEMO_STARTERS_PER_TEAM = 8

export function isDemoMatchStarter(playerIndex: number): boolean {
  return playerIndex < DEMO_STARTERS_PER_TEAM
}

export function getDemoMinutesPlayed(playerIndex: number, matchMinutes: number): number {
  if (playerIndex < 6) return matchMinutes
  const substitutionMinute = Math.floor((matchMinutes * 2) / 3)
  if (playerIndex < 8) return substitutionMinute
  if (playerIndex < 10) return matchMinutes - substitutionMinute
  return 0
}

export async function seedDemoTournament(
  tx: Prisma.TransactionClient,
  organizationId: string,
  year: '2025' | '2026',
): Promise<SeedTournamentFixture> {
  const seasonId = fixtureId(`season:${year}`)
  const tournamentId = fixtureId(`tournament:${year}`)
  const schedulePlanId = fixtureId(`schedule-plan:${year}`)
  const scheduleRevisionId = fixtureId(`schedule-revision:${year}`)

  await tx.season.upsert({
    where: {
      organizationId_seasonCode: { organizationId, seasonCode: `${year}-SEASON` },
    },
    create: {
      id: seasonId,
      organizationId,
      seasonCode: `${year}-SEASON`,
      name: `${year} 校园足球赛季`,
      startsOn: new Date(`${year}-03-01T00:00:00+08:00`),
      endsOn: new Date(`${year}-12-20T00:00:00+08:00`),
    },
    update: {
      name: `${year} 校园足球赛季`,
      startsOn: new Date(`${year}-03-01T00:00:00+08:00`),
      endsOn: new Date(`${year}-12-20T00:00:00+08:00`),
    },
  })

  await tx.tournament.upsert({
    where: {
      organizationId_tournamentCode: {
        organizationId,
        tournamentCode: `DEMO-GREEN-CUP-${year}`,
      },
    },
    create: {
      id: tournamentId,
      organizationId,
      seasonId,
      tournamentCode: `DEMO-GREEN-CUP-${year}`,
      name: `${year} 绿茵杯${year === '2026' ? ' · 演示赛季' : ''}`,
      status: year === '2026' ? TournamentStatus.PUBLISHED : TournamentStatus.ARCHIVED,
      createdAt: new Date(`${year}-03-01T08:00:00+08:00`),
    },
    update: {
      seasonId,
      name: `${year} 绿茵杯${year === '2026' ? ' · 演示赛季' : ''}`,
      status: year === '2026' ? TournamentStatus.PUBLISHED : TournamentStatus.ARCHIVED,
    },
  })

  await tx.competitionRuleVersion.upsert({
    where: { tournamentId_version: { tournamentId, version: 1 } },
    create: {
      id: fixtureId(`rule:${year}:1`),
      organizationId,
      tournamentId,
      version: 1,
      name: `${year} 绿茵杯竞赛规程`,
      status: CompetitionRuleVersionStatus.PUBLISHED,
      rules: competitionRules(year),
    },
    update: {
      name: `${year} 绿茵杯竞赛规程`,
      status: CompetitionRuleVersionStatus.PUBLISHED,
      rules: competitionRules(year),
    },
  })

  const groupStageId = year === '2026' ? fixtureId(`stage:${year}:group`) : undefined
  if (groupStageId) {
    await tx.stage.upsert({
      where: { tournamentId_stageCode: { tournamentId, stageCode: 'GROUP' } },
      create: {
        id: groupStageId,
        organizationId,
        tournamentId,
        stageCode: 'GROUP',
        name: '小组赛',
        type: StageType.GROUP,
        sortOrder: 1,
      },
      update: { name: '小组赛', type: StageType.GROUP, sortOrder: 1 },
    })
  }

  const knockoutStageId = fixtureId(`stage:${year}:knockout`)
  await tx.stage.upsert({
    where: { tournamentId_stageCode: { tournamentId, stageCode: 'KNOCKOUT' } },
    create: {
      id: knockoutStageId,
      organizationId,
      tournamentId,
      stageCode: 'KNOCKOUT',
      name: '淘汰赛',
      type: StageType.KNOCKOUT,
      sortOrder: 2,
    },
    update: { name: '淘汰赛', type: StageType.KNOCKOUT, sortOrder: 2 },
  })

  const groups: SeedTournamentFixture['groups'] = {}
  if (groupStageId) {
    for (const [index, code] of ['A', 'B'].entries()) {
      const groupId = fixtureId(`group:${year}:${code}`)
      await tx.tournamentGroup.upsert({
        where: { stageId_groupCode: { stageId: groupStageId, groupCode: code } },
        create: {
          id: groupId,
          organizationId,
          stageId: groupStageId,
          groupCode: code,
          name: `${code} 组`,
          sortOrder: index + 1,
        },
        update: { name: `${code} 组`, sortOrder: index + 1 },
      })
      groups[code as 'A' | 'B'] = groupId
    }
  }

  const rounds: Record<string, string> = {}
  if (groupStageId) {
    for (const number of [1, 2, 3]) {
      const id = fixtureId(`round:${year}:group:${number}`)
      await tx.competitionRound.upsert({
        where: { stageId_roundNumber: { stageId: groupStageId, roundNumber: number } },
        create: {
          id,
          organizationId,
          stageId: groupStageId,
          roundNumber: number,
          name: `小组赛第 ${number} 轮`,
        },
        update: { name: `小组赛第 ${number} 轮` },
      })
      rounds[`GROUP:${number}`] = id
    }
  }

  const knockoutRoundNames =
    year === '2026' ? ['十六强', '八强赛', '半决赛', '决赛日'] : ['八强赛', '半决赛', '决赛日']
  for (const [index, name] of knockoutRoundNames.entries()) {
    const number = index + 1
    const id = fixtureId(`round:${year}:knockout:${number}`)
    await tx.competitionRound.upsert({
      where: { stageId_roundNumber: { stageId: knockoutStageId, roundNumber: number } },
      create: { id, organizationId, stageId: knockoutStageId, roundNumber: number, name },
      update: { name },
    })
    rounds[`KNOCKOUT:${number}`] = id
  }

  await tx.schedulePlan.upsert({
    where: { id: schedulePlanId },
    create: {
      id: schedulePlanId,
      organizationId,
      tournamentId,
      name: `${year} 绿茵杯正式赛程`,
      status: SchedulePlanStatus.PUBLISHED,
      publishedAt: new Date(`${year}-04-20T10:00:00+08:00`),
    },
    update: {
      name: `${year} 绿茵杯正式赛程`,
      status: SchedulePlanStatus.PUBLISHED,
      publishedAt: new Date(`${year}-04-20T10:00:00+08:00`),
    },
  })

  await tx.scheduleRevision.upsert({
    where: { id: scheduleRevisionId },
    create: {
      id: scheduleRevisionId,
      organizationId,
      tournamentId,
      schedulePlanId,
      version: 1,
      status: ScheduleRevisionStatus.PUBLISHED,
      snapshot: { fixture: 'DEMO_FIXTURE', season: year, revision: 1 },
      publishedAt: new Date(`${year}-04-20T10:00:00+08:00`),
    },
    update: {
      snapshot: { fixture: 'DEMO_FIXTURE', season: year, revision: 1 },
      publishedAt: new Date(`${year}-04-20T10:00:00+08:00`),
    },
  })

  return {
    year,
    id: tournamentId,
    seasonId,
    schedulePlanId,
    scheduleRevisionId,
    groupStageId,
    knockoutStageId,
    groups,
    rounds,
  }
}

export async function seedDemoRosters(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fixture: SeedTournamentFixture,
  teams: Array<{ id: string }>,
): Promise<void> {
  const participatingTeams = fixture.year === '2026' ? teams : teams.slice(0, 8)
  const coachSurnames = [
    '王',
    '李',
    '赵',
    '冯',
    '陆',
    '秦',
    '顾',
    '严',
    '沈',
    '江',
    '陶',
    '白',
    '杜',
    '夏',
    '乔',
    '孟',
  ]
  for (const [teamIndex, team] of participatingTeams.entries()) {
    const definition = DEMO_TEAMS[teamIndex]!
    const teamPlayers = DEMO_PLAYERS.filter((player) => player.teamIndex === teamIndex)
    const registrationId = fixtureId(`registration:${fixture.year}:${definition.code}`)
    const submissionId = fixtureId(`submission:${fixture.year}:${definition.code}`)
    const snapshotId = fixtureId(`snapshot:${fixture.year}:${definition.code}`)
    const sourceFileHash = createHash('sha256')
      .update(`DEMO_FIXTURE:${fixture.year}:${definition.code}`)
      .digest('hex')
    const groupId =
      fixture.year === '2026' && teamIndex < 8
        ? (fixture.groups[teamIndex < 4 ? 'A' : 'B'] ?? null)
        : null
    const coachDisplayName = `${coachSurnames[teamIndex] ?? '林'}教练`

    await tx.teamRegistration.upsert({
      where: { tournamentId_teamId: { tournamentId: fixture.id, teamId: team.id } },
      create: {
        id: registrationId,
        organizationId,
        tournamentId: fixture.id,
        teamId: team.id,
        groupId,
        status: TeamRegistrationStatus.APPROVED,
        leaderDisplayName: teamPlayers[6]!.displayName,
        coachDisplayName,
        approvedAt: new Date(`${fixture.year}-04-15T10:00:00+08:00`),
      },
      update: {
        groupId,
        status: TeamRegistrationStatus.APPROVED,
        leaderDisplayName: teamPlayers[6]!.displayName,
        coachDisplayName,
        approvedAt: new Date(`${fixture.year}-04-15T10:00:00+08:00`),
      },
    })

    const existingSnapshot = await tx.rosterSnapshot.findUnique({ where: { id: snapshotId } })
    if (existingSnapshot) {
      continue
    }

    await tx.rosterSubmission.create({
      data: {
        id: submissionId,
        organizationId,
        teamRegistrationId: registrationId,
        submissionVersion: 1,
        status: RosterSubmissionStatus.APPROVED,
        dataQualityStatus: DataQualityStatus.CLEAN,
        sourceFileHash,
        submittedAt: new Date(`${fixture.year}-04-10T09:00:00+08:00`),
        approvedAt: new Date(`${fixture.year}-04-15T10:00:00+08:00`),
      },
    })

    await tx.rosterEntry.createMany({
      data: teamPlayers.map((player, index) => ({
        id: fixtureId(`roster-entry:${fixture.year}:${definition.code}:${index}`),
        organizationId,
        rosterSubmissionId: submissionId,
        playerProfileId: player.id,
        shirtNumber: player.shirtNumber,
        sortOrder: index,
      })),
    })

    await tx.rosterSnapshot.create({
      data: {
        id: snapshotId,
        organizationId,
        tournamentId: fixture.id,
        teamId: team.id,
        teamRegistrationId: registrationId,
        rosterSubmissionId: submissionId,
        snapshotVersion: 1,
        sourceFileHash,
        lockedAt: null,
      },
    })

    await tx.rosterSnapshotEntry.createMany({
      data: teamPlayers.map((player, index) => ({
        id: fixtureId(`snapshot-entry:${fixture.year}:${definition.code}:${index}`),
        organizationId,
        rosterSnapshotId: snapshotId,
        playerProfileId: player.id,
        displayName: player.displayName,
        shirtNumber: player.shirtNumber,
        studentIdMasked: `DEMO****${player.sourceKey.slice(-2)}`,
        sortOrder: index,
      })),
    })

    const lockedAt = new Date(`${fixture.year}-04-20T10:00:00+08:00`)
    await tx.rosterSnapshot.update({ where: { id: snapshotId }, data: { lockedAt } })
    await tx.rosterSubmission.update({
      where: { id: submissionId },
      data: { status: RosterSubmissionStatus.LOCKED, lockedAt },
    })
  }
}

export async function seedDemoMatches(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fixtures: Record<'2025' | '2026', SeedTournamentFixture>,
  teams: Array<{ id: string }>,
  venues: Array<{ id: string }>,
): Promise<void> {
  const matchIds = new Map<string, string>()

  for (const [index, definition] of DEMO_MATCHES.entries()) {
    const fixture = fixtures[definition.tournament]
    const id = fixtureId(`match:${definition.code}`)
    const stageId = definition.stage === 'GROUP' ? fixture.groupStageId : fixture.knockoutStageId
    const groupId = definition.group ? fixture.groups[definition.group] : undefined
    const roundId = fixture.rounds[`${definition.stage}:${definition.round}`]

    await tx.match.upsert({
      where: {
        organizationId_matchCode: { organizationId, matchCode: definition.code },
      },
      create: {
        id,
        organizationId,
        tournamentId: fixture.id,
        schedulePlanId: fixture.schedulePlanId,
        scheduleRevisionId: fixture.scheduleRevisionId,
        stageId: stageId ?? null,
        groupId: groupId ?? null,
        roundId: roundId ?? null,
        homeTeamId:
          definition.homeTeamIndex === undefined ? null : teams[definition.homeTeamIndex]!.id,
        awayTeamId:
          definition.awayTeamIndex === undefined ? null : teams[definition.awayTeamIndex]!.id,
        venueId: venues[index % venues.length]!.id,
        matchCode: definition.code,
        title: definition.title,
        status: definition.status,
        scheduledStartAt: new Date(definition.scheduledStartAt),
        sortOrder: index,
        homeScore: definition.homeScore ?? null,
        awayScore: definition.awayScore ?? null,
        homePenaltyScore: definition.homePenaltyScore ?? null,
        awayPenaltyScore: definition.awayPenaltyScore ?? null,
        statusReason: definition.statusReason ?? null,
        summary: definition.summary ?? null,
        attendance: definition.attendance ?? null,
      },
      update: {
        tournamentId: fixture.id,
        schedulePlanId: fixture.schedulePlanId,
        scheduleRevisionId: fixture.scheduleRevisionId,
        stageId: stageId ?? null,
        groupId: groupId ?? null,
        roundId: roundId ?? null,
        homeTeamId:
          definition.homeTeamIndex === undefined ? null : teams[definition.homeTeamIndex]!.id,
        awayTeamId:
          definition.awayTeamIndex === undefined ? null : teams[definition.awayTeamIndex]!.id,
        venueId: venues[index % venues.length]!.id,
        title: definition.title,
        status: definition.status,
        scheduledStartAt: new Date(definition.scheduledStartAt),
        sortOrder: index,
        homeScore: definition.homeScore ?? null,
        awayScore: definition.awayScore ?? null,
        homePenaltyScore: definition.homePenaltyScore ?? null,
        awayPenaltyScore: definition.awayPenaltyScore ?? null,
        statusReason: definition.statusReason ?? null,
        summary: definition.summary ?? null,
        attendance: definition.attendance ?? null,
      },
    })
    matchIds.set(definition.code, id)
  }

  for (const [index, definition] of DEMO_MATCHES.entries()) {
    const matchId = matchIds.get(definition.code)!
    await tx.matchEvent.deleteMany({ where: { matchId } })
    await tx.matchAppearance.deleteMany({ where: { matchId } })
    await seedMatchFacts(tx, organizationId, matchId, definition, teams, index)
  }
}

function competitionRules(year: '2025' | '2026'): Prisma.InputJsonValue {
  return {
    summary:
      year === '2026'
        ? '前 8 支球队的小组赛记录作为历史数据保留；为完整演示淘汰树，淘汰阶段假设 16 支球队均已入围并使用演示签位，不表示由现存小组赛成绩自然晋级。冠军主线依次进行十六强、八强、半决赛和决赛，三四名赛为独立支线。'
        : '8 支球队采用单败淘汰赛，平局通过点球大战决出胜者。',
    points: { win: 3, draw: 1, loss: 0 },
    tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR', 'HEAD_TO_HEAD'],
  }
}

async function seedMatchFacts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  matchId: string,
  definition: DemoMatchDefinition,
  teams: Array<{ id: string }>,
  matchIndex: number,
): Promise<void> {
  if (
    definition.homeTeamIndex === undefined ||
    definition.awayTeamIndex === undefined ||
    definition.homeScore === undefined ||
    definition.awayScore === undefined ||
    (definition.status !== MatchStatus.FINISHED && definition.status !== MatchStatus.LIVE)
  ) {
    return
  }

  const teamIndexes = [definition.homeTeamIndex, definition.awayTeamIndex]
  const matchMinutes = definition.status === MatchStatus.LIVE ? 64 : 90
  await tx.matchAppearance.createMany({
    data: teamIndexes.flatMap((teamIndex) => {
      const players = DEMO_PLAYERS.filter((player) => player.teamIndex === teamIndex)
      return players.flatMap((player, index) => {
        const minutesPlayed = getDemoMinutesPlayed(index, matchMinutes)
        return minutesPlayed > 0
          ? [
              {
                id: fixtureId(`appearance:${definition.code}:${player.id}`),
                organizationId,
                matchId,
                teamId: teams[teamIndex]!.id,
                playerId: player.id,
                shirtNumber: player.shirtNumber,
                starter: isDemoMatchStarter(index),
                minutesPlayed,
              },
            ]
          : []
      })
    }),
  })

  const events: Prisma.MatchEventCreateManyInput[] = []
  const scorePairs = [
    { teamIndex: definition.homeTeamIndex, score: definition.homeScore, minuteOffset: 0 },
    { teamIndex: definition.awayTeamIndex, score: definition.awayScore, minuteOffset: 9 },
  ]
  for (const pair of scorePairs) {
    const players = DEMO_PLAYERS.filter((player) => player.teamIndex === pair.teamIndex)
    for (let goalIndex = 0; goalIndex < pair.score; goalIndex += 1) {
      const scorer = players[4 + ((matchIndex + goalIndex) % 6)]!
      const assister = players[6 + ((matchIndex + goalIndex * 2) % 4)]!
      const minute = Math.min(
        matchMinutes,
        12 +
          ((matchIndex * 11 + goalIndex * 23 + pair.minuteOffset) % Math.max(20, matchMinutes - 8)),
      )
      events.push({
        id: fixtureId(`event:${definition.code}:goal:${pair.teamIndex}:${goalIndex}`),
        organizationId,
        matchId,
        teamId: teams[pair.teamIndex]!.id,
        playerId: scorer.id,
        relatedPlayerId: goalIndex % 3 === 2 ? null : assister.id,
        type: MatchEventType.GOAL,
        minute,
        description: `${scorer.displayName}取得进球`,
        sortOrder: events.length,
      })
    }
  }

  const cardTeamIndex = teamIndexes[matchIndex % 2]!
  const cardPlayer = DEMO_PLAYERS.find(
    (player) => player.teamIndex === cardTeamIndex && player.shirtNumber === '4',
  )!
  events.push({
    id: fixtureId(`event:${definition.code}:yellow`),
    organizationId,
    matchId,
    teamId: teams[cardTeamIndex]!.id,
    playerId: cardPlayer.id,
    relatedPlayerId: null,
    type: MatchEventType.YELLOW_CARD,
    minute: Math.min(matchMinutes, 34 + (matchIndex % 20)),
    description: `${cardPlayer.displayName}战术犯规`,
    sortOrder: events.length,
  })

  await tx.matchEvent.createMany({ data: events.sort((left, right) => left.minute - right.minute) })
}
