import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import {
  MatchEventType,
  MatchStatus,
  PostStatus,
  PostType,
  type Prisma,
} from '../generated/prisma/client'
import type { CreateCommentDto, CreatePostDto, SearchQueryDto, UpdateTeamPreferencesDto } from './experience.dto'
import { calculateStandings } from './ranking'

const FEATURED_TOURNAMENT_CODE = 'DEMO-GREEN-CUP-2026'

@Injectable()
export class ExperienceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async getHome(organizationId: string, authorization?: string) {
    const session = await this.authService.getSession(authorization)
    const tournament = await this.getFeaturedTournament(organizationId)
    const [matches, registrations, posts] = await Promise.all([
      this.prisma.match.findMany({
        where: { organizationId, tournamentId: tournament.id },
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
      announcements: posts.filter((post) => post.type === PostType.OFFICIAL).slice(0, 3).map(mapPost),
      focusMatches: [...live, ...upcoming, ...finished].slice(0, 5).map(mapMatch),
      teams: registrations.map((registration) => ({
        ...mapTeam(registration.team),
        groupName: registration.group?.name ?? null,
      })),
      posts: posts.filter((post) => post.type === PostType.COMMUNITY).map(mapPost),
      viewer: session?.user ?? null,
    }
  }

  async search(organizationId: string, input: SearchQueryDto) {
    const tournament = await this.getFeaturedTournament(organizationId)
    const query = input.query
    const wants = (category: SearchQueryDto['category']) =>
      input.category === 'ALL' || input.category === category

    const [players, teams, matches, posts] = await Promise.all([
      wants('PLAYER')
        ? this.prisma.playerProfile.findMany({
            where: { organizationId, isDemo: true, displayName: { contains: query, mode: 'insensitive' } },
            include: {
              snapshotEntries: {
                where: { rosterSnapshot: { tournamentId: tournament.id } },
                include: { rosterSnapshot: { include: { team: true } } },
                take: 1,
              },
            },
            orderBy: { displayName: 'asc' },
            take: 8,
          })
        : [],
      wants('TEAM')
        ? this.prisma.team.findMany({
            where: {
              organizationId,
              registrations: { some: { tournamentId: tournament.id } },
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
        team: player.snapshotEntries[0]?.rosterSnapshot.team
          ? mapTeam(player.snapshotEntries[0].rosterSnapshot.team)
          : null,
      })),
      teams: teams.map(mapTeam),
      matches: matches.map(mapMatch),
      posts: posts.map(mapPost),
    }
  }

  async listSeasons(organizationId: string) {
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        organizationId,
        tournamentCode: { startsWith: 'DEMO-GREEN-CUP-' },
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
    const tournament = tournamentId
      ? await this.prisma.tournament.findFirst({
          where: { id: tournamentId, organizationId },
          include: { season: true },
        })
      : await this.getFeaturedTournament(organizationId)
    if (!tournament) throw notFound('赛事不存在')

    const [registrations, matches, events, appearances, seasons] = await Promise.all([
      this.prisma.teamRegistration.findMany({
        where: { organizationId, tournamentId: tournament.id, status: 'APPROVED' },
        include: { team: true, group: true },
        orderBy: [{ group: { sortOrder: 'asc' } }, { team: { name: 'asc' } }],
      }),
      this.prisma.match.findMany({
        where: { organizationId, tournamentId: tournament.id },
        include: { ...matchSummaryInclude, stage: true, group: true, round: true },
        orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.matchEvent.findMany({
        where: { organizationId, match: { tournamentId: tournament.id } },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      this.prisma.matchAppearance.findMany({
        where: { organizationId, match: { tournamentId: tournament.id } },
        include: { player: true, team: true },
      }),
      this.listSeasons(organizationId),
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
      standings: calculateStandings(
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

    const bracketRounds = new Map<string, { id: string; name: string; number: number; matches: unknown[] }>()
    for (const match of matches.filter((item) => item.stage?.type === 'KNOCKOUT')) {
      const roundKey = match.round?.id ?? `round-${match.title}`
      const round = bracketRounds.get(roundKey) ?? {
        id: roundKey,
        name: match.round?.name ?? '淘汰赛',
        number: match.round?.roundNumber ?? 99,
        matches: [],
      }
      round.matches.push({
        ...mapMatch(match),
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
      schedule: matches.map(mapMatch),
      groups,
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

  async getTeamDashboard(organizationId: string, teamId: string, tournamentId?: string) {
    const selectedTournamentId =
      tournamentId ?? (await this.getFeaturedTournament(organizationId)).id
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
      include: {
        registrations: {
          where: { tournamentId: selectedTournamentId },
          include: { group: true },
          take: 1,
        },
        rosterSnapshots: {
          where: { tournamentId: selectedTournamentId },
          orderBy: { snapshotVersion: 'desc' },
          take: 1,
          include: { entries: { include: { playerProfile: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    })
    if (!team) throw notFound('球队不存在')

    const roster = team.rosterSnapshots[0]?.entries ?? []
    const playerIds = roster.map((entry) => entry.playerProfileId)
    const [matches, events, appearances] = await Promise.all([
      this.prisma.match.findMany({
        where: {
          organizationId,
          tournamentId: selectedTournamentId,
          OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
        },
        include: matchSummaryInclude,
        orderBy: { scheduledStartAt: 'asc' },
      }),
      this.prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: { tournamentId: selectedTournamentId },
          OR: [{ playerId: { in: playerIds } }, { relatedPlayerId: { in: playerIds } }],
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      this.prisma.matchAppearance.findMany({
        where: {
          organizationId,
          match: { tournamentId: selectedTournamentId },
          playerId: { in: playerIds },
        },
        include: { player: true, team: true },
      }),
    ])
    const stats = calculateTeamRecord(team.id, matches)
    const playerStats = new Map(buildPlayerStats(events, appearances).map((item) => [item.id, item]))
    const now = Date.now()

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
      recentMatches: matches
        .filter((match) => (match.scheduledStartAt?.getTime() ?? 0) <= now || match.status === MatchStatus.FINISHED)
        .slice(-5)
        .reverse()
        .map(mapMatch),
      upcomingMatches: matches
        .filter((match) => (match.scheduledStartAt?.getTime() ?? 0) > now && match.status !== MatchStatus.FINISHED)
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
          position: player.position,
          secondaryPosition: player.secondaryPosition,
          academicYear: player.academicYear,
          heightCm: player.heightCm,
          profileColor: player.profileColor,
          appearances: stat?.appearances ?? 0,
          goals: stat?.goals ?? 0,
          assists: stat?.assists ?? 0,
        }
      }),
    }
  }

  async getPlayer(organizationId: string, playerId: string, tournamentId?: string) {
    const selectedTournamentId =
      tournamentId ?? (await this.getFeaturedTournament(organizationId)).id
    const player = await this.prisma.playerProfile.findFirst({
      where: { id: playerId, organizationId },
      include: {
        snapshotEntries: {
          where: { rosterSnapshot: { tournamentId: selectedTournamentId } },
          include: { rosterSnapshot: { include: { team: true, tournament: true } } },
          take: 1,
        },
      },
    })
    if (!player) throw notFound('球员不存在')

    const [events, appearances] = await Promise.all([
      this.prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: { tournamentId: selectedTournamentId },
          OR: [{ playerId }, { relatedPlayerId: playerId }],
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
        this.prisma.matchAppearance.findMany({
          where: { organizationId, playerId, match: { tournamentId: selectedTournamentId } },
          include: { player: true, team: true, match: { include: matchSummaryInclude } },
          orderBy: { match: { scheduledStartAt: 'desc' } },
        }),
    ])
    const stats = buildPlayerStats(events, appearances).find((item) => item.id === playerId)
    const snapshot = player.snapshotEntries[0]

    return {
      id: player.id,
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
      team: snapshot ? mapTeam(snapshot.rosterSnapshot.team) : null,
      tournamentName: snapshot?.rosterSnapshot.tournament.name ?? null,
      stats: stats ?? emptyPlayerStats(player.id, player.displayName),
      recentMatches: appearances.slice(0, 5).map((appearance) => ({
        ...mapMatch(appearance.match),
        starter: appearance.starter,
        minutesPlayed: appearance.minutesPlayed,
      })),
    }
  }

  async getMatchExperience(organizationId: string, matchId: string) {
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, organizationId },
      include: {
        ...matchSummaryInclude,
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
      },
    })
    if (!match) throw notFound('比赛不存在')

    return {
      ...mapMatch(match),
      summary: match.summary,
      attendance: match.attendance,
      events: match.events.map((event) => ({
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
          players: match.appearances
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
    }
  }

  async listPosts(organizationId: string, authorization?: string) {
    const session = await this.authService.getSession(authorization)
    const tournament = await this.getFeaturedTournament(organizationId)
    const posts = await this.prisma.post.findMany({
      where: { organizationId, tournamentId: tournament.id, status: PostStatus.PUBLISHED },
      include: postSummaryInclude(session?.userId),
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })
    return { items: posts.map(mapPost) }
  }

  async getPost(organizationId: string, postId: string, authorization?: string) {
    const session = await this.authService.getSession(authorization)
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId, status: PostStatus.PUBLISHED },
      include: {
        ...postSummaryInclude(session?.userId),
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!post) throw notFound('动态不存在')
    return {
      ...mapPost(post),
      comments: post.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.user.id,
          displayName: comment.user.displayName,
          verificationLevel: comment.user.verificationLevel,
        },
      })),
    }
  }

  async getTeamPreferences(authorization: string | undefined) {
    const session = await this.authService.requireSession(authorization)
    const preferences = await this.prisma.userTeamPreference.findMany({
      where: { organizationId: session.organizationId, userId: session.userId },
      include: { team: true },
      orderBy: [{ isPrimary: 'desc' }, { team: { name: 'asc' } }],
    })
    const tournament = await this.getFeaturedTournament(session.organizationId)
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
      followedTeams: preferences.filter((item) => !item.isPrimary).map((item) => mapTeam(item.team)),
      availableTeams: available.map(mapTeam),
    }
  }

  async updateTeamPreferences(
    authorization: string | undefined,
    input: UpdateTeamPreferencesDto,
  ) {
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

  async createPost(authorization: string | undefined, input: CreatePostDto) {
    const session = await this.authService.requireSession(authorization)
    const tournament = await this.getFeaturedTournament(session.organizationId)
    const post = await this.prisma.post.create({
      data: {
        organizationId: session.organizationId,
        tournamentId: tournament.id,
        authorUserId: session.userId,
        type: PostType.COMMUNITY,
        status: PostStatus.PUBLISHED,
        title: input.title?.trim() || null,
        body: input.body.trim(),
      },
      include: postSummaryInclude(session.userId),
    })
    return mapPost(post)
  }

  async toggleLike(authorization: string | undefined, postId: string) {
    const session = await this.authService.requireSession(authorization)
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId: session.organizationId, status: PostStatus.PUBLISHED },
    })
    if (!post) throw notFound('动态不存在')

    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId: session.userId } },
    })
    if (existing) {
      await this.prisma.postLike.delete({ where: { id: existing.id } })
    } else {
      await this.prisma.postLike.create({
        data: {
          organizationId: session.organizationId,
          postId,
          userId: session.userId,
        },
      })
    }
    return {
      liked: !existing,
      likeCount: await this.prisma.postLike.count({ where: { postId } }),
    }
  }

  async createComment(
    authorization: string | undefined,
    postId: string,
    input: CreateCommentDto,
  ) {
    const session = await this.authService.requireSession(authorization)
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId: session.organizationId, status: PostStatus.PUBLISHED },
    })
    if (!post) throw notFound('动态不存在')

    const comment = await this.prisma.postComment.create({
      data: {
        organizationId: session.organizationId,
        postId,
        userId: session.userId,
        body: input.body.trim(),
      },
      include: { user: true },
    })
    return {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: comment.user.id,
        displayName: comment.user.displayName,
        verificationLevel: comment.user.verificationLevel,
      },
    }
  }

  private async getFeaturedTournament(organizationId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { organizationId, tournamentCode: FEATURED_TOURNAMENT_CODE },
      include: { season: true },
    })
    if (!tournament) throw notFound('演示赛事尚未初始化，请先运行数据库 Seed')
    return tournament
  }
}

const matchSummaryInclude = {
  homeTeam: true,
  awayTeam: true,
  venue: true,
} as const

function postSummaryInclude(userId?: string) {
  return {
    author: true,
    _count: { select: { likes: true, comments: true } },
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
}) {
  return {
    id: team.id,
    teamCode: team.teamCode,
    name: team.name,
    shortName: team.shortName ?? team.name,
    collegeName: team.collegeName,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
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

function mapPost(post: {
  id: string
  type: PostType
  title: string | null
  body: string
  publishedAt: Date
  author: { id: string; displayName: string; verificationLevel: string } | null
  _count: { likes: number; comments: number }
  likes: Array<{ id: string }>
}) {
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    body: post.body,
    publishedAt: post.publishedAt.toISOString(),
    author: post.author
      ? {
          id: post.author.id,
          displayName: post.author.displayName,
          verificationLevel: post.author.verificationLevel,
        }
      : { id: 'official', displayName: '晓球赛事组', verificationLevel: 'STAFF_VERIFIED' },
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
