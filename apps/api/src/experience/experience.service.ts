import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { selectPublicTournament } from '../common/public-tournament'
import { PrismaService } from '../database/prisma.service'
import { MediaService, postImageUrls } from '../media/media.service'
import {
  AuditActorType,
  MatchEventType,
  MatchStatus,
  NotificationType,
  PostStatus,
  PostType,
  type Prisma,
} from '../generated/prisma/client'
import { ResultsService } from '../results/results.service'
import {
  mapPostTags,
  normalizePostTags,
  postTagFingerprint,
  resolvePostTags,
  type ResolvedPostTag,
} from './post-tags'
import { parseResultsRules } from '../results/parse-rules'
import { SocialService } from '../social/social.service'
import { calculateOfficialTeamRecord } from './official-team-record'
import type {
  CreateCommentDto,
  CreateMatchReviewDto,
  CreatePostDto,
  SearchQueryDto,
  UpdateTeamPreferencesDto,
} from './experience.dto'
import { calculateStandings } from './ranking'
import {
  officialIdentity,
  publicIdentity,
  publicIdentitySelect,
  type PublicIdentitySource,
} from './public-identity'

@Injectable()
export class ExperienceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SocialService) private readonly socialService: SocialService,
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Optional() @Inject(ResultsService) private readonly resultsService?: ResultsService,
  ) {}

  async getHome(organizationId: string, authorization?: string, tournamentId?: string) {
    const session = await this.authService.getSession(authorization)
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId)
    const [matches, registrations, posts] = await Promise.all([
      this.prisma.match.findMany({
        where: { organizationId, tournamentId: tournament.id, status: { not: 'DRAFT' } },
        include: matchSummaryInclude,
        orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.teamRegistration.findMany({
        where: { organizationId, tournamentId: tournament.id, status: 'APPROVED' },
        include: { team: true, group: true },
        orderBy: [{ group: { sortOrder: 'asc' } }, { team: { name: 'asc' } }],
      }),
      this.prisma.post.findMany({
        where: { organizationId, tournamentId: tournament.id, status: PostStatus.PUBLISHED },
        include: postSummaryInclude(session?.userId),
        orderBy: { publishedAt: 'desc' },
        take: 20,
      }),
    ])

    const live = matches.filter((match) => match.status === MatchStatus.LIVE)
    const upcoming = matches.filter((match) => match.status === MatchStatus.SCHEDULED).slice(0, 4)
    const finished = matches
      .filter((match) => match.status === MatchStatus.FINISHED)
      .sort((a, b) => (b.scheduledStartAt?.getTime() ?? 0) - (a.scheduledStartAt?.getTime() ?? 0))
      .slice(0, 4)

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        seasonName: tournament.season.name,
        status: tournament.status,
        teamCount: registrations.length,
        matchCount: matches.length,
      },
      announcements: posts
        .filter((post) => post.type === PostType.OFFICIAL)
        .slice(0, 3)
        .map((post) => mapPost(post, session?.userId)),
      focusMatches: [...live, ...upcoming, ...finished].slice(0, 5).map(mapMatch),
      teams: registrations.map((registration) => ({
        ...mapTeam(registration.team),
        groupName: registration.group?.name ?? null,
      })),
      posts: posts
        .filter((post) => post.type === PostType.COMMUNITY)
        .map((post) => mapPost(post, session?.userId)),
      viewer: session?.user ?? null,
    }
  }

  async search(organizationId: string, input: SearchQueryDto, tournamentId?: string) {
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId)
    const snapshotScope = {
      organizationId,
      tournamentId: tournament.id,
      lockedAt: { not: null },
      teamRegistration: {
        organizationId,
        tournamentId: tournament.id,
        status: 'APPROVED' as const,
      },
    }
    const query = input.query
    const wants = (category: SearchQueryDto['category']) =>
      input.category === 'ALL' || input.category === category

    const [players, teams, matches, posts] = await Promise.all([
      wants('PLAYER')
        ? this.prisma.playerProfile.findMany({
            where: {
              organizationId,
              snapshotEntries: { some: { organizationId, rosterSnapshot: snapshotScope } },
              OR: [
                { displayName: { contains: query, mode: 'insensitive' } },
                { jerseyName: { contains: query, mode: 'insensitive' } },
              ],
            },
            include: {
              snapshotEntries: {
                where: { organizationId, rosterSnapshot: snapshotScope },
                include: { rosterSnapshot: { include: { team: true } } },
                orderBy: { rosterSnapshot: { snapshotVersion: 'desc' } },
                take: 1,
              },
            },
            orderBy: { displayName: 'asc' },
            take: 40,
          })
        : [],
      wants('TEAM')
        ? this.prisma.team.findMany({
            where: {
              organizationId,
              registrations: {
                some: { organizationId, tournamentId: tournament.id, status: 'APPROVED' },
              },
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { shortName: { contains: query, mode: 'insensitive' } },
                { collegeName: { contains: query, mode: 'insensitive' } },
              ],
            },
            orderBy: { name: 'asc' },
            take: 8,
          })
        : [],
      wants('MATCH')
        ? this.prisma.match.findMany({
            where: {
              organizationId,
              tournamentId: tournament.id,
              status: { not: 'DRAFT' },
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { homeTeam: { name: { contains: query, mode: 'insensitive' } } },
                { awayTeam: { name: { contains: query, mode: 'insensitive' } } },
              ],
            },
            include: matchSummaryInclude,
            orderBy: { scheduledStartAt: 'desc' },
            take: 8,
          })
        : [],
      wants('POST')
        ? this.prisma.post.findMany({
            where: {
              organizationId,
              tournamentId: tournament.id,
              status: PostStatus.PUBLISHED,
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { body: { contains: query, mode: 'insensitive' } },
              ],
            },
            include: postSummaryInclude(),
            orderBy: { publishedAt: 'desc' },
            take: 8,
          })
        : [],
    ])

    return {
      query,
      players: players.map((player) => ({
        id: player.id,
        displayName: player.displayName,
        position: player.position,
        academicYear: player.academicYear,
        profileColor: player.profileColor,
        avatarUrl: player.avatarUrl,
        team: player.snapshotEntries[0]?.rosterSnapshot.team
          ? mapTeam(player.snapshotEntries[0].rosterSnapshot.team)
          : null,
      })),
      teams: teams.map(mapTeam),
      matches: matches.map(mapMatch),
      posts: posts.map((post) => mapPost(post)),
    }
  }

  async listSeasons(
    organizationId: string,
    prisma: Pick<PrismaService, 'tournament'> = this.prisma,
  ) {
    const tournaments = await prisma.tournament.findMany({
      where: {
        organizationId,
        status: 'PUBLISHED',
        organization: { status: 'ACTIVE' },
        season: { organizationId },
      },
      include: { season: true },
      orderBy: { season: { startsOn: 'desc' } },
    })

    return tournaments.map((tournament) => ({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      seasonId: tournament.season.id,
      seasonName: tournament.season.name,
      year: tournament.season.seasonCode.slice(0, 4),
      status: tournament.status,
    }))
  }

  async getCompetitionData(organizationId: string, tournamentId?: string) {
    return this.prisma.$transaction(
      (prisma) => this.getCompetitionDataSnapshot(organizationId, tournamentId, prisma),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getCompetitionDataSnapshot(
    organizationId: string,
    tournamentId: string | undefined,
    prisma: Prisma.TransactionClient,
  ) {
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId, prisma)
    if (!tournament) throw notFound('赛事不存在')
    const resultContext = await this.resultContext(organizationId, tournament, prisma)

    const [registrations, matches, events, appearances, seasons] = await Promise.all([
      prisma.teamRegistration.findMany({
        where: { organizationId, tournamentId: tournament.id, status: 'APPROVED' },
        include: { team: true, group: true },
        orderBy: [{ group: { sortOrder: 'asc' } }, { team: { name: 'asc' } }],
      }),
      prisma.match.findMany({
        where: { organizationId, tournamentId: tournament.id, status: { not: 'DRAFT' } },
        include: { ...matchSummaryInclude, stage: true, group: true, round: true },
        orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }],
      }),
      prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      prisma.matchAppearance.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
        },
        include: { player: true, team: true },
      }),
      this.listSeasons(organizationId, prisma),
    ])

    const groupMap = new Map<
      string,
      { id: string; name: string; teams: typeof registrations; matches: typeof matches }
    >()
    for (const registration of registrations) {
      if (!registration.group) continue
      const group = groupMap.get(registration.group.id) ?? {
        id: registration.group.id,
        name: registration.group.name,
        teams: [],
        matches: [],
      }
      group.teams.push(registration)
      groupMap.set(registration.group.id, group)
    }
    for (const match of matches) {
      if (match.groupId && groupMap.has(match.groupId)) {
        groupMap.get(match.groupId)!.matches.push(match)
      }
    }

    const groups = [...groupMap.values()].map((group) => ({
      id: group.id,
      name: group.name,
      unresolvedTies:
        resultContext.official?.groups.find((item) => item.id === group.id)?.standings
          .unresolvedTies ?? [],
      standings: resultContext.official
        ? (
            resultContext.official.groups.find((item) => item.id === group.id)?.standings.rows ?? []
          ).map((row) => {
            const team = group.teams.find((item) => item.team.id === row.teamId)?.team
            return {
              ...row,
              teamName: team?.name ?? '',
              shortName: team?.shortName ?? team?.name ?? '',
              primaryColor: team?.primaryColor ?? null,
              isLive: false,
            }
          })
        : calculateStandings(
            group.teams.map(({ team }) => ({
              id: team.id,
              name: team.name,
              shortName: team.shortName ?? team.name,
              primaryColor: team.primaryColor,
            })),
            group.matches
              .filter(
                (match) =>
                  (match.status === MatchStatus.FINISHED || match.status === MatchStatus.LIVE) &&
                  match.homeTeamId &&
                  match.awayTeamId &&
                  match.homeScore !== null &&
                  match.awayScore !== null,
              )
              .map((match) => ({
                homeTeamId: match.homeTeamId!,
                awayTeamId: match.awayTeamId!,
                homeScore: match.homeScore!,
                awayScore: match.awayScore!,
                isLive: match.status === MatchStatus.LIVE,
                startedAt: match.scheduledStartAt ?? new Date(0),
              })),
          ).map(({ id, name, provisional, ...row }) => ({
            ...row,
            teamId: id,
            teamName: name,
            isLive: provisional,
          })),
    }))

    const bracketRounds = new Map<
      string,
      { id: string; name: string; number: number; matches: unknown[] }
    >()
    for (const match of matches.filter((item) => item.stage?.type === 'KNOCKOUT')) {
      const roundKey = match.round?.id ?? `round-${match.title}`
      const round = bracketRounds.get(roundKey) ?? {
        id: roundKey,
        name: match.round?.name ?? '淘汰赛',
        number: match.round?.roundNumber ?? 99,
        matches: [],
      }
      round.matches.push({
        ...mapResultMatch(match, resultContext.official),
        homePlaceholder: match.homeTeam ? null : knockoutPlaceholder(match.matchCode, 'home'),
        awayPlaceholder: match.awayTeam ? null : knockoutPlaceholder(match.matchCode, 'away'),
      })
      bracketRounds.set(roundKey, round)
    }

    const playerStats = buildPlayerStats(events, appearances)

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        seasonName: tournament.season.name,
        status: tournament.status,
      },
      seasons,
      schedule: matches.map((match) => mapResultMatch(match, resultContext.official)),
      groups,
      resultsMode: resultContext.mode,
      ruleVersionId: resultContext.official?.ruleVersionId ?? null,
      bracket: [...bracketRounds.values()].sort((a, b) => a.number - b.number),
      leaders: {
        scorers: playerStats
          .filter((player) => player.goals > 0)
          .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
          .slice(0, 10),
        assists: playerStats
          .filter((player) => player.assists > 0)
          .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
          .slice(0, 10),
      },
      updatedAt: new Date().toISOString(),
    }
  }

  async getTeamDashboard(
    organizationId: string,
    teamId: string,
    tournamentId?: string,
    authorization?: string,
  ) {
    return this.prisma.$transaction(
      (prisma) =>
        this.getTeamDashboardSnapshot(organizationId, teamId, tournamentId, authorization, prisma),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getTeamDashboardSnapshot(
    organizationId: string,
    teamId: string,
    tournamentId: string | undefined,
    authorization: string | undefined,
    prisma: Prisma.TransactionClient,
  ) {
    const session = await this.authService.getSession(authorization)
    const viewerUserId = session?.organizationId === organizationId ? session.userId : undefined
    const selectedTournament = await this.getFeaturedTournament(
      organizationId,
      tournamentId,
      prisma,
    )
    const selectedTournamentId = selectedTournament.id
    const resultContext = await this.resultContext(organizationId, selectedTournament, prisma)
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId,
        registrations: {
          some: { organizationId, tournamentId: selectedTournamentId, status: 'APPROVED' },
        },
      },
      include: {
        registrations: {
          where: { organizationId, tournamentId: selectedTournamentId, status: 'APPROVED' },
          include: { group: true },
          take: 1,
        },
        rosterSnapshots: {
          where: { tournamentId: selectedTournamentId, lockedAt: { not: null } },
          orderBy: { snapshotVersion: 'desc' },
          take: 1,
          include: { entries: { include: { playerProfile: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    })
    if (!team) throw notFound('球队不存在')

    const roster = team.rosterSnapshots[0]?.entries ?? []
    const playerIds = roster.map((entry) => entry.playerProfileId)
    const [matches, events, appearances, teamPosts, memberships] = await Promise.all([
      prisma.match.findMany({
        where: {
          organizationId,
          tournamentId: selectedTournamentId,
          status: { not: 'DRAFT' },
          OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
        },
        include: matchSummaryInclude,
        orderBy: { scheduledStartAt: 'asc' },
      }),
      prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
          OR: [{ playerId: { in: playerIds } }, { relatedPlayerId: { in: playerIds } }],
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      prisma.matchAppearance.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
          playerId: { in: playerIds },
        },
        include: { player: true, team: true },
      }),
      prisma.post.findMany({
        where: {
          organizationId,
          tournamentId: selectedTournamentId,
          OR: [{ teamId: team.id }, { tags: { some: { organizationId, teamId: team.id } } }],
          status: PostStatus.PUBLISHED,
        },
        include: postSummaryInclude(viewerUserId),
        orderBy: { publishedAt: 'desc' },
        take: 20,
      }),
      prisma.teamMembership.findMany({
        where: {
          organizationId,
          teamId: team.id,
          status: 'ACTIVE',
          playerProfileId: { in: playerIds },
        },
        select: { playerProfileId: true, position: true },
      }),
    ])
    const stats =
      resultContext.official && resultContext.rules
        ? calculateOfficialTeamRecord(
            team.id,
            resultContext.official.confirmedResults.map((fact) => ({
              ...fact,
              playedAt: new Date(fact.playedAt),
            })),
            resultContext.rules,
          )
        : calculateTeamRecord(team.id, matches)
    const playerStats = new Map(
      buildPlayerStats(events, appearances).map((item) => [item.id, item]),
    )
    const now = Date.now()
    const memberPositions = new Map(
      memberships.map((membership) => [membership.playerProfileId, membership.position]),
    )

    return {
      team: {
        ...mapTeam(team),
        description: team.description,
        motto: team.motto,
        foundedYear: team.foundedYear,
        coachName: team.registrations[0]?.coachDisplayName ?? null,
        captainName: team.registrations[0]?.leaderDisplayName ?? null,
        groupName: team.registrations[0]?.group?.name ?? null,
      },
      stats,
      resultsMode: resultContext.mode,
      posts: teamPosts.map((post) => mapPost(post, viewerUserId)),
      recentMatches: matches
        .filter(
          (match) =>
            match.status === MatchStatus.FINISHED &&
            (resultContext.mode === 'DEMO' || match.confirmedReportVersion !== null),
        )
        .slice(-5)
        .reverse()
        .map((match) => mapResultMatch(match, resultContext.official)),
      upcomingMatches: matches
        .filter(
          (match) =>
            (match.scheduledStartAt?.getTime() ?? 0) > now &&
            match.status === MatchStatus.SCHEDULED,
        )
        .slice(0, 5)
        .map(mapMatch),
      roster: roster.map((entry) => {
        const player = entry.playerProfile
        const stat = playerStats.get(player.id)
        return {
          id: player.id,
          displayName: player.displayName,
          jerseyName: player.jerseyName,
          shirtNumber: entry.shirtNumber,
          position: memberPositions.get(player.id) ?? player.position,
          secondaryPosition: player.secondaryPosition,
          academicYear: player.academicYear,
          heightCm: player.heightCm,
          profileColor: player.profileColor,
          avatarUrl: player.avatarUrl,
          appearances: stat?.appearances ?? 0,
          goals: stat?.goals ?? 0,
          assists: stat?.assists ?? 0,
        }
      }),
    }
  }

  async getPlayer(
    organizationId: string,
    playerId: string,
    tournamentId?: string,
    authorization?: string,
  ) {
    const session = await this.authService.getSession(authorization)
    const viewerUserId = session?.organizationId === organizationId ? session.userId : undefined
    return this.prisma.$transaction(
      (prisma) =>
        this.getPlayerSnapshot(organizationId, playerId, tournamentId, prisma, viewerUserId),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getPlayerSnapshot(
    organizationId: string,
    playerId: string,
    tournamentId: string | undefined,
    prisma: Prisma.TransactionClient,
    viewerUserId?: string,
  ) {
    const selectedTournament = await this.getFeaturedTournament(
      organizationId,
      tournamentId,
      prisma,
    )
    const selectedTournamentId = selectedTournament.id
    const resultContext = await this.resultContext(organizationId, selectedTournament, prisma)
    const snapshotScope = {
      organizationId,
      tournamentId: selectedTournamentId,
      lockedAt: { not: null },
      teamRegistration: {
        organizationId,
        tournamentId: selectedTournamentId,
        status: 'APPROVED' as const,
      },
    }
    const player = await prisma.playerProfile.findFirst({
      where: {
        id: playerId,
        organizationId,
        snapshotEntries: { some: { organizationId, rosterSnapshot: snapshotScope } },
      },
      include: {
        linkedUser: { select: publicIdentitySelect },
        snapshotEntries: {
          where: {
            organizationId,
            rosterSnapshot: snapshotScope,
          },
          include: { rosterSnapshot: { include: { team: true, tournament: true } } },
          orderBy: { rosterSnapshot: { snapshotVersion: 'desc' } },
          take: 1,
        },
      },
    })
    if (!player) throw notFound('球员不存在')

    const [events, appearances] = await Promise.all([
      prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
          OR: [{ playerId }, { relatedPlayerId: playerId }],
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      prisma.matchAppearance.findMany({
        where: {
          organizationId,
          playerId,
          match: resultContext.matchWhere,
        },
        include: { player: true, team: true, match: { include: matchSummaryInclude } },
        orderBy: { match: { scheduledStartAt: 'desc' } },
      }),
    ])
    const stats = buildPlayerStats(events, appearances).find((item) => item.id === playerId)
    const snapshot = player.snapshotEntries[0]
    const account =
      player.linkedUser?.status === 'ACTIVE' &&
      player.linkedUser.memberships.some(
        (item) => item.organizationId === organizationId && item.status === 'ACTIVE',
      )
        ? publicIdentity(player.linkedUser, organizationId, viewerUserId)
        : null
    const posts = await prisma.post.findMany({
      where: {
        organizationId,
        tournamentId: selectedTournamentId,
        OR: [
          { tags: { some: { organizationId, playerId } } },
          ...(account ? [{ authorUserId: account.id }] : []),
        ],
        status: PostStatus.PUBLISHED,
      },
      include: postSummaryInclude(viewerUserId),
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })

    return {
      id: player.id,
      person: account,
      posts: posts.map((post) => mapPost(post, viewerUserId)),
      displayName: player.displayName,
      jerseyName: player.jerseyName,
      shirtNumber: snapshot?.shirtNumber ?? null,
      position: player.position,
      secondaryPosition: player.secondaryPosition,
      dominantFoot: player.dominantFoot,
      heightCm: player.heightCm,
      academicYear: player.academicYear,
      major: player.major,
      hometown: player.hometown,
      bio: player.bio,
      profileColor: player.profileColor,
      avatarUrl: player.avatarUrl,
      portraitUrl: player.portraitUrl,
      isDemo: player.isDemo,
      abilities: {
        shooting: player.ratingShooting,
        speed: player.ratingSpeed,
        dribbling: player.ratingDribbling,
        passing: player.ratingPassing,
        defending: player.ratingDefending,
      },
      team: snapshot ? mapTeam(snapshot.rosterSnapshot.team) : null,
      tournamentName: snapshot?.rosterSnapshot.tournament.name ?? null,
      stats: stats ?? emptyPlayerStats(player.id, player.displayName),
      resultsMode: resultContext.mode,
      appearanceRecording: resultContext.mode === 'DEMO' ? 'DEMO' : 'EXISTING_MATCH_RECORDS',
      recentMatches: appearances.slice(0, 5).map((appearance) => ({
        ...mapResultMatch(appearance.match, resultContext.official),
        starter: appearance.starter,
        minutesPlayed: appearance.minutesPlayed,
      })),
    }
  }

  async getPerson(
    organizationId: string,
    userId: string,
    tournamentId?: string,
    authorization?: string,
  ) {
    if (
      userId !== 'official' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    )
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '人物标识不可用',
      })
    const session = await this.authService.getSession(authorization)
    return this.prisma.$transaction(
      async (prisma) => {
        const tournament = await this.getFeaturedTournament(organizationId, tournamentId, prisma)
        const membership =
          userId === 'official'
            ? null
            : await prisma.organizationMembership.findFirst({
                where: { organizationId, userId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
                include: {
                  user: { select: publicIdentitySelect },
                  organization: { select: { name: true } },
                },
              })
        if (userId !== 'official' && !membership) throw notFound('人物资料不可用')
        const user = membership?.user
        let player: Awaited<ReturnType<ExperienceService['getPlayerSnapshot']>> | null = null
        if (user?.playerProfile?.organizationId === organizationId) {
          try {
            player = await this.getPlayerSnapshot(
              organizationId,
              user.playerProfile.id,
              tournament.id,
              prisma,
              session?.userId,
            )
          } catch (error) {
            if (!(error instanceof ApiHttpException) || error.getStatus() !== HttpStatus.NOT_FOUND)
              throw error
          }
        }
        const posts =
          player?.posts ??
          (
            await prisma.post.findMany({
              where: {
                organizationId,
                tournamentId: tournament.id,
                status: PostStatus.PUBLISHED,
                authorUserId: user?.id ?? null,
              },
              include: postSummaryInclude(session?.userId),
              orderBy: { publishedAt: 'desc' },
              take: 50,
            })
          ).map((post) => mapPost(post, session?.userId))
        return {
          ...(user ? publicIdentity(user, organizationId, session?.userId) : officialIdentity),
          bio: user?.bio ?? null,
          organizationName: membership?.organization.name ?? null,
          player,
          posts,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async getMatchExperience(organizationId: string, matchId: string, authorization?: string) {
    return this.prisma.$transaction(
      (prisma) => this.getMatchExperienceSnapshot(organizationId, matchId, authorization, prisma),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getMatchExperienceSnapshot(
    organizationId: string,
    matchId: string,
    authorization: string | undefined,
    prisma: Prisma.TransactionClient,
  ) {
    const session = await this.authService.getSession(authorization)
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        organizationId,
        status: { not: 'DRAFT' },
        tournament: { organizationId, status: 'PUBLISHED' },
      },
      include: {
        ...matchSummaryInclude,
        tournament: true,
        stage: true,
        group: true,
        round: true,
        events: {
          include: { team: true, player: true, relatedPlayer: true },
          orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
        },
        appearances: {
          include: { player: true, team: true },
          orderBy: [{ teamId: 'asc' }, { starter: 'desc' }, { shirtNumber: 'asc' }],
        },
        reviews: {
          include: { user: { select: publicIdentitySelect } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    })
    if (!match) throw notFound('比赛不存在')
    const resultContext = await this.resultContext(organizationId, match.tournament, prisma)
    const isOfficialFact =
      resultContext.mode === 'DEMO' ||
      resultContext.official?.confirmedResults.some(
        (fact) => fact.id === match.id && fact.status === 'CONFIRMED',
      )
    const viewerReview = session
      ? match.reviews.find((review) => review.userId === session.userId)
      : undefined
    const ratingTotal = match.reviews.reduce((total, review) => total + review.rating, 0)

    return {
      ...mapResultMatch(match, resultContext.official),
      resultsMode: resultContext.mode,
      summary: resultContext.mode === 'DEMO' ? match.summary : null,
      attendance: match.attendance,
      events: (isOfficialFact ? match.events : []).map((event) => ({
        id: event.id,
        type: event.type,
        minute: event.minute,
        stoppageMinute: event.stoppageMinute,
        description: event.description,
        team: mapTeam(event.team),
        player: event.player
          ? { id: event.player.id, displayName: event.player.displayName }
          : null,
        relatedPlayer: event.relatedPlayer
          ? { id: event.relatedPlayer.id, displayName: event.relatedPlayer.displayName }
          : null,
      })),
      lineups: [match.homeTeam, match.awayTeam]
        .filter((team): team is NonNullable<typeof team> => Boolean(team))
        .map((team) => ({
          team: mapTeam(team),
          players: (isOfficialFact ? match.appearances : [])
            .filter((appearance) => appearance.teamId === team.id)
            .map((appearance) => ({
              id: appearance.player.id,
              displayName: appearance.player.displayName,
              shirtNumber: appearance.shirtNumber,
              position: appearance.player.position,
              starter: appearance.starter,
              minutesPlayed: appearance.minutesPlayed,
            })),
        })),
      reviews: {
        averageRating:
          match.reviews.length > 0
            ? Math.round((ratingTotal / match.reviews.length) * 10) / 10
            : null,
        ratingCount: match.reviews.length,
        viewerReview: viewerReview
          ? { rating: viewerReview.rating, body: viewerReview.body }
          : null,
        comments: match.reviews
          .filter((review) => Boolean(review.body))
          .map((review) => ({
            id: review.id,
            rating: review.rating,
            body: review.body!,
            createdAt: review.createdAt.toISOString(),
            author: publicIdentity(review.user, organizationId, session?.userId),
          })),
      },
    }
  }

  async reviewMatch(
    authorization: string | undefined,
    matchId: string,
    input: CreateMatchReviewDto,
  ) {
    const session = await this.authService.requireSession(authorization)
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, organizationId: session.organizationId },
      select: { id: true, status: true },
    })
    if (!match) throw notFound('比赛不存在')
    if (match.status !== MatchStatus.FINISHED) {
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '比赛结束后才可评分',
      })
    }

    const body = input.body?.trim() || null
    await this.prisma.matchReview.upsert({
      where: { matchId_userId: { matchId, userId: session.userId } },
      create: {
        organizationId: session.organizationId,
        matchId,
        userId: session.userId,
        rating: input.rating,
        body,
      },
      update: { rating: input.rating, body },
    })
    return this.getMatchExperience(session.organizationId, matchId, authorization)
  }

  async suggestPostTags(organizationId: string, query = '', tournamentId?: string) {
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId)
    const normalized = query.normalize('NFKC').replace(/^#+/, '').trim()
    const snapshotScope = {
      organizationId,
      tournamentId: tournament.id,
      lockedAt: { not: null },
      teamRegistration: {
        organizationId,
        tournamentId: tournament.id,
        status: 'APPROVED' as const,
      },
    }
    const [topics, teams, players] = await Promise.all([
      this.prisma.postTag.findMany({
        where: {
          organizationId,
          kind: 'TOPIC',
          post: { organizationId, tournamentId: tournament.id, status: PostStatus.PUBLISHED },
          ...(normalized ? { label: { contains: normalized, mode: 'insensitive' as const } } : {}),
        },
        distinct: ['key'],
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.team.findMany({
        where: {
          organizationId,
          registrations: {
            some: { organizationId, tournamentId: tournament.id, status: 'APPROVED' },
          },
          ...(normalized
            ? {
                OR: [
                  { name: { contains: normalized, mode: 'insensitive' as const } },
                  { shortName: { contains: normalized, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, collegeName: true, teamCode: true },
        orderBy: { name: 'asc' },
        take: 10,
      }),
      this.prisma.playerProfile.findMany({
        where: {
          organizationId,
          snapshotEntries: { some: { organizationId, rosterSnapshot: snapshotScope } },
          ...(normalized
            ? {
                OR: [
                  { displayName: { contains: normalized, mode: 'insensitive' as const } },
                  { jerseyName: { contains: normalized, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          displayName: true,
          snapshotEntries: {
            where: { organizationId, rosterSnapshot: snapshotScope },
            select: {
              shirtNumber: true,
              rosterSnapshot: { select: { team: { select: { name: true } } } },
            },
            orderBy: { rosterSnapshot: { snapshotVersion: 'desc' } },
            take: 1,
          },
        },
        orderBy: { displayName: 'asc' },
        take: 10,
      }),
    ])
    const fixedTopics = ['比赛日', '训练日常', '赛后记录', '校园足球']
      .filter((label) => !normalized || label.includes(normalized))
      .map((label) => ({ kind: 'TOPIC' as const, label }))
    const commonTopics = [
      ...topics.map((tag) => ({ kind: 'TOPIC' as const, label: tag.label })),
      ...fixedTopics,
    ]
    const seen = new Set<string>()
    return {
      items: [
        ...commonTopics.filter((tag) => {
          const key = tag.label.normalize('NFKC').toLocaleLowerCase('zh-CN')
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }),
        ...teams.map((team) => ({
          kind: 'TEAM' as const,
          label: team.name,
          targetId: team.id,
          description: [team.collegeName, team.teamCode].filter(Boolean).join(' · '),
        })),
        ...players.map((player) => ({
          kind: 'PLAYER' as const,
          label: player.displayName,
          targetId: player.id,
          description: `${player.snapshotEntries[0]?.rosterSnapshot.team.name ?? '校园球员'}${player.snapshotEntries[0]?.shirtNumber ? ` · #${player.snapshotEntries[0].shirtNumber}` : ''}`,
        })),
      ],
    }
  }

  async listPosts(organizationId: string, authorization?: string, tournamentId?: string) {
    const session = await this.authService.getSession(authorization)
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId)
    const posts = await this.prisma.post.findMany({
      where: { organizationId, tournamentId: tournament.id, status: PostStatus.PUBLISHED },
      include: postSummaryInclude(session?.userId),
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })
    return { items: posts.map((post) => mapPost(post, session?.userId)) }
  }

  async getPost(organizationId: string, postId: string, authorization?: string) {
    const session = await this.authService.getSession(authorization)
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId, status: PostStatus.PUBLISHED },
      include: {
        ...postSummaryInclude(session?.userId),
        comments: {
          where: { hiddenAt: null },
          include: { user: { select: publicIdentitySelect } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!post) throw notFound('动态不存在')
    return {
      ...mapPost(post, session?.userId),
      comments: post.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        parentCommentId: comment.parentCommentId,
        createdAt: comment.createdAt.toISOString(),
        author: publicIdentity(comment.user, organizationId, session?.userId),
      })),
    }
  }

  async getTeamPreferences(authorization: string | undefined, tournamentId?: string) {
    const session = await this.authService.requireSession(authorization)
    const preferences = await this.prisma.userTeamPreference.findMany({
      where: { organizationId: session.organizationId, userId: session.userId },
      include: { team: true },
      orderBy: [{ isPrimary: 'desc' }, { team: { name: 'asc' } }],
    })
    const tournament = await this.getFeaturedTournament(session.organizationId, tournamentId)
    const available = await this.prisma.team.findMany({
      where: {
        organizationId: session.organizationId,
        registrations: { some: { tournamentId: tournament.id, status: 'APPROVED' } },
      },
      orderBy: { name: 'asc' },
    })
    return {
      primaryTeam: preferences.find((item) => item.isPrimary)?.team
        ? mapTeam(preferences.find((item) => item.isPrimary)!.team)
        : null,
      followedTeams: preferences
        .filter((item) => !item.isPrimary)
        .map((item) => mapTeam(item.team)),
      availableTeams: available.map(mapTeam),
    }
  }

  async updateTeamPreferences(authorization: string | undefined, input: UpdateTeamPreferencesDto) {
    const session = await this.authService.requireSession(authorization)
    const requestedIds = [...new Set([input.primaryTeamId, ...input.followedTeamIds])]
    const teams = await this.prisma.team.findMany({
      where: { organizationId: session.organizationId, id: { in: requestedIds } },
    })
    if (teams.length !== requestedIds.length) {
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '选择中包含不可用球队',
      })
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userTeamPreference.deleteMany({
        where: { organizationId: session.organizationId, userId: session.userId },
      })
      await tx.userTeamPreference.createMany({
        data: requestedIds.map((teamId) => ({
          organizationId: session.organizationId,
          userId: session.userId,
          teamId,
          isPrimary: teamId === input.primaryTeamId,
        })),
      })
    })
    return this.getTeamPreferences(authorization)
  }

  async createPost(authorization: string | undefined, input: CreatePostDto, requestId = 'unknown') {
    const session = await this.authService.requireSession(authorization)
    const tournament = await this.getFeaturedTournament(session.organizationId, input.tournamentId)
    normalizePostTags(input.tags)
    if (input.teamId) {
      const [team, relationship] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: input.teamId, organizationId: session.organizationId },
          select: { id: true },
        }),
        this.prisma.teamMembership.findFirst({
          where: {
            organizationId: session.organizationId,
            teamId: input.teamId,
            status: 'ACTIVE',
            OR: [
              { userId: session.userId },
              ...(session.user.linkedPlayer
                ? [{ playerProfileId: session.user.linkedPlayer.id }]
                : []),
            ],
          },
          select: { id: true },
        }),
      ])
      if (!team) throw notFound('球队不存在')
      const isManager = session.user.roles.some(
        (role) =>
          role.role === 'PLATFORM_ADMIN' ||
          (role.role === 'ORGANIZATION_ADMIN' &&
            role.scopeType === 'ORGANIZATION' &&
            role.scopeId === session.organizationId) ||
          (role.role === 'TEAM_CAPTAIN' &&
            role.scopeType === 'TEAM' &&
            role.scopeId === input.teamId),
      )
      if (!relationship && !isManager) {
        throw new ApiHttpException(HttpStatus.FORBIDDEN, {
          code: ERROR_CODES.FORBIDDEN,
          message: '只有球队成员或队长可以发布球队动态',
        })
      }
    }
    const title = input.title?.trim() || null
    const body = input.body.trim()
    const teamId = input.teamId ?? null
    if (input.imageDataUrl && input.imageDataUrls) throw conflict('请只提交一种图片格式')
    const imageDataUrls = input.imageDataUrls ?? (input.imageDataUrl ? [input.imageDataUrl] : [])
    if (!body && imageDataUrls.length === 0)
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '请填写正文或添加图片',
      })
    const storedImage = await this.mediaService.storePostImages(
      session.organizationId,
      session.userId,
      imageDataUrls,
    )
    const imageUrl = storedImage?.imageUrl ?? null
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tags = await resolvePostTags(tx, session.organizationId, tournament.id, input.tags)
        const inserted = await tx.post.createMany({
          data: [
            {
              organizationId: session.organizationId,
              tournamentId: tournament.id,
              authorUserId: session.userId,
              clientPostId: input.clientPostId,
              teamId,
              type: PostType.COMMUNITY,
              status: PostStatus.PUBLISHED,
              title,
              body,
              imageUrl,
            },
          ],
          skipDuplicates: true,
        })
        const post = await tx.post.findUnique({
          where: {
            authorUserId_clientPostId: {
              authorUserId: session.userId,
              clientPostId: input.clientPostId,
            },
          },
          include: postSummaryInclude(session.userId),
        })
        if (
          !post ||
          post.organizationId !== session.organizationId ||
          post.tournamentId !== tournament.id ||
          post.teamId !== teamId ||
          post.title !== title ||
          post.body !== body ||
          post.imageUrl !== imageUrl
        ) {
          throw conflict('同一提交编号已用于其他动态内容，请重新发布')
        }
        if (
          inserted.count === 0 &&
          postTagFingerprint(post.tags ?? []) !== postTagFingerprint(tags)
        ) {
          throw conflict('同一提交编号已用于其他动态标签，请重新发布')
        }
        if (inserted.count === 1) {
          if (tags.length)
            await tx.postTag.createMany({
              data: tags.map((tag) => ({
                ...tag,
                organizationId: session.organizationId,
                postId: post.id,
              })),
            })
          await tx.auditLog.create({
            data: {
              organizationId: session.organizationId,
              actorType: AuditActorType.USER,
              actorUserId: session.userId,
              actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
                role,
                scopeType,
                scopeId,
              })),
              action: 'COMMUNITY_POST_CREATED',
              targetType: 'Post',
              targetId: post.id,
              afterSummary: {
                title,
                teamId,
                hasImage: Boolean(imageUrl),
                imageCount: imageDataUrls.length,
                tags: mapPostTags(tags),
              },
              reason: '用户发布校园足球动态',
              requestId,
              source: 'API',
            },
          })
        }
        return mapPost(inserted.count === 1 ? { ...post, tags } : post, session.userId)
      })
    } catch (error) {
      if (imageUrl) await this.mediaService.cleanupPostImageIfUnreferenced(imageUrl)
      throw error
    }
  }

  async setLike(authorization: string | undefined, postId: string, liked: boolean) {
    const session = await this.authService.requireSession(authorization)
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId: session.organizationId, status: PostStatus.PUBLISHED },
    })
    if (!post) throw notFound('动态不存在')
    return this.prisma.$transaction(async (tx) => {
      if (liked) {
        const storedLike = await tx.postLike.upsert({
          where: { postId_userId: { postId, userId: session.userId } },
          create: {
            organizationId: session.organizationId,
            postId,
            userId: session.userId,
          },
          update: {},
        })
        if (post.authorUserId) {
          await this.socialService.notify(
            {
              actorUserId: session.userId,
              body: `${session.user.displayName} 点赞了你的动态`,
              deduplicationKey: `post-like:${storedLike.id}`,
              linkPath: `/pages/post-detail/index?postId=${encodeURIComponent(postId)}`,
              organizationId: session.organizationId,
              recipientUserId: post.authorUserId,
              title: '动态收到新的点赞',
              type: NotificationType.POST_LIKED,
            },
            tx,
          )
        }
      } else {
        await tx.postLike.deleteMany({
          where: { postId, userId: session.userId, organizationId: session.organizationId },
        })
      }
      return {
        liked,
        likeCount: await tx.postLike.count({ where: { postId } }),
      }
    })
  }

  async createComment(authorization: string | undefined, postId: string, input: CreateCommentDto) {
    const session = await this.authService.requireSession(authorization)
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId: session.organizationId, status: PostStatus.PUBLISHED },
    })
    if (!post) throw notFound('动态不存在')

    const parent = input.parentCommentId
      ? await this.prisma.postComment.findFirst({
          where: {
            id: input.parentCommentId,
            postId,
            organizationId: session.organizationId,
            hiddenAt: null,
          },
          include: { user: { select: publicIdentitySelect } },
        })
      : null
    if (input.parentCommentId && !parent) throw notFound('要回复的评论不存在')

    const body = input.body.trim()
    const parentCommentId = parent?.id ?? null
    const recipientUserId = parent?.userId ?? post.authorUserId
    const comment = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.postComment.upsert({
        where: {
          userId_clientCommentId: {
            userId: session.userId,
            clientCommentId: input.clientCommentId,
          },
        },
        create: {
          organizationId: session.organizationId,
          postId,
          userId: session.userId,
          parentCommentId,
          clientCommentId: input.clientCommentId,
          body,
        },
        update: {},
        include: { user: { select: publicIdentitySelect } },
      })
      if (
        stored.organizationId !== session.organizationId ||
        stored.postId !== postId ||
        stored.parentCommentId !== parentCommentId ||
        stored.body !== body
      ) {
        throw conflict('同一提交编号已用于其他评论内容，请重新发布')
      }
      if (recipientUserId) {
        await this.socialService.notify(
          {
            actorUserId: session.userId,
            body: stored.body.slice(0, 160),
            deduplicationKey: `post-comment:${stored.id}`,
            linkPath: `/pages/post-detail/index?postId=${encodeURIComponent(postId)}`,
            organizationId: session.organizationId,
            recipientUserId,
            title: parent ? '有人回复了你的评论' : '你的动态收到新评论',
            type: parent ? NotificationType.COMMENT_REPLIED : NotificationType.POST_COMMENTED,
          },
          tx,
        )
      }
      return stored
    })
    const mappedComment = {
      id: comment.id,
      body: comment.body,
      parentCommentId: comment.parentCommentId,
      createdAt: comment.createdAt.toISOString(),
      author: publicIdentity(comment.user, session.organizationId, session.userId),
    }
    return mappedComment
  }

  private async getFeaturedTournament(
    organizationId: string,
    tournamentId?: string,
    prisma: Pick<PrismaService, 'tournament'> = this.prisma,
  ) {
    return selectPublicTournament(prisma, organizationId, tournamentId)
  }

  private async resultContext(
    organizationId: string,
    tournament: { id: string; tournamentCode: string },
    prisma: Prisma.TransactionClient,
  ) {
    const legacyDemo =
      organizationId === '00000000-0000-4000-8000-000000000001' &&
      /^DEMO-GREEN-CUP-(2025|2026)$/.test(tournament.tournamentCode) &&
      (await prisma.match.count({
        where: { organizationId, tournamentId: tournament.id, reportVersion: { gt: 0 } },
      })) === 0
    if (legacyDemo)
      return {
        mode: 'DEMO' as const,
        official: null,
        rules: null,
        matchWhere: {
          organizationId,
          tournamentId: tournament.id,
          status: { not: 'DRAFT' },
        } satisfies Prisma.MatchWhereInput,
      }
    if (!this.resultsService)
      throw new ApiHttpException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: '正式赛果服务尚未接入',
      })
    const official = await this.resultsService.readTournamentResults(
      organizationId,
      tournament.id,
      prisma,
    )
    const rule = await prisma.competitionRuleVersion.findFirst({
      where: { id: official.ruleVersionId, organizationId, tournamentId: tournament.id },
    })
    if (!rule) throw notFound('确认赛果的规程版本不存在')
    return {
      mode: 'OFFICIAL' as const,
      official,
      rules: parseResultsRules(rule.id, rule.rules),
      matchWhere: {
        organizationId,
        tournamentId: tournament.id,
        status: MatchStatus.FINISHED,
        confirmedReportVersion: { not: null },
      } satisfies Prisma.MatchWhereInput,
    }
  }
}

const matchSummaryInclude = {
  homeTeam: true,
  awayTeam: true,
  venue: true,
} as const

function postSummaryInclude(userId?: string) {
  return {
    author: { select: publicIdentitySelect },
    team: true,
    tags: { orderBy: { position: 'asc' } },
    _count: { select: { likes: true, comments: { where: { hiddenAt: null } } } },
    likes: userId
      ? { where: { userId }, select: { id: true } }
      : { where: { userId: '00000000-0000-4000-8000-000000000000' }, select: { id: true } },
  } as const
}

function mapTeam(team: {
  id: string
  teamCode: string
  name: string
  shortName: string | null
  collegeName: string | null
  primaryColor: string | null
  secondaryColor: string | null
  crestUrl?: string | null
}) {
  return {
    id: team.id,
    teamCode: team.teamCode,
    name: team.name,
    shortName: team.shortName ?? team.name,
    collegeName: team.collegeName,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    crestUrl: team.crestUrl ?? null,
  }
}

function mapMatch(match: {
  id: string
  tournamentId: string
  matchCode: string
  title: string
  status: MatchStatus
  scheduledStartAt: Date | null
  homeScore: number | null
  awayScore: number | null
  homePenaltyScore: number | null
  awayPenaltyScore: number | null
  statusReason: string | null
  homeTeam: Parameters<typeof mapTeam>[0] | null
  awayTeam: Parameters<typeof mapTeam>[0] | null
  venue: { id: string; name: string } | null
  stage?: { id: string; name: string; type: string } | null
  group?: { id: string; name: string } | null
  round?: { id: string; name: string; roundNumber: number } | null
}) {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    matchCode: match.matchCode,
    title: match.title,
    status: match.status,
    scheduledStartAt: match.scheduledStartAt?.toISOString() ?? null,
    homeTeam: match.homeTeam ? mapTeam(match.homeTeam) : null,
    awayTeam: match.awayTeam ? mapTeam(match.awayTeam) : null,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homePenaltyScore: match.homePenaltyScore,
    awayPenaltyScore: match.awayPenaltyScore,
    statusReason: match.statusReason,
    venue: match.venue ? { id: match.venue.id, name: match.venue.name } : null,
    stageName: match.stage?.name ?? null,
    stageType: match.stage?.type ?? null,
    groupName: match.group?.name ?? null,
    roundName: match.round?.name ?? null,
  }
}

function mapResultMatch(
  match: Parameters<typeof mapMatch>[0],
  official: Awaited<ReturnType<ResultsService['readTournamentResults']>> | null,
) {
  const mapped = mapMatch(match)
  if (!official) return mapped
  const fact = official.confirmedResults.find((item) => item.id === match.id)
  if (fact)
    return {
      ...mapped,
      homeScore: fact.status === 'VOID' ? null : fact.homeScore,
      awayScore: fact.status === 'VOID' ? null : fact.awayScore,
      homePenaltyScore: fact.status === 'VOID' ? null : fact.homePenaltyScore,
      awayPenaltyScore: fact.status === 'VOID' ? null : fact.awayPenaltyScore,
      resultStatus: fact.status,
      confirmedReportVersion: fact.revision,
    }
  return {
    ...mapped,
    ...(match.status === MatchStatus.FINISHED
      ? { homeScore: null, awayScore: null, homePenaltyScore: null, awayPenaltyScore: null }
      : {}),
    resultStatus: match.status === MatchStatus.LIVE ? 'LIVE_PREVIEW' : 'UNCONFIRMED',
    confirmedReportVersion: null,
  }
}

function mapPost(
  post: {
    id: string
    tournamentId?: string | null
    tags?: Array<Pick<ResolvedPostTag, 'kind' | 'label' | 'teamId' | 'playerId'>>
    organizationId?: string
    type: PostType
    title: string | null
    body: string
    imageUrl: string | null
    publishedAt: Date
    author: PublicIdentitySource | null
    team: Parameters<typeof mapTeam>[0] | null
    _count: { likes: number; comments: number }
    likes: Array<{ id: string }>
  },
  viewerUserId?: string,
) {
  return {
    id: post.id,
    ...(post.tournamentId ? { tournamentId: post.tournamentId } : {}),
    tags: mapPostTags(post.tags ?? []),
    type: post.type,
    title: post.title,
    body: post.body,
    imageUrl: post.imageUrl,
    imageUrls: postImageUrls(post.imageUrl),
    publishedAt: post.publishedAt.toISOString(),
    author: post.author
      ? publicIdentity(post.author, post.organizationId, viewerUserId)
      : officialIdentity,
    team: post.team ? mapTeam(post.team) : null,
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    likedByMe: post.likes.length > 0,
  }
}

function buildPlayerStats(
  events: Array<{
    type: MatchEventType
    playerId: string | null
    relatedPlayerId: string | null
    player: { id: string; displayName: string } | null
    relatedPlayer: { id: string; displayName: string } | null
    team: Parameters<typeof mapTeam>[0]
  }>,
  appearances: Array<{
    playerId: string
    minutesPlayed: number
    starter: boolean
    player?: { id: string; displayName: string }
    team?: Parameters<typeof mapTeam>[0]
  }>,
) {
  const rows = new Map<
    string,
    ReturnType<typeof emptyPlayerStats> & { team: ReturnType<typeof mapTeam> | null }
  >()
  const ensure = (id: string, name: string, team: ReturnType<typeof mapTeam> | null) => {
    const row = rows.get(id) ?? { ...emptyPlayerStats(id, name), team }
    if (!row.displayName && name) row.displayName = name
    if (!row.team && team) row.team = team
    rows.set(id, row)
    return row
  }

  for (const appearance of appearances) {
    if (appearance.minutesPlayed <= 0) continue
    const row = ensure(
      appearance.playerId,
      appearance.player?.displayName ?? '',
      appearance.team ? mapTeam(appearance.team) : null,
    )
    row.appearances += 1
    row.starts += appearance.starter ? 1 : 0
    row.minutes += appearance.minutesPlayed
  }
  for (const event of events) {
    const team = mapTeam(event.team)
    if (event.playerId && event.player) {
      const row = ensure(event.playerId, event.player.displayName, team)
      if (event.type === MatchEventType.GOAL) row.goals += 1
      if (event.type === MatchEventType.YELLOW_CARD) row.yellowCards += 1
      if (event.type === MatchEventType.RED_CARD) row.redCards += 1
    }
    if (event.type === MatchEventType.GOAL && event.relatedPlayerId && event.relatedPlayer) {
      ensure(event.relatedPlayerId, event.relatedPlayer.displayName, team).assists += 1
    }
  }
  return [...rows.values()].filter((row) => row.displayName)
}

function emptyPlayerStats(id: string, displayName: string) {
  return {
    id,
    displayName,
    appearances: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
  }
}

function calculateTeamRecord(
  teamId: string,
  matches: Array<{
    status: MatchStatus
    homeTeamId: string | null
    awayTeamId: string | null
    homeScore: number | null
    awayScore: number | null
  }>,
) {
  const result = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  for (const match of matches) {
    if (
      (match.status !== MatchStatus.FINISHED && match.status !== MatchStatus.LIVE) ||
      match.homeScore === null ||
      match.awayScore === null
    ) {
      continue
    }
    const isHome = match.homeTeamId === teamId
    const goalsFor = isHome ? match.homeScore : match.awayScore
    const goalsAgainst = isHome ? match.awayScore : match.homeScore
    result.played += 1
    result.goalsFor += goalsFor
    result.goalsAgainst += goalsAgainst
    if (goalsFor > goalsAgainst) {
      result.won += 1
      result.points += 3
    } else if (goalsFor < goalsAgainst) {
      result.lost += 1
    } else {
      result.drawn += 1
      result.points += 1
    }
  }
  return { ...result, goalDifference: result.goalsFor - result.goalsAgainst }
}

function knockoutPlaceholder(matchCode: string, side: 'home' | 'away'): string {
  const placeholders: Record<string, [string, string]> = {
    'GC26-SF-01': ['A组第 1', 'B组第 2'],
    'GC26-SF-02': ['B组第 1', 'A组第 2'],
    'GC26-THIRD': ['半决赛 1 负者', '半决赛 2 负者'],
    'GC26-FINAL': ['半决赛 1 胜者', '半决赛 2 胜者'],
  }
  return placeholders[matchCode]?.[side === 'home' ? 0 : 1] ?? '待定'
}

function notFound(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.NOT_FOUND, {
    code: ERROR_CODES.NOT_FOUND,
    message,
  })
}

function conflict(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.CONFLICT, {
    code: ERROR_CODES.CONFLICT,
    message,
  })
}
