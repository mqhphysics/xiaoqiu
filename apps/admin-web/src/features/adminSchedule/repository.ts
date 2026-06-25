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

  constructor(readonly apiBaseUrl: string) {}

  async loadSnapshot(context: OrganizationContext): Promise<AdminScheduleSnapshot> {
    return this.request(context, `/admin/schedule-workbench?organizationId=${encodeURIComponent(context.organizationId)}`)
  }

  async createSeason(context: OrganizationContext, input: CreateSeasonInput): Promise<Season> {
    return this.request(context, '/seasons', { method: 'POST', body: input })
  }

  async createTournament(context: OrganizationContext, input: CreateTournamentInput): Promise<Tournament> {
    return this.request(context, '/tournaments', { method: 'POST', body: input })
  }

  async publishRuleVersion(context: OrganizationContext, input: PublishRuleVersionInput): Promise<RuleVersion> {
    return this.request(context, `/tournaments/${input.tournamentId}/rule-versions`, { method: 'POST', body: input })
  }

  async createTeam(context: OrganizationContext, input: CreateTeamInput): Promise<Team> {
    return this.request(context, '/teams', { method: 'POST', body: input })
  }

  async createVenue(context: OrganizationContext, input: CreateVenueInput): Promise<Venue> {
    return this.request(context, '/venues', { method: 'POST', body: input })
  }

  async createMatch(context: OrganizationContext, input: CreateMatchInput): Promise<Match> {
    return this.request(context, '/matches', { method: 'POST', body: input })
  }

  async createSchedulePlan(context: OrganizationContext, input: CreateSchedulePlanInput): Promise<SchedulePlan> {
    return this.request(context, '/schedule-plans', { method: 'POST', body: input })
  }

  async validateSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan> {
    return this.request(context, `/schedule-plans/${planId}/validate`, { method: 'POST', body: {} })
  }

  async publishSchedulePlan(
    context: OrganizationContext,
    planId: string,
    expectedVersion: number,
  ): Promise<SchedulePlan> {
    return this.request(context, `/schedule-plans/${planId}/publish`, {
      method: 'POST',
      body: { expectedVersion },
    })
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
        'x-organization-id': context.organizationId,
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
      status: 'ACTIVE',
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
      status: 'READY',
      version: plan.version + 1,
      validationMessage: '校验通过：未发现同一场地同时间冲突。',
      updatedAt: now(),
    }))
  }

  async publishSchedulePlan(context: OrganizationContext, planId: string, expectedVersion: number): Promise<SchedulePlan> {
    return this.updatePlan(context.organizationId, planId, (plan) => {
      if (plan.status !== 'READY') {
        throw new Error('赛程草案必须先校验通过才能发布。')
      }

      if (plan.version !== expectedVersion) {
        throw new Error(`赛程版本冲突：当前版本为 ${plan.version}，请刷新后再发布。`)
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
