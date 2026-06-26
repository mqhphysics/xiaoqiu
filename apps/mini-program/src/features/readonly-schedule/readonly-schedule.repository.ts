import Taro from '@tarojs/taro'

import { readonlyScheduleMockFixture } from './mock-fixture'
import type {
  MatchStatus,
  ReadonlyMatch,
  ReadonlyTeam,
  ReadonlyTournamentDetail,
  ReadonlyTournamentSummary,
} from './readonly-schedule.types'

const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

interface RepositoryResult<T> {
  data: T
  source: 'api' | 'mock'
}

interface ApiContext {
  baseUrl: string
  organizationId: string
}

interface ApiTournamentList {
  items: ApiTournament[]
}

interface ApiTournament {
  id: string
  seasonId: string
  tournamentCode: string
  name: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

interface ApiSeason {
  id: string
  seasonCode: string
  name: string
}

interface ApiRuleVersion {
  version: number
  name: string
  rules: Record<string, unknown>
}

interface ApiTournamentDetail extends ApiTournament {
  season: ApiSeason
  ruleVersions: ApiRuleVersion[]
}

interface ApiScheduleRevision {
  version: number
  publishedAt: string
}

interface ApiMatchTeam {
  id: string
  teamCode: string
  name: string
  shortName?: string | null
}

interface ApiMatchVenue {
  id: string
  venueCode: string
  name: string
}

interface ApiMatch {
  id: string
  tournamentId: string
  matchCode: string
  title: string
  status: MatchStatus
  scheduledStartAt?: string | null
  homeTeam?: ApiMatchTeam | null
  awayTeam?: ApiMatchTeam | null
  venue?: ApiMatchVenue | null
}

interface ApiTournamentSchedule {
  tournament: ApiTournament
  revision: ApiScheduleRevision
  matches: ApiMatch[]
}

interface ApiTeam {
  id: string
  teamCode: string
  name: string
  shortName?: string | null
}

class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

class ReadonlyScheduleRepository {
  async listTournaments(): Promise<RepositoryResult<ReadonlyTournamentSummary[]>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      return {
        data: readonlyScheduleMockFixture.tournaments.map(toTournamentSummary),
        source: 'mock',
      }
    }

    const list = await requestApi<ApiTournamentList>(apiContext, '/public/tournaments')
    const details = await Promise.all(
      list.items.map((tournament) => this.loadApiTournamentDetail(apiContext, tournament.id)),
    )

    return {
      data: details.map(toTournamentSummary),
      source: 'api',
    }
  }

  async getTournament(tournamentId: string): Promise<RepositoryResult<ReadonlyTournamentDetail | null>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const tournament =
        readonlyScheduleMockFixture.tournaments.find((item) => item.id === tournamentId) ?? null
      return { data: tournament, source: 'mock' }
    }

    try {
      return {
        data: await this.loadApiTournamentDetail(apiContext, tournamentId),
        source: 'api',
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 404) {
        return { data: null, source: 'api' }
      }
      throw error
    }
  }

  async listMatches(tournamentId: string): Promise<RepositoryResult<ReadonlyMatch[]>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const tournament = readonlyScheduleMockFixture.tournaments.find((item) => item.id === tournamentId)
      return {
        data: tournament?.recentMatches ?? [],
        source: 'mock',
      }
    }

    const schedule = await requestApi<ApiTournamentSchedule>(
      apiContext,
      `/public/tournaments/${encodeURIComponent(tournamentId)}/schedule`,
    )
    return {
      data: schedule.matches.map(mapMatch),
      source: 'api',
    }
  }

  async getMatch(matchId: string): Promise<RepositoryResult<ReadonlyMatch | null>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const matches = readonlyScheduleMockFixture.tournaments.flatMap((tournament) => tournament.recentMatches)
      return {
        data: matches.find((match) => match.id === matchId) ?? null,
        source: 'mock',
      }
    }

    try {
      return {
        data: mapMatch(await requestApi<ApiMatch>(apiContext, `/public/matches/${encodeURIComponent(matchId)}`)),
        source: 'api',
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 404) {
        return { data: null, source: 'api' }
      }
      throw error
    }
  }

  async getTeam(teamId: string): Promise<RepositoryResult<ReadonlyTeam | null>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const teams = readonlyScheduleMockFixture.tournaments.flatMap((tournament) => tournament.teams)
      return {
        data: teams.find((team) => team.id === teamId) ?? null,
        source: 'mock',
      }
    }

    try {
      const team = await requestApi<ApiTeam>(apiContext, `/public/teams/${encodeURIComponent(teamId)}`)
      return {
        data: mapTeam(team, await this.findTournamentIdForTeam(apiContext, team.id)),
        source: 'api',
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 404) {
        return { data: null, source: 'api' }
      }
      throw error
    }
  }

  private async loadApiTournamentDetail(
    apiContext: ApiContext,
    tournamentId: string,
  ): Promise<ReadonlyTournamentDetail> {
    const [detail, schedule] = await Promise.all([
      requestApi<ApiTournamentDetail>(apiContext, `/public/tournaments/${encodeURIComponent(tournamentId)}`),
      requestApi<ApiTournamentSchedule>(
        apiContext,
        `/public/tournaments/${encodeURIComponent(tournamentId)}/schedule`,
      ),
    ])

    return mapTournamentDetail(detail, schedule)
  }

  private async findTournamentIdForTeam(apiContext: ApiContext, teamId: string): Promise<string> {
    const list = await requestApi<ApiTournamentList>(apiContext, '/public/tournaments')

    for (const tournament of list.items) {
      const schedule = await requestApi<ApiTournamentSchedule>(
        apiContext,
        `/public/tournaments/${encodeURIComponent(tournament.id)}/schedule`,
      )
      const hasTeam = schedule.matches.some(
        (match) => match.homeTeam?.id === teamId || match.awayTeam?.id === teamId,
      )
      if (hasTeam) {
        return tournament.id
      }
    }

    return ''
  }
}

export const readonlyScheduleRepository = new ReadonlyScheduleRepository()

function mapTournamentDetail(
  detail: ApiTournamentDetail,
  schedule: ApiTournamentSchedule,
): ReadonlyTournamentDetail {
  const matches = schedule.matches.map(mapMatch)
  const teams = collectTeams(detail.id, schedule.matches)

  return {
    id: detail.id,
    name: detail.name,
    code: detail.tournamentCode,
    seasonName: detail.season.name,
    organizationName: '晓球开发组织',
    statusText: getTournamentStatusText(detail.status),
    startDate: formatDateRangePoint(matches.at(0)?.scheduledStartAt),
    endDate: formatDateRangePoint(matches.at(-1)?.scheduledStartAt),
    teamCount: teams.length,
    matchCount: matches.length,
    description: `已发布赛程 v${schedule.revision.version}`,
    rules: detail.ruleVersions.map(mapRuleText),
    teams,
    recentMatches: matches,
  }
}

function toTournamentSummary(tournament: ReadonlyTournamentDetail): ReadonlyTournamentSummary {
  const {
    id,
    name,
    code,
    seasonName,
    organizationName,
    statusText,
    startDate,
    endDate,
    teamCount,
    matchCount,
    description,
  } = tournament

  return {
    id,
    name,
    code,
    seasonName,
    organizationName,
    statusText,
    startDate,
    endDate,
    teamCount,
    matchCount,
    description,
  }
}

function mapMatch(match: ApiMatch): ReadonlyMatch {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    stageName: '赛程',
    roundName: match.title || match.matchCode,
    scheduledStartAt: match.scheduledStartAt ?? new Date(0).toISOString(),
    venueName: match.venue?.name ?? '待定场地',
    pitchName: '',
    homeTeamId: match.homeTeam?.id ?? '',
    awayTeamId: match.awayTeam?.id ?? '',
    homeTeamName: match.homeTeam?.name ?? '待定主队',
    awayTeamName: match.awayTeam?.name ?? '待定客队',
    status: match.status,
  }
}

function collectTeams(tournamentId: string, matches: ApiMatch[]): ReadonlyTeam[] {
  const teams = new Map<string, ApiMatchTeam>()

  for (const match of matches) {
    if (match.homeTeam) {
      teams.set(match.homeTeam.id, match.homeTeam)
    }
    if (match.awayTeam) {
      teams.set(match.awayTeam.id, match.awayTeam)
    }
  }

  return [...teams.values()].map((team) => mapTeam(team, tournamentId))
}

function mapTeam(team: ApiTeam | ApiMatchTeam, tournamentId: string): ReadonlyTeam {
  return {
    id: team.id,
    tournamentId,
    name: team.name,
    shortName: team.shortName ?? team.name,
    groupName: '未分组',
    coachName: '待补充',
    captainName: '待补充',
    colors: '待定',
    rosterPreview: ['名单将在报名后展示'],
  }
}

function mapRuleText(ruleVersion: ApiRuleVersion): string {
  const summary = ruleVersion.rules.summary
  return typeof summary === 'string' ? summary : ruleVersion.name
}

function getTournamentStatusText(status: ApiTournament['status']): string {
  switch (status) {
    case 'DRAFT':
      return '草稿'
    case 'PUBLISHED':
      return '已发布'
    case 'ARCHIVED':
      return '已归档'
  }
}

function formatDateRangePoint(value: string | undefined): string {
  if (!value) {
    return '待定'
  }

  return new Date(value).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  })
}

async function requestApi<T>(apiContext: ApiContext, path: string): Promise<T> {
  const response = await Taro.request<T>({
    url: `${apiContext.baseUrl}${path}`,
    method: 'GET',
    header: {
      'x-dev-organization-id': apiContext.organizationId,
    },
    timeout: 5000,
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiRequestError(response.statusCode, readErrorMessage(response.data, response.statusCode))
  }

  if (response.data === undefined || response.data === null) {
    throw new ApiRequestError(response.statusCode, 'API 返回为空')
  }

  return response.data
}

function readErrorMessage(data: unknown, statusCode: number): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }

  return `API 请求失败：HTTP ${statusCode}`
}

function getApiContext(): ApiContext | undefined {
  const maybeProcess = globalThis as {
    process?: { env?: { TARO_APP_API_BASE_URL?: string; TARO_APP_ORGANIZATION_ID?: string } }
  }
  const baseUrl = maybeProcess.process?.env?.TARO_APP_API_BASE_URL
  if (!baseUrl || baseUrl.trim().length === 0) {
    return undefined
  }

  return {
    baseUrl: normalizeApiBaseUrl(baseUrl),
    organizationId:
      maybeProcess.process?.env?.TARO_APP_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID,
  }
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}
