import type {
  AdminScheduleRepository,
  AdminScheduleSnapshot,
  CreateMatchInput,
  CreateSchedulePlanInput,
  CreateSeasonInput,
  CreateTeamInput,
  CreateTournamentInput,
  CreateVenueInput,
  Match,
  OrganizationContext,
  PublishRuleVersionInput,
  RuleVersion,
  SchedulePlan,
  Season,
  Team,
  Tournament,
  Venue,
} from './types'

const emptySnapshot = (): AdminScheduleSnapshot => ({
  seasons: [],
  tournaments: [],
  ruleVersions: [],
  teams: [],
  venues: [],
  matches: [],
  schedulePlans: [],
})

export function createAdminScheduleRepository(): AdminScheduleRepository {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (apiBaseUrl) {
    return new HttpAdminScheduleRepository(apiBaseUrl)
  }

  return new MockAdminScheduleRepository()
}

class HttpAdminScheduleRepository implements AdminScheduleRepository {
  readonly mode = 'api' as const

  readonly apiBaseUrl: string

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  }

  async loadSnapshot(context: OrganizationContext): Promise<AdminScheduleSnapshot> {
    const snapshot = await this.request<ApiAdminScheduleSnapshot>(context, '/admin/schedule-workbench')
    return mapSnapshot(snapshot)
  }

  async createSeason(context: OrganizationContext, input: CreateSeasonInput): Promise<Season> {
    const season = await this.request<ApiSeason>(context, '/admin/seasons', {
      method: 'POST',
      body: {
        seasonCode: input.code,
        name: input.name,
        startsOn: `${input.year}-09-01`,
      },
    })
    return mapSeason(season)
  }

  async createTournament(context: OrganizationContext, input: CreateTournamentInput): Promise<Tournament> {
    const tournament = await this.request<ApiTournament>(context, '/admin/tournaments', {
      method: 'POST',
      body: {
        seasonId: input.seasonId,
        tournamentCode: input.code,
        name: input.name,
      },
    })
    return mapTournament(tournament)
  }

  async publishRuleVersion(context: OrganizationContext, input: PublishRuleVersionInput): Promise<RuleVersion> {
    const ruleVersion = await this.request<ApiRuleVersion>(
      context,
      `/admin/tournaments/${input.tournamentId}/rule-versions`,
      {
        method: 'POST',
        body: {
          version: input.version,
          name: `规则 v${input.version}`,
          rules: { summary: input.summary },
        },
      },
    )
    return mapRuleVersion(ruleVersion)
  }

  async createTeam(context: OrganizationContext, input: CreateTeamInput): Promise<Team> {
    const team = await this.request<ApiTeam>(context, `/admin/tournaments/${input.tournamentId}/teams`, {
      method: 'POST',
      body: {
        teamCode: input.code,
        name: input.name,
        shortName: input.shortName,
      },
    })
    return mapTeam(team)
  }

  async createVenue(context: OrganizationContext, input: CreateVenueInput): Promise<Venue> {
    const venue = await this.request<ApiVenue>(context, '/admin/venues', {
      method: 'POST',
      body: {
        venueCode: input.code,
        name: input.name,
        address: [input.campus, input.location].filter(Boolean).join(' / '),
      },
    })
    return mapVenue(venue)
  }

  async createMatch(context: OrganizationContext, input: CreateMatchInput): Promise<Match> {
    const match = await this.request<ApiMatch>(context, `/admin/tournaments/${input.tournamentId}/matches`, {
      method: 'POST',
      body: {
        matchCode: `match-${Date.now().toString(36)}`,
        title: '赛程比赛',
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        venueId: input.venueId,
        scheduledStartAt: new Date(input.scheduledStartAt).toISOString(),
      },
    })
    return mapMatch(match)
  }

  async createSchedulePlan(context: OrganizationContext, input: CreateSchedulePlanInput): Promise<SchedulePlan> {
    const plan = await this.request<ApiSchedulePlan>(context, '/admin/schedule-plans', {
      method: 'POST',
      body: input,
    })
    return mapSchedulePlan(plan)
  }

  async validateSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan> {
    const plan = await this.request<ApiSchedulePlan>(context, `/admin/schedule-plans/${planId}/validate`, {
      method: 'POST',
    })
    return {
      ...mapSchedulePlan(plan),
      validationMessage: '校验通过：后端已确认草案包含可发布比赛。',
    }
  }

  async publishSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan> {
    const revision = await this.request<ApiScheduleRevision>(context, `/admin/schedule-plans/${planId}/publish`, {
      method: 'POST',
    })
    return {
      id: planId,
      tournamentId: revision.tournamentId,
      name: '已发布赛程',
      matchIds: [],
      status: 'PUBLISHED',
      version: revision.version,
      validationMessage: '已发布，后续变更必须创建替代版本。',
      publishedVersion: revision.version,
      publishedAt: revision.publishedAt,
      updatedAt: revision.publishedAt,
    }
  }

  private async request<T>(
    context: OrganizationContext,
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<T> {
    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        'x-dev-organization-id': context.organizationId,
        'x-dev-user-id': context.userId,
        'x-dev-role': context.role,
        'x-request-source': 'admin-web-p1-schedule-slice',
      },
    }

    if (options.body !== undefined) {
      requestInit.body = JSON.stringify(options.body)
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, requestInit)

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    return response.json() as Promise<T>
  }
}

interface ApiSeason {
  id: string
  seasonCode: string
  name: string
  startsOn?: string | null
}

interface ApiTournament {
  id: string
  seasonId: string
  tournamentCode: string
  name: string
  status: Tournament['status']
}

interface ApiRuleVersion {
  id: string
  tournamentId: string
  version: number
  name: string
  rules: Record<string, unknown>
  status: RuleVersion['status']
  publishedAt: string
}

interface ApiTeam {
  id: string
  teamCode: string
  name: string
  shortName?: string | null
}

interface ApiVenue {
  id: string
  venueCode: string
  name: string
  address?: string | null
}

interface ApiMatch {
  id: string
  tournamentId: string
  status: Match['status']
  scheduledStartAt?: string | null
  homeTeam?: { id: string } | null
  awayTeam?: { id: string } | null
  venue?: { id: string } | null
}

interface ApiSchedulePlan {
  id: string
  tournamentId: string
  name: string
  status: SchedulePlan['status']
  publishedAt?: string | null
  matchIds?: string[]
}

interface ApiScheduleRevision {
  tournamentId: string
  version: number
  publishedAt: string
}

interface ApiAdminScheduleSnapshot {
  seasons: ApiSeason[]
  tournaments: ApiTournament[]
  ruleVersions: ApiRuleVersion[]
  teams: ApiTeam[]
  venues: ApiVenue[]
  matches: ApiMatch[]
  schedulePlans: ApiSchedulePlan[]
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

function mapSnapshot(snapshot: ApiAdminScheduleSnapshot): AdminScheduleSnapshot {
  return {
    seasons: snapshot.seasons.map(mapSeason),
    tournaments: snapshot.tournaments.map(mapTournament),
    ruleVersions: snapshot.ruleVersions.map(mapRuleVersion),
    teams: snapshot.teams.map(mapTeam),
    venues: snapshot.venues.map(mapVenue),
    matches: snapshot.matches.map(mapMatch),
    schedulePlans: snapshot.schedulePlans.map(mapSchedulePlan),
  }
}

function mapSeason(season: ApiSeason): Season {
  return {
    id: season.id,
    code: season.seasonCode,
    name: season.name,
    year: extractYear(season.startsOn ?? season.seasonCode),
    createdAt: toDisplayDate(season.startsOn),
  }
}

function mapTournament(tournament: ApiTournament): Tournament {
  return {
    id: tournament.id,
    seasonId: tournament.seasonId,
    code: tournament.tournamentCode,
    name: tournament.name,
    status: tournament.status,
    createdAt: new Date(0).toISOString(),
  }
}

function mapRuleVersion(ruleVersion: ApiRuleVersion): RuleVersion {
  const summary = typeof ruleVersion.rules.summary === 'string' ? ruleVersion.rules.summary : ruleVersion.name
  return {
    id: ruleVersion.id,
    tournamentId: ruleVersion.tournamentId,
    version: ruleVersion.version,
    summary,
    status: ruleVersion.status,
    publishedAt: ruleVersion.publishedAt,
  }
}

function mapTeam(team: ApiTeam): Team {
  return {
    id: team.id,
    code: team.teamCode,
    name: team.name,
    shortName: team.shortName ?? '',
    crestPlaceholder: '默认队徽',
    createdAt: new Date(0).toISOString(),
  }
}

function mapVenue(venue: ApiVenue): Venue {
  const [campus = '', ...locationParts] = (venue.address ?? '').split(' / ')
  return {
    id: venue.id,
    code: venue.venueCode,
    name: venue.name,
    campus,
    location: locationParts.join(' / '),
    createdAt: new Date(0).toISOString(),
  }
}

function mapMatch(match: ApiMatch): Match {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    homeTeamId: match.homeTeam?.id ?? '',
    awayTeamId: match.awayTeam?.id ?? '',
    venueId: match.venue?.id ?? '',
    scheduledStartAt: match.scheduledStartAt ?? new Date(0).toISOString(),
    status: match.status,
    createdAt: new Date(0).toISOString(),
  }
}

function mapSchedulePlan(plan: ApiSchedulePlan): SchedulePlan {
  return {
    id: plan.id,
    tournamentId: plan.tournamentId,
    name: plan.name,
    matchIds: plan.matchIds ?? [],
    status: plan.status,
    version: plan.status === 'PUBLISHED' ? 2 : 1,
    validationMessage:
      plan.status === 'PUBLISHED'
        ? '已发布，后续变更必须创建替代版本。'
        : '可先校验草案；发布时后端会再次检查可发布条件。',
    publishedVersion: plan.status === 'PUBLISHED' ? 1 : null,
    publishedAt: plan.publishedAt ?? null,
    updatedAt: plan.publishedAt ?? new Date().toISOString(),
  }
}

function extractYear(value: string): number {
  const match = value.match(/\d{4}/)
  return match === null ? new Date().getFullYear() : Number(match[0])
}

function toDisplayDate(value: string | null | undefined): string {
  return value === null || value === undefined ? new Date(0).toISOString() : new Date(value).toISOString()
}

class MockAdminScheduleRepository implements AdminScheduleRepository {
  readonly mode = 'mock' as const
  readonly apiBaseUrl = null

  async loadSnapshot(context: OrganizationContext): Promise<AdminScheduleSnapshot> {
    return this.read(context.organizationId)
  }

  async createSeason(context: OrganizationContext, input: CreateSeasonInput): Promise<Season> {
    const snapshot = this.read(context.organizationId)
    assertUnique(snapshot.seasons, input.code, '赛季代码已存在，请换一个稳定代码。')

    const season: Season = {
      id: createId('season'),
      code: input.code.trim(),
      name: input.name.trim(),
      year: input.year,
      createdAt: now(),
    }
    snapshot.seasons = [season, ...snapshot.seasons]
    this.write(context.organizationId, snapshot)
    return season
  }

  async createTournament(context: OrganizationContext, input: CreateTournamentInput): Promise<Tournament> {
    const snapshot = this.read(context.organizationId)
    assertExists(snapshot.seasons, input.seasonId, '请先选择已创建的赛季。')
    assertUnique(snapshot.tournaments, input.code, '赛事代码已存在，请换一个稳定代码。')

    const tournament: Tournament = {
      id: createId('tournament'),
      seasonId: input.seasonId,
      code: input.code.trim(),
      name: input.name.trim(),
      status: 'DRAFT',
      createdAt: now(),
    }
    snapshot.tournaments = [tournament, ...snapshot.tournaments]
    this.write(context.organizationId, snapshot)
    return tournament
  }

  async publishRuleVersion(context: OrganizationContext, input: PublishRuleVersionInput): Promise<RuleVersion> {
    const snapshot = this.read(context.organizationId)
    assertExists(snapshot.tournaments, input.tournamentId, '请先选择已创建的赛事。')

    const duplicated = snapshot.ruleVersions.some(
      (ruleVersion) => ruleVersion.tournamentId === input.tournamentId && ruleVersion.version === input.version,
    )
    if (duplicated) {
      throw new Error('该赛事的规则版本号已发布，已发布规则不可原地覆盖。')
    }

    const ruleVersion: RuleVersion = {
      id: createId('rule'),
      tournamentId: input.tournamentId,
      version: input.version,
      summary: input.summary.trim(),
      status: 'PUBLISHED',
      publishedAt: now(),
    }
    snapshot.ruleVersions = [ruleVersion, ...snapshot.ruleVersions]
    this.write(context.organizationId, snapshot)
    return ruleVersion
  }

  async createTeam(context: OrganizationContext, input: CreateTeamInput): Promise<Team> {
    const snapshot = this.read(context.organizationId)
    assertExists(snapshot.tournaments, input.tournamentId, '请先选择已创建的赛事。')
    assertUnique(snapshot.teams, input.code, '球队代码已存在，请使用唯一球队代码。')

    const team: Team = {
      id: createId('team'),
      code: input.code.trim(),
      name: input.name.trim(),
      shortName: input.shortName.trim(),
      crestPlaceholder: input.crestPlaceholder.trim(),
      createdAt: now(),
    }
    snapshot.teams = [team, ...snapshot.teams]
    this.write(context.organizationId, snapshot)
    return team
  }

  async createVenue(context: OrganizationContext, input: CreateVenueInput): Promise<Venue> {
    const snapshot = this.read(context.organizationId)
    assertUnique(snapshot.venues, input.code, '场地代码已存在，请使用唯一场地代码。')

    const venue: Venue = {
      id: createId('venue'),
      code: input.code.trim(),
      name: input.name.trim(),
      campus: input.campus.trim(),
      location: input.location.trim(),
      createdAt: now(),
    }
    snapshot.venues = [venue, ...snapshot.venues]
    this.write(context.organizationId, snapshot)
    return venue
  }

  async createMatch(context: OrganizationContext, input: CreateMatchInput): Promise<Match> {
    const snapshot = this.read(context.organizationId)
    assertExists(snapshot.tournaments, input.tournamentId, '请先选择赛事。')
    assertExists(snapshot.teams, input.homeTeamId, '主队不存在，请刷新后重试。')
    assertExists(snapshot.teams, input.awayTeamId, '客队不存在，请刷新后重试。')
    assertExists(snapshot.venues, input.venueId, '场地不存在，请刷新后重试。')

    if (input.homeTeamId === input.awayTeamId) {
      throw new Error('主队和客队不能相同。')
    }

    const match: Match = {
      id: createId('match'),
      tournamentId: input.tournamentId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      venueId: input.venueId,
      scheduledStartAt: new Date(input.scheduledStartAt).toISOString(),
      status: 'SCHEDULED',
      createdAt: now(),
    }
    snapshot.matches = [match, ...snapshot.matches]
    this.write(context.organizationId, snapshot)
    return match
  }

  async createSchedulePlan(context: OrganizationContext, input: CreateSchedulePlanInput): Promise<SchedulePlan> {
    const snapshot = this.read(context.organizationId)
    assertExists(snapshot.tournaments, input.tournamentId, '请先选择赛事。')

    if (input.matchIds.length === 0) {
      throw new Error('赛程草案至少需要包含一场比赛。')
    }

    const existingMatchIds = new Set(snapshot.matches.map((match) => match.id))
    const hasUnknownMatch = input.matchIds.some((matchId) => !existingMatchIds.has(matchId))
    if (hasUnknownMatch) {
      throw new Error('赛程草案包含不存在的比赛，请刷新后重试。')
    }

    const plan: SchedulePlan = {
      id: createId('plan'),
      tournamentId: input.tournamentId,
      name: input.name.trim(),
      matchIds: input.matchIds,
      status: 'DRAFT',
      version: 1,
      validationMessage: '尚未校验',
      publishedVersion: null,
      publishedAt: null,
      updatedAt: now(),
    }
    snapshot.schedulePlans = [plan, ...snapshot.schedulePlans]
    this.write(context.organizationId, snapshot)
    return plan
  }

  async validateSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan> {
    return this.updatePlan(context.organizationId, planId, (plan) => ({
      ...plan,
      version: plan.version + 1,
      validationMessage: '校验通过：未发现同一场地同时间冲突。',
      updatedAt: now(),
    }))
  }

  async publishSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan> {
    return this.updatePlan(context.organizationId, planId, (plan) => {
      if (plan.status !== 'DRAFT') {
        throw new Error('只有草案状态的赛程可以发布。')
      }

      const nextVersion = plan.version + 1
      return {
        ...plan,
        status: 'PUBLISHED',
        version: nextVersion,
        validationMessage: '已发布，后续变更必须创建替代版本。',
        publishedVersion: nextVersion,
        publishedAt: now(),
        updatedAt: now(),
      }
    })
  }

  private updatePlan(
    organizationId: string,
    planId: string,
    update: (plan: SchedulePlan) => SchedulePlan,
  ): SchedulePlan {
    const snapshot = this.read(organizationId)
    const index = snapshot.schedulePlans.findIndex((plan) => plan.id === planId)
    if (index < 0) {
      throw new Error('赛程草案不存在，请刷新后重试。')
    }

    const current = snapshot.schedulePlans[index]
    if (!current) {
      throw new Error('赛程草案不存在，请刷新后重试。')
    }

    const next = update(current)
    snapshot.schedulePlans = snapshot.schedulePlans.map((plan) => (plan.id === planId ? next : plan))
    this.write(organizationId, snapshot)
    return next
  }

  private read(organizationId: string): AdminScheduleSnapshot {
    const saved = window.localStorage.getItem(storageKey(organizationId))
    if (!saved) {
      return emptySnapshot()
    }

    try {
      return JSON.parse(saved) as AdminScheduleSnapshot
    } catch {
      return emptySnapshot()
    }
  }

  private write(organizationId: string, snapshot: AdminScheduleSnapshot): void {
    window.localStorage.setItem(storageKey(organizationId), JSON.stringify(snapshot))
  }
}

async function readApiError(response: Response): Promise<string> {
  const fallback = `请求失败：HTTP ${response.status}`

  try {
    const body = (await response.json()) as { message?: unknown; code?: unknown; requestId?: unknown }
    const message = typeof body.message === 'string' ? body.message : fallback
    const code = typeof body.code === 'string' ? `（${body.code}）` : ''
    const requestId = typeof body.requestId === 'string' ? ` requestId=${body.requestId}` : ''
    return `${message}${code}${requestId}`
  } catch {
    return fallback
  }
}

function assertExists(items: Array<{ id: string }>, id: string, message: string): void {
  if (!items.some((item) => item.id === id)) {
    throw new Error(message)
  }
}

function assertUnique(items: Array<{ code: string }>, code: string, message: string): void {
  const normalized = code.trim().toLocaleLowerCase()
  if (items.some((item) => item.code.trim().toLocaleLowerCase() === normalized)) {
    throw new Error(message)
  }
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function now(): string {
  return new Date().toISOString()
}

function storageKey(organizationId: string): string {
  return `xiaoqiu:admin-schedule-slice:${organizationId}`
}
