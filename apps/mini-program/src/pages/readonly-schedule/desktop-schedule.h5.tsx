import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, TeamCrest } from '../../components/product-ui'
import {
  createBracketLayout,
  isFinishedMatch,
  matchDetailUrl,
} from '../../features/competition/competition.logic'
import { formatDate, formatTime, matchStatusLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type {
  CompetitionDataResponse,
  MatchSummary,
  TeamSummary,
} from '../../features/product/product.types'
import CompactSchedulePage from './schedule-compact'

import './index.h5.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionDataResponse }
type PrimaryTeamState =
  | { phase: 'loading' }
  | { phase: 'failed' }
  | { phase: 'ready'; team: TeamSummary | null }
type IconName =
  | 'calendar'
  | 'left'
  | 'right'
  | 'arrow'
  | 'pin'
  | 'list'
  | 'bracket'
  | 'cup'
  | 'check'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    calendar: 'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
    left: 'm15 5-7 7 7 7',
    right: 'm9 5 7 7-7 7',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    list: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
    bracket: 'M3 3h6v6H3ZM3 15h6v6H3Zm6-9h5v12H9m5-6h7m0-3v6',
    cup: 'M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5m-4 2v6m-4 1h8',
    check: 'm5 12 4 4L19 6',
  }
  return (
    <svg
      className="schedule-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

function dateKey(value: string | null): string {
  if (!value) return 'TBD'
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return dateKey(date.toISOString())
}

function openMatch(matchId: string) {
  void Taro.navigateTo({ url: matchDetailUrl(matchId) })
}
function openTeam(teamId: string, tournamentId: string) {
  void Taro.navigateTo({
    url: `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}&tournamentId=${encodeURIComponent(tournamentId)}`,
  })
}

export default function SchedulePage() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return desktop ? <DesktopSchedulePage /> : <CompactSchedulePage />
}

function DesktopSchedulePage() {
  const routeTournamentId = getCurrentInstance().router?.params.tournamentId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const id = routeTournamentId || (await productRepository.getHome()).tournament.id
      setState({ phase: 'ready', data: await productRepository.getCompetitionData(id) })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '赛程加载失败。',
      })
    }
  }, [routeTournamentId])
  useEffect(() => {
    void load()
  }, [load])
  return (
    <PublicShell
      active="schedule"
      tournamentId={state.phase === 'ready' ? state.data.tournament.id : routeTournamentId}
    >
      <div className="schedule-desktop">
        <div className="schedule-art" aria-hidden="true">
          <div className="schedule-art__light" />
          <div className="schedule-art__stadium" />
          <div className="schedule-art__pitch" />
          <div className="schedule-art__goal" />
          <span className="schedule-art__note">
            校园足球
            <br />
            更好的我们
          </span>
        </div>
        {state.phase === 'loading' && <DataState kind="loading" title="正在读取完整赛程" />}
        {state.phase === 'failed' && (
          <div className="schedule-load-error">
            <DataState
              kind="error"
              title="赛程不可用"
              description={state.message}
              onRetry={() => void load()}
            />
            {routeTournamentId && (
              <button
                data-schedule-button=""
                type="button"
                className="schedule-outline"
                onClick={() => void Taro.redirectTo({ url: '/pages/readonly-schedule/index' })}
              >
                返回当前赛事
              </button>
            )}
          </div>
        )}
        {state.phase === 'ready' && (
          <ScheduleContent key={state.data.tournament.id} data={state.data} />
        )}
      </div>
    </PublicShell>
  )
}

function ScheduleContent({ data }: { data: CompetitionDataResponse }) {
  const [teamId, setTeamId] = useState('')
  const [stage, setStage] = useState('')
  const [status, setStatus] = useState('')
  const [onlyPrimary, setOnlyPrimary] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [descending, setDescending] = useState(false)
  const [view, setView] = useState<'list' | 'bracket'>('list')
  const [primary, setPrimary] = useState<PrimaryTeamState>({ phase: 'loading' })
  const session = readSession()
  const accessToken = session?.accessToken
  const primaryTeam = primary.phase === 'ready' ? primary.team : null
  const initialDate = dateKey(
    data.schedule.find(
      (match) => ['LIVE', 'CHECK_IN', 'SCHEDULED'].includes(match.status) && match.scheduledStartAt,
    )?.scheduledStartAt ??
      data.schedule.find((match) => match.scheduledStartAt)?.scheduledStartAt ??
      new Date().toISOString(),
  )
  const [weekStart, setWeekStart] = useState(() => shiftDate(initialDate, -2))

  const loadPrimary = useCallback(async () => {
    if (!accessToken) {
      setPrimary({ phase: 'ready', team: null })
      return
    }
    setPrimary({ phase: 'loading' })
    try {
      setPrimary({
        phase: 'ready',
        team: (await productRepository.getTeamPreferences()).primaryTeam,
      })
    } catch {
      setPrimary({ phase: 'failed' })
    }
  }, [accessToken])
  useEffect(() => {
    void loadPrimary()
  }, [loadPrimary])

  const teams = useMemo(() => {
    const map = new Map<string, TeamSummary>()
    for (const match of data.schedule) {
      if (match.homeTeam) map.set(match.homeTeam.id, match.homeTeam)
      if (match.awayTeam) map.set(match.awayTeam.id, match.awayTeam)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [data.schedule])
  const stages = [
    ...new Set(
      data.schedule.map((match) => match.stageName).filter((name): name is string => Boolean(name)),
    ),
  ]
  const statuses = [...new Set(data.schedule.map((match) => match.status))]
  const matches = useMemo(
    () =>
      data.schedule
        .filter((match) => {
          const contains = (id: string) => match.homeTeam?.id === id || match.awayTeam?.id === id
          return (
            (!teamId || contains(teamId)) &&
            (!onlyPrimary || Boolean(primaryTeam && contains(primaryTeam.id))) &&
            (!stage || match.stageName === stage) &&
            (!status || match.status === status) &&
            (!selectedDate || dateKey(match.scheduledStartAt) === selectedDate)
          )
        })
        .sort((a, b) => {
          if (!a.scheduledStartAt) return b.scheduledStartAt ? 1 : a.id.localeCompare(b.id)
          if (!b.scheduledStartAt) return -1
          const difference = Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt)
          return (descending ? -difference : difference) || a.id.localeCompare(b.id)
        }),
    [data.schedule, teamId, onlyPrimary, primaryTeam, stage, status, selectedDate, descending],
  )
  const groups = new Map<string, MatchSummary[]>()
  for (const match of matches) {
    const key = dateKey(match.scheduledStartAt)
    const group = groups.get(key)
    if (group) group.push(match)
    else groups.set(key, [match])
  }
  const clearFilters = () => {
    setTeamId('')
    setStage('')
    setStatus('')
    setOnlyPrimary(false)
    setSelectedDate(null)
  }
  const isDemo = data.tournament.name.includes('演示')
  const showBracket = () => setView('bracket')
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index))

  return (
    <>
      <header className="schedule-hero">
        <h1>赛程</h1>
        <div className="schedule-hero__copy">
          <div>
            <h2>{data.tournament.name.replace(/\s*·\s*演示赛季$/, '')}</h2>
            {isDemo && <span className="schedule-demo">演示赛季</span>}
          </div>
          <p>
            {isDemo
              ? '演示数据 · 以下为示例内容，仅用于产品功能展示'
              : `${data.tournament.seasonName} · 关注每一场校园比赛`}
          </p>
        </div>
        <div className="schedule-hero__actions">
          <select
            data-schedule-select=""
            aria-label="选择赛季"
            value={data.tournament.id}
            onChange={(event) =>
              void Taro.redirectTo({
                url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(event.target.value)}`,
              })
            }
          >
            {data.seasons.map((season) => (
              <option key={season.tournamentId} value={season.tournamentId}>
                {season.tournamentName}
              </option>
            ))}
          </select>
          <button
            data-schedule-button=""
            type="button"
            className="schedule-outline"
            onClick={showBracket}
          >
            <Icon name="cup" />
            杯赛对阵
            <Icon name="arrow" />
          </button>
        </div>
      </header>

      <section className="schedule-toolbar" aria-label="赛程筛选">
        <div className="schedule-calendar">
          <button
            data-schedule-button=""
            type="button"
            className="schedule-calendar__today"
            onClick={() => {
              const today = dateKey(new Date().toISOString())
              setWeekStart(shiftDate(today, -2))
              setSelectedDate(today)
              setView('list')
            }}
          >
            <Icon name="calendar" />
            <span>回到今天</span>
          </button>
          <button
            data-schedule-button=""
            type="button"
            className="schedule-calendar__arrow"
            aria-label="上一周"
            onClick={() => setWeekStart((value) => shiftDate(value, -7))}
          >
            <Icon name="left" />
          </button>
          <div className="schedule-calendar__dates">
            {dates.map((date) => (
              <button
                data-schedule-button=""
                type="button"
                key={date}
                className={`schedule-date ${selectedDate === date ? 'schedule-date--active' : ''}`}
                aria-pressed={selectedDate === date}
                onClick={() => {
                  setSelectedDate(selectedDate === date ? null : date)
                  setView('list')
                }}
              >
                <span>{date.slice(5).replace('-', '/')}</span>
                <span>
                  {new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}
                </span>
                {data.schedule.some((match) => dateKey(match.scheduledStartAt) === date) && <i />}
              </button>
            ))}
          </div>
          <button
            data-schedule-button=""
            type="button"
            className="schedule-calendar__arrow"
            aria-label="下一周"
            onClick={() => setWeekStart((value) => shiftDate(value, 7))}
          >
            <Icon name="right" />
          </button>
        </div>
        <div className="schedule-selects">
          <label data-schedule-label="">
            球队
            <select
              data-schedule-select=""
              aria-label="筛选球队"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">全部球队</option>
              {teams.map((team) => (
                <option value={team.id} key={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label data-schedule-label="">
            比赛阶段
            <select
              data-schedule-select=""
              aria-label="筛选比赛阶段"
              value={stage}
              onChange={(event) => setStage(event.target.value)}
            >
              <option value="">全部阶段</option>
              {stages.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label data-schedule-label="">
            比赛状态
            <select
              data-schedule-select=""
              aria-label="筛选比赛状态"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">全部状态</option>
              {statuses.map((value) => (
                <option value={value} key={value}>
                  {matchStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="schedule-primary-filter">
          <span>只看我的主队</span>
          <button
            data-schedule-button=""
            type="button"
            className="schedule-switch"
            role="switch"
            aria-label="只看我的主队"
            aria-checked={onlyPrimary}
            disabled={!primaryTeam}
            title={!primaryTeam ? '请先在主队页选择球队' : undefined}
            onClick={() => setOnlyPrimary((value) => !value)}
          >
            <i />
          </button>
        </div>
        <div className="schedule-view" aria-label="显示方式">
          <button
            data-schedule-button=""
            type="button"
            aria-pressed={view === 'list'}
            className={view === 'list' ? 'is-active' : ''}
            onClick={() => setView('list')}
          >
            <Icon name="list" />
            列表
          </button>
          <button
            data-schedule-button=""
            type="button"
            aria-pressed={view === 'bracket'}
            className={view === 'bracket' ? 'is-active' : ''}
            onClick={showBracket}
          >
            <Icon name="bracket" />
            对阵图
          </button>
        </div>
      </section>

      <div className="schedule-layout">
        <main className="schedule-results">
          {view === 'list' ? (
            <>
              <div className="schedule-results__meta">
                <span aria-live="polite">
                  {selectedDate ? `${selectedDate.replaceAll('-', '/')} · ` : '全部日期 · '}
                  {matches.length} 场比赛
                </span>
                <div>
                  {(selectedDate || teamId || stage || status || onlyPrimary) && (
                    <button data-schedule-button="" type="button" onClick={clearFilters}>
                      清除筛选
                    </button>
                  )}
                  <button
                    data-schedule-button=""
                    type="button"
                    aria-label="切换日期排序"
                    onClick={() => setDescending((value) => !value)}
                  >
                    {descending ? '日期倒序 ↓' : '日期正序 ↑'}
                  </button>
                </div>
              </div>
              {groups.size === 0 ? (
                <div className="schedule-empty">
                  <Icon name="calendar" />
                  <h3>当前筛选下没有比赛</h3>
                  <p>试试其他日期、球队或比赛状态。</p>
                  <button
                    data-schedule-button=""
                    type="button"
                    className="schedule-outline"
                    onClick={clearFilters}
                  >
                    查看全部赛程
                  </button>
                </div>
              ) : (
                [...groups].map(([date, dayMatches]) => (
                  <section className="schedule-date-group" key={date}>
                    <header>
                      <h3>
                        {date === 'TBD'
                          ? '时间待定'
                          : new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              weekday: 'short',
                            })}
                      </h3>
                      <span>{dayMatches.length} 场比赛</span>
                    </header>
                    {dayMatches.map((match) => (
                      <MatchRow key={match.id} match={match} />
                    ))}
                  </section>
                ))
              )}
            </>
          ) : (
            <BracketView data={data} filteredMatches={matches} />
          )}
        </main>
        <aside className="schedule-sidebar">
          <section className="schedule-side-card">
            <header>
              <h3>我的主队</h3>
              <button
                data-schedule-button=""
                type="button"
                onClick={() =>
                  void Taro.navigateTo({
                    url: `/pages/my-team/index?tournamentId=${encodeURIComponent(data.tournament.id)}`,
                  })
                }
              >
                {primaryTeam ? '查看球队主页' : '选择主队'}
                <Icon name="arrow" />
              </button>
            </header>
            {primary.phase === 'loading' ? (
              <p className="schedule-side-card__hint">正在读取主队…</p>
            ) : primary.phase === 'failed' ? (
              <div className="schedule-side-card__hint">
                <p>主队信息暂时不可用</p>
                <button data-schedule-button="" type="button" onClick={() => void loadPrimary()}>
                  重新加载
                </button>
              </div>
            ) : primaryTeam ? (
              <PrimaryTeam
                team={primaryTeam}
                matches={data.schedule}
                tournamentId={data.tournament.id}
              />
            ) : (
              <div className="schedule-no-team">
                <div className="schedule-no-team__crest">
                  <Icon name="cup" />
                </div>
                <h4>为你的球队加油</h4>
                <p>
                  {session
                    ? '选择主队，随时关注他们的下一场比赛。'
                    : '登录并选择主队，关注球队的每一场比赛。'}
                </p>
                <button
                  data-schedule-button=""
                  type="button"
                  className="schedule-outline"
                  onClick={() =>
                    void Taro.navigateTo({
                      url: session
                        ? `/pages/my-team/index?tournamentId=${encodeURIComponent(data.tournament.id)}`
                        : '/pages/login/index',
                    })
                  }
                >
                  {session ? '选择我的主队' : '登录并选择主队'}
                  <Icon name="arrow" />
                </button>
              </div>
            )}
          </section>
          <section className="schedule-side-card">
            <header>
              <h3>赛事进程</h3>
              <button data-schedule-button="" type="button" onClick={showBracket}>
                查看完整赛程
                <Icon name="arrow" />
              </button>
            </header>
            <ol className="schedule-progress">
              {data.bracket.map((round) => {
                const done = round.matches.filter(isFinishedMatch).length
                const complete = round.matches.length > 0 && done === round.matches.length
                const active = round.matches.some((match) =>
                  ['LIVE', 'CHECK_IN'].includes(match.status),
                )
                return (
                  <li
                    key={round.id}
                    className={complete ? 'is-complete' : active || done > 0 ? 'is-current' : ''}
                  >
                    <span className="schedule-progress__dot">
                      {complete && <Icon name="check" />}
                    </span>
                    <span>{round.name}</span>
                    <small>
                      {complete
                        ? `已完成 ${done} 场`
                        : active
                          ? `进行中 · ${done}/${round.matches.length}`
                          : done > 0
                            ? `已完成 ${done}/${round.matches.length} 场`
                            : formatDate(
                                round.matches.find((match) => match.scheduledStartAt)
                                  ?.scheduledStartAt ?? null,
                              )}
                    </small>
                  </li>
                )
              })}
            </ol>
            {data.bracket.length === 0 && (
              <p className="schedule-side-card__hint">暂无淘汰赛安排</p>
            )}
          </section>
          <section className="schedule-side-card schedule-tournament-card">
            <div>
              <Icon name="cup" />
              <h3>{data.tournament.name.replace(/\s*·\s*演示赛季$/, '')}</h3>
              {isDemo && <span className="schedule-demo">演示赛季</span>}
            </div>
            <p>在校园的绿茵场上，记录每一份热爱。</p>
            <p>
              {isDemo
                ? '本页面为演示数据，仅用于产品功能展示。'
                : `${data.schedule.length} 场比赛 · ${teams.length} 支球队`}
            </p>
          </section>
        </aside>
      </div>
      <div className="schedule-bottom-note">
        <span>CAMPUS FOOTBALL / XIAOQIU</span>
        <span>
          少年与足球
          <br />
          永远值得被记录
        </span>
      </div>
    </>
  )
}

function MatchRow({ match }: { match: MatchSummary }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const hasPenalty = match.homePenaltyScore !== null || match.awayPenaltyScore !== null
  return (
    <article className="schedule-row">
      <div className="schedule-row__body">
        <time>{formatTime(match.scheduledStartAt)}</time>
        <div className="schedule-row__phase">
          <strong>{match.roundName ?? match.stageName ?? match.title}</strong>
          <span>{match.groupName ?? match.title}</span>
        </div>
        <div className="schedule-row__fixture">
          <RowTeam
            team={match.homeTeam}
            placeholder={match.homePlaceholder ?? '主队待定'}
            tournamentId={match.tournamentId}
          />
          <div className="schedule-row__score">
            <strong>{hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}</strong>
            {hasPenalty && (
              <small>
                点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}
              </small>
            )}
          </div>
          <RowTeam
            away
            team={match.awayTeam}
            placeholder={match.awayPlaceholder ?? '客队待定'}
            tournamentId={match.tournamentId}
          />
        </div>
        <MatchStatus status={match.status} />
        <div className="schedule-row__venue">
          <Icon name="pin" />
          <span>{match.venue?.name ?? '场地待定'}</span>
        </div>
        <button
          data-schedule-button=""
          type="button"
          className="schedule-outline schedule-row__detail"
          aria-label={`查看${match.homeTeam?.name ?? match.homePlaceholder ?? '待定'}对阵${match.awayTeam?.name ?? match.awayPlaceholder ?? '待定'}的比赛详情`}
          onClick={() => openMatch(match.id)}
        >
          查看详情
          <Icon name="arrow" />
        </button>
      </div>
      {match.statusReason && <p className="schedule-row__reason">{match.statusReason}</p>}
    </article>
  )
}

function RowTeam({
  team,
  placeholder,
  tournamentId,
  away = false,
}: {
  team: TeamSummary | null
  placeholder: string
  tournamentId: string
  away?: boolean
}) {
  const content = (
    <>
      <span>{team?.name ?? placeholder}</span>
      {team ? <TeamCrest team={team} size="medium" /> : <span className="schedule-tbd">?</span>}
    </>
  )
  return team ? (
    <button
      data-schedule-button=""
      type="button"
      className={`schedule-row__team ${away ? 'schedule-row__team--away' : ''}`}
      aria-label={`查看${team.name}`}
      title={team.name}
      onClick={() => openTeam(team.id, tournamentId)}
    >
      {content}
    </button>
  ) : (
    <div
      className={`schedule-row__team ${away ? 'schedule-row__team--away' : ''}`}
      title={placeholder}
    >
      {content}
    </div>
  )
}

function PrimaryTeam({
  team,
  matches,
  tournamentId,
}: {
  team: TeamSummary
  matches: MatchSummary[]
  tournamentId: string
}) {
  const next = matches
    .filter(
      (match) =>
        (match.homeTeam?.id === team.id || match.awayTeam?.id === team.id) &&
        ['SCHEDULED', 'CHECK_IN', 'LIVE'].includes(match.status),
    )
    .sort(
      (a, b) =>
        (Date.parse(a.scheduledStartAt ?? '') || Infinity) -
        (Date.parse(b.scheduledStartAt ?? '') || Infinity),
    )[0]
  return (
    <>
      <button
        data-schedule-button=""
        type="button"
        className="schedule-primary-team"
        onClick={() => openTeam(team.id, tournamentId)}
      >
        <TeamCrest team={team} size="large" />
        <span>
          <strong>{team.name}</strong>
          <small>{team.collegeName ?? '为每一场热爱而战'}</small>
        </span>
      </button>
      {next ? (
        <button
          data-schedule-button=""
          type="button"
          className="schedule-next-match"
          onClick={() => openMatch(next.id)}
        >
          <span className="schedule-next-match__heading">
            {next.status === 'LIVE' ? '正在比赛' : '下一场比赛'}
            <small>{next.title}</small>
            <Icon name="right" />
          </span>
          <span>
            {`${formatDate(next.scheduledStartAt)} · ${formatTime(next.scheduledStartAt)}`}
          </span>
          <span className="schedule-next-match__teams">
            <TeamCrest team={next.homeTeam} size="small" />
            {next.homeTeam?.shortName ?? '待定'}
            <b>VS</b>
            <TeamCrest team={next.awayTeam} size="small" />
            {next.awayTeam?.shortName ?? '待定'}
          </span>
          <span className="schedule-next-match__venue">
            <Icon name="pin" />
            {next.venue?.name ?? '场地待定'}
          </span>
        </button>
      ) : (
        <p className="schedule-side-card__hint">该赛季暂无待赛安排</p>
      )}
    </>
  )
}

function BracketView({
  data,
  filteredMatches,
}: {
  data: CompetitionDataResponse
  filteredMatches: MatchSummary[]
}) {
  const layout = useMemo(() => createBracketLayout(data.bracket), [data.bracket])
  const matchingIds = new Set(filteredMatches.map((match) => match.id))
  const byId = new Map(
    data.bracket.flatMap((round) => round.matches.map((match) => [match.id, match] as const)),
  )
  if (data.bracket.length === 0)
    return (
      <DataState kind="empty" title="暂无淘汰赛对阵" description="可以切换列表查看全部赛程。" />
    )
  return (
    <section className="schedule-bracket">
      <header>
        <h3>杯赛对阵</h3>
        <span>
          符合筛选{' '}
          {data.bracket.reduce(
            (count, round) =>
              count + round.matches.filter((match) => matchingIds.has(match.id)).length,
            0,
          )}{' '}
          场 · 横向滚动查看晋级路径
        </span>
      </header>
      <div className="schedule-bracket__scroll" tabIndex={0} aria-label="淘汰赛对阵图，可横向滚动">
        <div
          className="schedule-bracket__canvas"
          style={{ width: layout.width, height: layout.height }}
        >
          {layout.rounds.map((round) => (
            <h4 key={round.id} style={{ left: round.x, width: round.width }}>
              {round.name}
            </h4>
          ))}
          {layout.connectors.map((connector) => (
            <span
              aria-hidden="true"
              className="schedule-bracket__connector"
              key={connector.id}
              style={{
                left: connector.x,
                top: connector.y,
                width: connector.width || 1,
                height: connector.height || 1,
              }}
            />
          ))}
          {layout.nodes.map((node) => {
            const match = byId.get(node.matchId)
            if (!match) return null
            return (
              <button
                data-schedule-button=""
                type="button"
                className={`schedule-bracket__match ${matchingIds.has(match.id) ? '' : 'schedule-bracket__match--muted'}`}
                key={node.id}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                onClick={() => openMatch(match.id)}
              >
                <span className="schedule-bracket__meta">
                  {match.title} · {formatTime(match.scheduledStartAt)}
                </span>
                {[match.homeTeam, match.awayTeam].map((team, index) => (
                  <span className="schedule-bracket__team" key={index}>
                    <TeamCrest team={team} size="small" />
                    <span>
                      {team?.name ??
                        (index === 0 ? match.homePlaceholder : match.awayPlaceholder) ??
                        '待定'}
                    </span>
                    <b>{(index === 0 ? match.homeScore : match.awayScore) ?? '–'}</b>
                  </span>
                ))}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
