import { Children, FormEvent, useEffect, useMemo, useState } from 'react'

import { createAdminScheduleRepository } from './repository'
import type {
  AdminScheduleSnapshot,
  CreateMatchInput,
  CreateSchedulePlanInput,
  CreateSeasonInput,
  CreateTeamInput,
  CreateTournamentInput,
  CreateVenueInput,
  OrganizationContext,
  PublishRuleVersionInput,
  SchedulePlan,
  WorkbenchSection,
} from './types'

const organizations: OrganizationContext[] = [
  {
    organizationId: 'xiaoqiu-dev',
    organizationName: '晓球开发组织',
    userId: 'dev-admin',
    role: 'TournamentAdmin',
  },
  {
    organizationId: 'campus-cup-demo',
    organizationName: '校园杯演示组织',
    userId: 'dev-admin',
    role: 'TournamentAdmin',
  },
]

const emptySnapshot: AdminScheduleSnapshot = {
  seasons: [],
  tournaments: [],
  ruleVersions: [],
  teams: [],
  venues: [],
  matches: [],
  schedulePlans: [],
}

export function AdminScheduleWorkspace() {
  const repository = useMemo(() => createAdminScheduleRepository(), [])
  const [activeSection, setActiveSection] = useState<WorkbenchSection>('events')
  const [context, setContext] = useState<OrganizationContext>(organizations[0]!)
  const [snapshot, setSnapshot] = useState<AdminScheduleSnapshot>(emptySnapshot)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const selectedTournamentId = snapshot.tournaments[0]?.id ?? ''

  const refresh = async (successMessage?: string) => {
    setIsLoading(true)
    setError('')
    try {
      const nextSnapshot = await repository.loadSnapshot(context)
      setSnapshot(nextSnapshot)
      if (successMessage) {
        setNotice(successMessage)
      }
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [context.organizationId])

  const runAction = async (actionName: string, action: () => Promise<unknown>, successMessage: string) => {
    setPendingAction(actionName)
    setError('')
    setNotice('')
    try {
      await action()
      await refresh(successMessage)
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setPendingAction(null)
    }
  }

  const isBusy = isLoading || pendingAction !== null

  return (
    <main className="admin-shell">
      <aside className="admin-nav" aria-label="管理模块">
        <div className="brand-block">
          <p className="eyebrow">XIAOQIU ADMIN</p>
          <h1>赛事管理工作台</h1>
        </div>
        <nav>
          <NavButton active={activeSection === 'events'} onClick={() => setActiveSection('events')}>
            赛事
          </NavButton>
          <NavButton active={activeSection === 'teams'} onClick={() => setActiveSection('teams')}>
            球队
          </NavButton>
          <NavButton active={activeSection === 'schedule'} onClick={() => setActiveSection('schedule')}>
            赛程
          </NavButton>
        </nav>
      </aside>

      <section className="admin-main">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">P1-SB-11-02</p>
            <h2>后台赛事创建纵向切片</h2>
            <p>完成创建赛季、赛事、球队、场地、比赛、草案校验和发布的首个后台工作流。</p>
          </div>
          <label className="field compact-field">
            <span>当前组织</span>
            <select
              value={context.organizationId}
              onChange={(event) => {
                const next = organizations.find((organization) => organization.organizationId === event.target.value)
                if (next) {
                  setContext(next)
                }
              }}
            >
              {organizations.map((organization) => (
                <option key={organization.organizationId} value={organization.organizationId}>
                  {organization.organizationName}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="dev-banner" aria-label="开发期请求上下文">
          <strong>{repository.mode === 'api' ? 'API 模式' : 'Mock 模式'}</strong>
          <span>
            请求头：`x-organization-id={context.organizationId}`、`x-dev-user-id={context.userId}`、`x-dev-role=
            {context.role}`
          </span>
          {repository.mode === 'mock' ? (
            <span>未设置 VITE_API_BASE_URL，当前数据保存于浏览器 localStorage，仅用于本切片验收。</span>
          ) : (
            <span>API Base URL：{repository.apiBaseUrl}</span>
          )}
        </section>

        {(notice || error) && (
          <section className="feedback-strip" aria-live="polite">
            {notice ? <p className="success-text">{notice}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </section>
        )}

        <section className="summary-grid" aria-label="当前数据概览">
          <Metric label="赛季" value={snapshot.seasons.length} />
          <Metric label="赛事" value={snapshot.tournaments.length} />
          <Metric label="球队" value={snapshot.teams.length} />
          <Metric label="场地" value={snapshot.venues.length} />
          <Metric label="比赛" value={snapshot.matches.length} />
          <Metric label="赛程草案" value={snapshot.schedulePlans.length} />
        </section>

        {activeSection === 'events' ? (
          <EventsSection
            snapshot={snapshot}
            isBusy={isBusy}
            pendingAction={pendingAction}
            onCreateSeason={(input) =>
              runAction('create-season', () => repository.createSeason(context, input), '赛季已创建。')
            }
            onCreateTournament={(input) =>
              runAction('create-tournament', () => repository.createTournament(context, input), '赛事已创建。')
            }
            onPublishRuleVersion={(input) =>
              runAction(
                'publish-rule',
                () => repository.publishRuleVersion(context, input),
                '规则版本已发布，发布后不可原地覆盖。',
              )
            }
          />
        ) : null}

        {activeSection === 'teams' ? (
          <TeamsSection
            snapshot={snapshot}
            isBusy={isBusy}
            pendingAction={pendingAction}
            onCreateTeam={(input) =>
              runAction('create-team', () => repository.createTeam(context, input), '球队已创建。')
            }
            onCreateVenue={(input) =>
              runAction('create-venue', () => repository.createVenue(context, input), '场地已创建。')
            }
            onRefresh={() => refresh('列表已刷新。')}
          />
        ) : null}

        {activeSection === 'schedule' ? (
          <ScheduleSection
            snapshot={snapshot}
            selectedTournamentId={selectedTournamentId}
            isBusy={isBusy}
            pendingAction={pendingAction}
            onCreateMatch={(input) =>
              runAction('create-match', () => repository.createMatch(context, input), '比赛已创建。')
            }
            onCreateSchedulePlan={(input) =>
              runAction('create-plan', () => repository.createSchedulePlan(context, input), '赛程草案已创建。')
            }
            onValidateSchedulePlan={(plan) =>
              runAction(
                `validate-plan-${plan.id}`,
                () => repository.validateSchedulePlan(context, plan.id),
                '赛程草案校验通过。',
              )
            }
            onPublishSchedulePlan={(plan) =>
              runAction(
                `publish-plan-${plan.id}`,
                () => repository.publishSchedulePlan(context, plan.id, plan.version),
                '赛程已发布，页面已更新发布版本和时间。',
              )
            }
          />
        ) : null}
      </section>
    </main>
  )
}

function EventsSection(props: {
  snapshot: AdminScheduleSnapshot
  isBusy: boolean
  pendingAction: string | null
  onCreateSeason: (input: CreateSeasonInput) => void
  onCreateTournament: (input: CreateTournamentInput) => void
  onPublishRuleVersion: (input: PublishRuleVersionInput) => void
}) {
  const currentYear = new Date().getFullYear()
  const [seasonInput, setSeasonInput] = useState<CreateSeasonInput>({
    code: `season-${currentYear}`,
    name: `${currentYear} 校园杯赛季`,
    year: currentYear,
  })
  const [tournamentInput, setTournamentInput] = useState<CreateTournamentInput>({
    seasonId: '',
    code: 'campus-cup',
    name: '校园足球杯',
  })
  const [ruleInput, setRuleInput] = useState<PublishRuleVersionInput>({
    tournamentId: '',
    version: 1,
    summary: '4 个小组单循环，每组前 2 名晋级 8 强。',
  })

  useEffect(() => {
    setTournamentInput((current) => ({ ...current, seasonId: current.seasonId || props.snapshot.seasons[0]?.id || '' }))
    setRuleInput((current) => ({ ...current, tournamentId: current.tournamentId || props.snapshot.tournaments[0]?.id || '' }))
  }, [props.snapshot.seasons, props.snapshot.tournaments])

  return (
    <div className="section-stack">
      <Panel title="创建赛季" description="赛季代码在组织内保持唯一，便于后续导入、查询和审计。">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            props.onCreateSeason(seasonInput)
          }}
        >
          <TextField label="赛季代码" value={seasonInput.code} onChange={(code) => setSeasonInput({ ...seasonInput, code })} />
          <TextField label="赛季名称" value={seasonInput.name} onChange={(name) => setSeasonInput({ ...seasonInput, name })} />
          <label className="field">
            <span>年份</span>
            <input
              required
              type="number"
              min="2020"
              max="2100"
              value={seasonInput.year}
              onChange={(event) => setSeasonInput({ ...seasonInput, year: Number(event.target.value) })}
            />
          </label>
          <SubmitButton busy={props.pendingAction === 'create-season'} disabled={props.isBusy}>
            创建赛季
          </SubmitButton>
        </form>
      </Panel>

      <Panel title="创建赛事" description="赛事挂在赛季下，后续球队、比赛和赛程都引用该赛事。">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            props.onCreateTournament(tournamentInput)
          }}
        >
          <SelectField
            label="所属赛季"
            value={tournamentInput.seasonId}
            options={props.snapshot.seasons.map((season) => ({ value: season.id, label: `${season.name}（${season.code}）` }))}
            onChange={(seasonId) => setTournamentInput({ ...tournamentInput, seasonId })}
          />
          <TextField
            label="赛事代码"
            value={tournamentInput.code}
            onChange={(code) => setTournamentInput({ ...tournamentInput, code })}
          />
          <TextField
            label="赛事名称"
            value={tournamentInput.name}
            onChange={(name) => setTournamentInput({ ...tournamentInput, name })}
          />
          <SubmitButton busy={props.pendingAction === 'create-tournament'} disabled={props.isBusy || !tournamentInput.seasonId}>
            创建赛事
          </SubmitButton>
        </form>
      </Panel>

      <Panel title="创建并发布规则版本" description="规则版本发布后不可修改，变更时创建新版本。">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            props.onPublishRuleVersion(ruleInput)
          }}
        >
          <SelectField
            label="所属赛事"
            value={ruleInput.tournamentId}
            options={props.snapshot.tournaments.map((tournament) => ({
              value: tournament.id,
              label: `${tournament.name}（${tournament.code}）`,
            }))}
            onChange={(tournamentId) => setRuleInput({ ...ruleInput, tournamentId })}
          />
          <label className="field">
            <span>版本号</span>
            <input
              required
              type="number"
              min="1"
              value={ruleInput.version}
              onChange={(event) => setRuleInput({ ...ruleInput, version: Number(event.target.value) })}
            />
          </label>
          <label className="field wide-field">
            <span>规则摘要</span>
            <textarea
              required
              rows={3}
              value={ruleInput.summary}
              onChange={(event) => setRuleInput({ ...ruleInput, summary: event.target.value })}
            />
          </label>
          <SubmitButton busy={props.pendingAction === 'publish-rule'} disabled={props.isBusy || !ruleInput.tournamentId}>
            发布规则版本
          </SubmitButton>
        </form>
      </Panel>

      <RecordList title="已发布规则" emptyText="暂无规则版本。">
        {props.snapshot.ruleVersions.map((ruleVersion) => (
          <li key={ruleVersion.id}>
            <strong>v{ruleVersion.version}</strong>
            <span>{ruleVersion.summary}</span>
            <small>{formatDateTime(ruleVersion.publishedAt)}</small>
          </li>
        ))}
      </RecordList>
    </div>
  )
}

function TeamsSection(props: {
  snapshot: AdminScheduleSnapshot
  isBusy: boolean
  pendingAction: string | null
  onCreateTeam: (input: CreateTeamInput) => void
  onCreateVenue: (input: CreateVenueInput) => void
  onRefresh: () => void
}) {
  const [teamInput, setTeamInput] = useState<CreateTeamInput>({
    code: 'team-a',
    name: '第一代表队',
    shortName: '一队',
    crestPlaceholder: '绿色盾牌',
  })
  const [venueInput, setVenueInput] = useState<CreateVenueInput>({
    code: 'main-pitch',
    name: '主足球场',
    campus: '石牌校区',
    location: '西区运动场',
  })

  return (
    <div className="section-stack">
      <div className="panel-toolbar">
        <button type="button" className="secondary-button" disabled={props.isBusy} onClick={props.onRefresh}>
          刷新列表
        </button>
      </div>

      <Panel title="创建球队" description="球队代码用于稳定引用，重复代码会返回可读错误。">
        <form className="form-grid" onSubmit={submitForm(() => props.onCreateTeam(teamInput))}>
          <TextField label="球队代码" value={teamInput.code} onChange={(code) => setTeamInput({ ...teamInput, code })} />
          <TextField label="球队名称" value={teamInput.name} onChange={(name) => setTeamInput({ ...teamInput, name })} />
          <TextField label="短名" value={teamInput.shortName} onChange={(shortName) => setTeamInput({ ...teamInput, shortName })} />
          <TextField
            label="队徽占位"
            value={teamInput.crestPlaceholder}
            onChange={(crestPlaceholder) => setTeamInput({ ...teamInput, crestPlaceholder })}
          />
          <SubmitButton busy={props.pendingAction === 'create-team'} disabled={props.isBusy}>
            创建球队
          </SubmitButton>
        </form>
      </Panel>

      <Panel title="创建场地" description="场地会被比赛引用，首期只录入校区和位置。">
        <form className="form-grid" onSubmit={submitForm(() => props.onCreateVenue(venueInput))}>
          <TextField label="场地代码" value={venueInput.code} onChange={(code) => setVenueInput({ ...venueInput, code })} />
          <TextField label="场地名称" value={venueInput.name} onChange={(name) => setVenueInput({ ...venueInput, name })} />
          <TextField label="校区" value={venueInput.campus} onChange={(campus) => setVenueInput({ ...venueInput, campus })} />
          <TextField label="位置" value={venueInput.location} onChange={(location) => setVenueInput({ ...venueInput, location })} />
          <SubmitButton busy={props.pendingAction === 'create-venue'} disabled={props.isBusy}>
            创建场地
          </SubmitButton>
        </form>
      </Panel>

      <div className="two-column">
        <RecordList title="球队列表" emptyText="暂无球队。">
          {props.snapshot.teams.map((team) => (
            <li key={team.id}>
              <strong>{team.name}</strong>
              <span>{team.shortName} / {team.code}</span>
              <small>队徽占位：{team.crestPlaceholder}</small>
            </li>
          ))}
        </RecordList>
        <RecordList title="场地列表" emptyText="暂无场地。">
          {props.snapshot.venues.map((venue) => (
            <li key={venue.id}>
              <strong>{venue.name}</strong>
              <span>{venue.code}</span>
              <small>{venue.campus} / {venue.location}</small>
            </li>
          ))}
        </RecordList>
      </div>
    </div>
  )
}

function ScheduleSection(props: {
  snapshot: AdminScheduleSnapshot
  selectedTournamentId: string
  isBusy: boolean
  pendingAction: string | null
  onCreateMatch: (input: CreateMatchInput) => void
  onCreateSchedulePlan: (input: CreateSchedulePlanInput) => void
  onValidateSchedulePlan: (plan: SchedulePlan) => void
  onPublishSchedulePlan: (plan: SchedulePlan) => void
}) {
  const [matchInput, setMatchInput] = useState<CreateMatchInput>({
    tournamentId: '',
    homeTeamId: '',
    awayTeamId: '',
    venueId: '',
    scheduledStartAt: defaultDateTimeLocal(),
  })
  const [planInput, setPlanInput] = useState<CreateSchedulePlanInput>({
    tournamentId: '',
    name: '小组赛第一轮赛程',
    matchIds: [],
  })

  useEffect(() => {
    setMatchInput((current) => ({
      ...current,
      tournamentId: current.tournamentId || props.selectedTournamentId,
      homeTeamId: current.homeTeamId || props.snapshot.teams[0]?.id || '',
      awayTeamId: current.awayTeamId || props.snapshot.teams[1]?.id || '',
      venueId: current.venueId || props.snapshot.venues[0]?.id || '',
    }))
    setPlanInput((current) => ({ ...current, tournamentId: current.tournamentId || props.selectedTournamentId }))
  }, [props.selectedTournamentId, props.snapshot.teams, props.snapshot.venues])

  const matchesForTournament = props.snapshot.matches.filter((match) => match.tournamentId === planInput.tournamentId)

  return (
    <div className="section-stack">
      <Panel title="创建比赛" description="首期只创建比赛骨架：双方球队、时间和场地。">
        <form className="form-grid" onSubmit={submitForm(() => props.onCreateMatch(matchInput))}>
          <SelectField
            label="所属赛事"
            value={matchInput.tournamentId}
            options={props.snapshot.tournaments.map((tournament) => ({
              value: tournament.id,
              label: `${tournament.name}（${tournament.code}）`,
            }))}
            onChange={(tournamentId) => setMatchInput({ ...matchInput, tournamentId })}
          />
          <SelectField
            label="主队"
            value={matchInput.homeTeamId}
            options={props.snapshot.teams.map((team) => ({ value: team.id, label: `${team.name}（${team.code}）` }))}
            onChange={(homeTeamId) => setMatchInput({ ...matchInput, homeTeamId })}
          />
          <SelectField
            label="客队"
            value={matchInput.awayTeamId}
            options={props.snapshot.teams.map((team) => ({ value: team.id, label: `${team.name}（${team.code}）` }))}
            onChange={(awayTeamId) => setMatchInput({ ...matchInput, awayTeamId })}
          />
          <SelectField
            label="场地"
            value={matchInput.venueId}
            options={props.snapshot.venues.map((venue) => ({ value: venue.id, label: `${venue.name}（${venue.code}）` }))}
            onChange={(venueId) => setMatchInput({ ...matchInput, venueId })}
          />
          <label className="field">
            <span>开球时间</span>
            <input
              required
              type="datetime-local"
              value={matchInput.scheduledStartAt}
              onChange={(event) => setMatchInput({ ...matchInput, scheduledStartAt: event.target.value })}
            />
          </label>
          <SubmitButton
            busy={props.pendingAction === 'create-match'}
            disabled={
              props.isBusy ||
              !matchInput.tournamentId ||
              !matchInput.homeTeamId ||
              !matchInput.awayTeamId ||
              !matchInput.venueId
            }
          >
            创建比赛
          </SubmitButton>
        </form>
      </Panel>

      <Panel title="创建赛程草案" description="草案先校验，校验通过后使用 expectedVersion 发布。">
        <form className="form-grid" onSubmit={submitForm(() => props.onCreateSchedulePlan(planInput))}>
          <SelectField
            label="所属赛事"
            value={planInput.tournamentId}
            options={props.snapshot.tournaments.map((tournament) => ({
              value: tournament.id,
              label: `${tournament.name}（${tournament.code}）`,
            }))}
            onChange={(tournamentId) => setPlanInput({ ...planInput, tournamentId, matchIds: [] })}
          />
          <TextField label="草案名称" value={planInput.name} onChange={(name) => setPlanInput({ ...planInput, name })} />
          <fieldset className="field checkbox-field wide-field">
            <legend>包含比赛</legend>
            {matchesForTournament.length === 0 ? <p>请先创建至少一场比赛。</p> : null}
            {matchesForTournament.map((match) => (
              <label key={match.id}>
                <input
                  type="checkbox"
                  checked={planInput.matchIds.includes(match.id)}
                  onChange={(event) => {
                    setPlanInput({
                      ...planInput,
                      matchIds: event.target.checked
                        ? [...planInput.matchIds, match.id]
                        : planInput.matchIds.filter((matchId) => matchId !== match.id),
                    })
                  }}
                />
                {describeMatch(match, props.snapshot)}
              </label>
            ))}
          </fieldset>
          <SubmitButton busy={props.pendingAction === 'create-plan'} disabled={props.isBusy || planInput.matchIds.length === 0}>
            创建草案
          </SubmitButton>
        </form>
      </Panel>

      <RecordList title="赛程草案与发布版本" emptyText="暂无赛程草案。">
        {props.snapshot.schedulePlans.map((plan) => (
          <li key={plan.id} className="plan-item">
            <strong>{plan.name}</strong>
            <span>
              状态：{plan.status} / 当前版本：{plan.version}
              {plan.publishedVersion ? ` / 发布版本：${plan.publishedVersion}` : ''}
            </span>
            <small>{plan.validationMessage}</small>
            <small>
              更新时间：{formatDateTime(plan.updatedAt)}
              {plan.publishedAt ? ` / 发布时间：${formatDateTime(plan.publishedAt)}` : ''}
            </small>
            <div className="row-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={props.isBusy || plan.status === 'PUBLISHED'}
                onClick={() => props.onValidateSchedulePlan(plan)}
              >
                {props.pendingAction === `validate-plan-${plan.id}` ? '校验中...' : '校验草案'}
              </button>
              <button
                type="button"
                disabled={props.isBusy || plan.status !== 'READY'}
                onClick={() => props.onPublishSchedulePlan(plan)}
              >
                {props.pendingAction === `publish-plan-${plan.id}` ? '发布中...' : '发布赛程'}
              </button>
            </div>
          </li>
        ))}
      </RecordList>
    </div>
  )
}

function NavButton(props: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button type="button" className={props.active ? 'nav-link active' : 'nav-link'} onClick={props.onClick}>
      {props.children}
    </button>
  )
}

function Panel(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      {props.children}
    </section>
  )
}

function Metric(props: { label: string; value: number }) {
  return (
    <article className="metric-card">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </article>
  )
}

function TextField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input required value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  )
}

function SelectField(props: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select required value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">请选择</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function SubmitButton(props: { busy: boolean; disabled: boolean; children: string }) {
  return (
    <button type="submit" disabled={props.disabled}>
      {props.busy ? '提交中...' : props.children}
    </button>
  )
}

function RecordList(props: { title: string; emptyText: string; children: React.ReactNode }) {
  return (
    <section className="record-list">
      <h3>{props.title}</h3>
      <ul>{Children.count(props.children) > 0 ? props.children : <li className="empty-list">{props.emptyText}</li>}</ul>
    </section>
  )
}

function submitForm(handler: () => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handler()
  }
}

function toMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : '操作失败，请稍后重试。'
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function defaultDateTimeLocal(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setMinutes(0, 0, 0)
  return date.toISOString().slice(0, 16)
}

function describeMatch(match: { homeTeamId: string; awayTeamId: string; venueId: string; scheduledStartAt: string }, snapshot: AdminScheduleSnapshot): string {
  const home = snapshot.teams.find((team) => team.id === match.homeTeamId)?.shortName ?? '主队'
  const away = snapshot.teams.find((team) => team.id === match.awayTeamId)?.shortName ?? '客队'
  const venue = snapshot.venues.find((item) => item.id === match.venueId)?.name ?? '未定场地'
  return `${home} vs ${away} / ${venue} / ${formatDateTime(match.scheduledStartAt)}`
}
