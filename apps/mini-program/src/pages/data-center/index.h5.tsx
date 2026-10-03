import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { TeamCrest } from '../../components/product-ui'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { openTeamFromUrl } from '../../features/product/team-navigation'
import { openPlayer } from '../../features/product/player-navigation'
import { HOVER_PLAYER_EVENT, LEAVE_PLAYER_EVENT } from '../../features/product/player-navigation.h5'
import type {
  CompetitionDataResponse,
  PlayerStats,
  TeamSummary,
} from '../../features/product/product.types'
// Keep compact H5 on the original entry without resolving back to this file.
import ExistingDataPage from './index.tsx'
import { KnockoutPanel } from './knockout-tree.h5'

import './index.h5.scss'

type CompetitionData = CompetitionDataResponse & { resultsMode?: 'DEMO' | 'OFFICIAL' }
type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionData }
type DataTab = 'teams' | 'players'

const tabs = [
  { key: 'teams', label: '球队排名' },
  { key: 'players', label: '球员数据' },
] as const

export default function H5DataCenterPage() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return desktop ? <DesktopDataPage /> : <ExistingDataPage />
}

function DesktopDataPage() {
  const routeTournamentId = getCurrentInstance().router?.params.tournamentId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [tab, setTab] = useState<DataTab>('teams')
  const [expandedPanel, setExpandedPanel] = useState<'groups' | 'knockout'>('groups')
  const [instantSwitch, setInstantSwitch] = useState(false)
  const [groupId, setGroupId] = useState('all')
  const [primaryTeamId, setPrimaryTeamId] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const requestedTournament = useRef(routeTournamentId)
  const lastLoadedData = useRef<CompetitionData | null>(null)
  const accessToken = readSession()?.accessToken

  const load = useCallback(
    async (requestedId?: string) => {
      const sequence = ++requestSequence.current
      if (requestedId) requestedTournament.current = requestedId
      setState({ phase: 'loading' })
      try {
        const id =
          requestedTournament.current ||
          routeTournamentId ||
          (await productRepository.getHome()).tournament.id
        requestedTournament.current = id
        const data = await productRepository.getCompetitionData(id)
        if (sequence !== requestSequence.current) return
        lastLoadedData.current = data
        setGroupId('all')
        setState({ phase: 'ready', data })
      } catch (error) {
        if (sequence !== requestSequence.current) return
        setState({
          phase: 'failed',
          message: error instanceof Error ? error.message : '赛事数据加载失败，请稍后重试。',
        })
      }
    },
    [routeTournamentId],
  )

  useEffect(() => {
    requestedTournament.current = routeTournamentId
    void load()
    return () => {
      requestSequence.current += 1
    }
  }, [load, routeTournamentId])

  useEffect(() => {
    let active = true
    setPrimaryTeamId(null)
    if (accessToken) {
      void productRepository
        .getTeamPreferences()
        .then((preferences) => {
          if (active) setPrimaryTeamId(preferences.primaryTeam?.id ?? null)
        })
        .catch(() => {
          /* Optional preference does not block public data. */
        })
    }
    return () => {
      active = false
    }
  }, [accessToken])

  const tournamentId =
    state.phase === 'ready' ? state.data.tournament.id : requestedTournament.current
  const expandPanel = (
    panel: 'groups' | 'knockout',
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setInstantSwitch(event.detail === 0)
    setExpandedPanel(panel)
  }
  return (
    <PublicShell active="data" tournamentId={tournamentId}>
      <div className="data-desktop">
        <div className="data-desktop__art" aria-hidden="true">
          <div className="data-desktop__stadium" />
          <div className="data-desktop__floodlight" />
          <div className="data-desktop__goal" />
          <div className="data-desktop__pitch" />
          <span className="data-desktop__watermark">CAMPUS FOOTBALL</span>
          <span className="data-desktop__signature">MORE THAN A GAME</span>
        </div>
        {state.phase !== 'ready' && lastLoadedData.current && (
          <DataHero
            data={lastLoadedData.current}
            selectedTournamentId={requestedTournament.current}
            unavailable
            onSeasonChange={(id) => void load(id)}
          />
        )}
        {state.phase === 'loading' && <DataState kind="loading" title="正在读取赛事数据" />}
        {state.phase === 'failed' && (
          <DataState
            kind="error"
            title="赛事数据不可用"
            description={state.message}
            onRetry={() => void load()}
          />
        )}
        {state.phase === 'ready' && (
          <>
            <DataHero data={state.data} onSeasonChange={(id) => void load(id)} />
            <div className="data-desktop__toolbar">
              <div className="data-desktop__tabs" aria-label="数据榜单">
                {tabs.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={'data-desktop__tab ' + (tab === item.key ? 'is-active' : '')}
                    aria-pressed={tab === item.key}
                    onClick={() => setTab(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="data-desktop__view-hint">
                {tab === 'teams' ? '小组赛与淘汰赛 · 点击面板展开' : '进球与助攻 · 同屏查看'}
              </span>
            </div>
            {tab === 'teams' && (
              <div
                className={
                  'data-desktop__competition-panels is-expanded-' +
                  expandedPanel +
                  (instantSwitch ? ' is-instant' : '')
                }
              >
                <StandingsCard
                  data={state.data}
                  groupId={groupId}
                  onGroupChange={setGroupId}
                  primaryTeamId={primaryTeamId}
                  expanded={expandedPanel === 'groups'}
                  onExpand={(event) => expandPanel('groups', event)}
                />
                <KnockoutPanel
                  data={state.data}
                  expanded={expandedPanel === 'knockout'}
                  onExpand={(event) => expandPanel('knockout', event)}
                />
              </div>
            )}
            {tab === 'players' && (
              <div className="data-desktop__player-panels">
                <LeaderboardCard data={state.data} mode="scorers" />
                <LeaderboardCard data={state.data} mode="assists" />
              </div>
            )}
            <div className="data-desktop__updated">
              <span className="data-desktop__updated-dot" />
              数据更新于 {formatDataTimestamp(state.data.updatedAt)}
              <span>·</span>榜单随比赛记录更新
            </div>
          </>
        )}
      </div>
    </PublicShell>
  )
}

function DataHero({
  data,
  onSeasonChange,
  selectedTournamentId = data.tournament.id,
  unavailable = false,
}: {
  data: CompetitionData
  onSeasonChange: (id: string) => void
  selectedTournamentId?: string
  unavailable?: boolean
}) {
  const teams = new Set<string>()
  for (const match of data.schedule) {
    if (match.homeTeam) teams.add(match.homeTeam.id)
    if (match.awayTeam) teams.add(match.awayTeam.id)
  }
  for (const group of data.groups) for (const row of group.standings) teams.add(row.teamId)
  const finished = data.schedule.filter(
    (match) =>
      ['FINISHED', 'CONFIRMED'].includes(match.status) &&
      match.homeScore !== null &&
      match.awayScore !== null,
  )
  const goals = finished.reduce(
    (total, match) => total + (match.homeScore ?? 0) + (match.awayScore ?? 0),
    0,
  )
  return (
    <div className="data-desktop__hero">
      <div className="data-desktop__intro">
        <div className="data-desktop__title-row">
          <h1>赛事数据</h1>
          <label className="data-desktop__select data-desktop__select--season">
            <span className="sr-only">选择赛事赛季</span>
            <select
              value={selectedTournamentId}
              onChange={(event) => onSeasonChange(event.target.value)}
            >
              {data.seasons.map((season) => (
                <option key={season.tournamentId} value={season.tournamentId}>
                  {season.tournamentName}
                </option>
              ))}
              {!data.seasons.some((season) => season.tournamentId === data.tournament.id) && (
                <option value={data.tournament.id}>{data.tournament.name}</option>
              )}
            </select>
          </label>
          {data.resultsMode === 'DEMO' && selectedTournamentId === data.tournament.id && (
            <span className="data-desktop__demo">演示赛季</span>
          )}
        </div>
        <p>用数据记录每一场奔跑，见证校园足球的热爱与成长。</p>
      </div>
      <div className="data-desktop__kpis">
        <Stat icon="teams" label="参赛球队" value={unavailable ? '—' : teams.size} unit="支" />
        <Stat icon="pitch" label="已赛场次" value={unavailable ? '—' : finished.length} unit="场" />
        <Stat icon="ball" label="总进球" value={unavailable ? '—' : goals} unit="个" />
      </div>
      <div className="data-desktop__motto">
        在校园，
        <br />
        <span>足球让更好的我们相遇</span>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  unit,
}: {
  icon: 'teams' | 'pitch' | 'ball'
  label: string
  value: number | '—'
  unit: string
}) {
  return (
    <div className="data-desktop__stat">
      <DataIcon kind={icon} />
      <div>
        <span className="data-desktop__stat-label">{label}</span>
        <strong>{value}</strong>
        <span className="data-desktop__stat-unit">{unit}</span>
      </div>
    </div>
  )
}

function DataIcon({ kind }: { kind: 'teams' | 'pitch' | 'ball' }) {
  if (kind === 'ball')
    return (
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="m20 12 8 6-3 9H15l-3-9 8-6Zm0-9v9M4 15l8 3m3 9-6 7m16-7 6 7m-3-16 8-3"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    )
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="34" height="26" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 7v26M3 15h7v10H3m34-10h-7v10h7" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="20" r="5" stroke="currentColor" strokeWidth="2" />
      {kind === 'teams' && (
        <path d="M8 6v8m-4-4h8m20 16v8m-4-4h8" stroke="currentColor" strokeWidth="3" />
      )}
    </svg>
  )
}

function StandingsCard({
  data,
  groupId,
  onGroupChange,
  primaryTeamId,
  expanded,
  onExpand,
}: {
  data: CompetitionData
  groupId: string
  onGroupChange: (id: string) => void
  primaryTeamId: string | null
  expanded: boolean
  onExpand: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const teams = useMemo(() => {
    const map = new Map<string, TeamSummary>()
    for (const match of data.schedule) {
      if (match.homeTeam) map.set(match.homeTeam.id, match.homeTeam)
      if (match.awayTeam) map.set(match.awayTeam.id, match.awayTeam)
    }
    for (const group of data.groups) {
      for (const row of group.standings) {
        if (!map.has(row.teamId)) {
          map.set(row.teamId, {
            id: row.teamId,
            teamCode: '',
            name: row.teamName,
            shortName: row.shortName,
            primaryColor: row.primaryColor,
            secondaryColor: null,
            collegeName: null,
            crestUrl: null,
          })
        }
      }
    }
    return map
  }, [data.groups, data.schedule])
  const groups =
    groupId === 'all' ? data.groups : data.groups.filter((group) => group.id === groupId)
  const demo = data.resultsMode === 'DEMO'
  return (
    <section
      className={
        'data-desktop__card data-desktop__standings data-desktop__panel ' +
        (expanded ? 'is-expanded' : 'is-collapsed')
      }
      aria-label="小组赛面板"
    >
      <div className="data-desktop__card-head">
        <div className="data-desktop__heading">
          <button
            type="button"
            className="data-desktop__panel-toggle"
            aria-expanded={expanded}
            aria-controls="data-group-content"
            onClick={onExpand}
          >
            <h2>小组赛积分</h2>
            <span aria-hidden="true">{expanded ? '详细积分' : '展开 ↗'}</span>
          </button>
          {demo && expanded && <span>* 以下为演示数据</span>}
        </div>
        {expanded && data.groups.length > 0 && (
          <label className="data-desktop__select data-desktop__select--group">
            <span className="sr-only">选择小组</span>
            <select value={groupId} onChange={(event) => onGroupChange(event.target.value)}>
              <option value="all">全部小组</option>
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div id="data-group-content">
        {groups.length === 0 ? (
          <DataState
            kind="empty"
            title="本赛季暂无小组积分"
            description="采用淘汰赛赛制的赛事，可通过上方入口查看对阵。"
          />
        ) : (
          groups.map((group) => (
            <div className="data-desktop__group" key={group.id}>
              {groups.length > 1 && <h3>{group.name}</h3>}
              {!expanded ? (
                <div className="data-desktop__compact-standings">
                  {group.standings.map((row) => (
                    <div
                      className={
                        'data-desktop__compact-standing ' + (row.rank <= 2 ? 'is-qualifying' : '')
                      }
                      key={row.teamId}
                      title={`${row.teamName} · ${row.points} 分`}
                    >
                      <span>{row.rank}</span>
                      <TeamCrest team={teams.get(row.teamId) ?? null} size="small" />
                      <span className="data-desktop__compact-team">{row.shortName}</span>
                      <strong>
                        {row.points}
                        <small>分</small>
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <table className="data-desktop__standing-table">
                  <caption className="sr-only">{group.name}积分榜</caption>
                  <colgroup>
                    <col className="data-desktop__rank-col" />
                    <col className="data-desktop__team-col" />
                    {Array.from({ length: 8 }, (_, index) => (
                      <col key={index} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {[
                        '排名',
                        '球队',
                        '场次',
                        '胜',
                        '平',
                        '负',
                        '进球',
                        '失球',
                        '净胜球',
                        '积分',
                      ].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.standings.map((row) => (
                      <tr
                        key={row.teamId}
                        className={
                          (row.rank <= 2 ? 'is-qualifying ' : '') +
                          (row.teamId === primaryTeamId ? 'is-primary' : '')
                        }
                      >
                        <td className="data-desktop__standing-rank">{row.rank}</td>
                        <td>
                          <div className="data-desktop__team-cell">
                            <TeamCrest team={teams.get(row.teamId) ?? null} size="small" />
                            <a
                              href={teamUrl(row.teamId, data.tournament.id)}
                              onClick={navigateLink}
                            >
                              {row.teamName}
                            </a>
                            {row.teamId === primaryTeamId && (
                              <span className="data-desktop__primary-tag">主队</span>
                            )}
                            {row.isLive && <span className="data-desktop__live-tag">暂定</span>}
                          </div>
                        </td>
                        <td>{row.played}</td>
                        <td>{row.won}</td>
                        <td>{row.drawn}</td>
                        <td>{row.lost}</td>
                        <td>{row.goalsFor}</td>
                        <td>{row.goalsAgainst}</td>
                        <td>{row.goalDifference}</td>
                        <td className="data-desktop__points">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {group.standings.length === 0 && (
                <p className="data-desktop__empty">该小组暂未产生积分数据。</p>
              )}
            </div>
          ))
        )}
      </div>
      <div className="data-desktop__table-note">
        {demo ? (
          <>
            <span>
              <i />
              小组前两名
            </span>
            {expanded && <span>胜 3 分 · 平 1 分 · 负 0 分</span>}
          </>
        ) : (
          <span>积分与同分排序依据赛事规程，由赛事系统计算。</span>
        )}
        {expanded && (
          <span>
            净胜球 = 进球 − 失球
            {data.groups.some((group) => group.standings.some((row) => row.isLive))
              ? ' · 暂定积分含进行中比赛'
              : ''}
          </span>
        )}
      </div>
      {!expanded && (
        <button
          type="button"
          className="data-desktop__panel-cover"
          aria-label="展开小组赛"
          onClick={onExpand}
        >
          <span className="sr-only">展开小组赛</span>
        </button>
      )}
    </section>
  )
}

function LeaderboardCard({
  data,
  mode,
  compact = false,
  onExpand,
}: {
  data: CompetitionData
  mode: 'scorers' | 'assists'
  compact?: boolean
  onExpand?: () => void
}) {
  const rows = compact ? data.leaders[mode].slice(0, 5) : data.leaders[mode]
  const title = mode === 'scorers' ? '射手榜' : '助攻榜'
  return (
    <section
      className={
        'data-desktop__card data-desktop__leaders ' +
        (compact ? 'data-desktop__leaders--compact' : '')
      }
    >
      <div className="data-desktop__card-head">
        <h2>{title}</h2>
        {onExpand ? (
          <button className="data-desktop__more" type="button" onClick={onExpand}>
            查看完整榜单 <span aria-hidden="true">→</span>
          </button>
        ) : (
          <span className="data-desktop__leader-note">
            {rows.length > 0 ? `前 ${rows.length} 名 · 点击球员查看档案` : '球员赛季数据'}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <DataState
          kind="empty"
          title={`暂无${mode === 'scorers' ? '进球' : '助攻'}记录`}
          description="比赛产生统计后，球员将出现在这里。"
        />
      ) : (
        <table className="data-desktop__leader-table">
          <caption className="sr-only">
            {title}
            {compact ? '前五名' : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">排名</th>
              <th scope="col">球员</th>
              <th scope="col">所属球队</th>
              {!compact && <th scope="col">出场</th>}
              <th scope="col">{mode === 'scorers' ? '进球' : '助攻'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player, index) => (
              <LeaderRow
                key={player.id}
                player={player}
                rank={index + 1}
                mode={mode}
                tournamentId={data.tournament.id}
                compact={compact}
              />
            ))}
          </tbody>
        </table>
      )}
      {!compact && (
        <p className="data-desktop__table-note">
          显示赛事接口返回的球员榜单 · 数据来自比赛事件与出场记录
          {data.resultsMode === 'DEMO' ? ' · 当前为演示赛季' : ''}
        </p>
      )}
    </section>
  )
}

function LeaderRow({
  player,
  rank,
  mode,
  tournamentId,
  compact,
}: {
  player: PlayerStats
  rank: number
  mode: 'scorers' | 'assists'
  tournamentId: string
  compact: boolean
}) {
  return (
    <tr>
      <td>
        <span
          className={'data-desktop__medal ' + (rank <= 3 ? `data-desktop__medal--${rank}` : '')}
        >
          {rank}
        </span>
      </td>
      <td>
        <a
          href={`/pages/player-detail/index?playerId=${encodeURIComponent(player.id)}&tournamentId=${encodeURIComponent(tournamentId)}`}
          onClick={(event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            void openPlayer(player.id, tournamentId)
          }}
          onMouseEnter={(event) =>
            window.dispatchEvent(
              new CustomEvent(HOVER_PLAYER_EVENT, {
                detail: { playerId: player.id, tournamentId, anchor: event.currentTarget },
              }),
            )
          }
          onMouseLeave={() => window.dispatchEvent(new Event(LEAVE_PLAYER_EVENT))}
        >
          {player.displayName}
        </a>
      </td>
      <td>
        <div className="data-desktop__team-cell">
          <TeamCrest team={player.team} size="small" />
          {player.team ? (
            <a href={teamUrl(player.team.id, tournamentId)} onClick={navigateLink}>
              {player.team.shortName}
            </a>
          ) : (
            <span>暂无球队</span>
          )}
        </div>
      </td>
      {!compact && <td>{player.appearances}</td>}
      <td className="data-desktop__leader-value">
        {mode === 'scorers' ? player.goals : player.assists}
      </td>
    </tr>
  )
}

function teamUrl(teamId: string, tournamentId: string) {
  return `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}&tournamentId=${encodeURIComponent(tournamentId)}`
}

function navigateLink(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const url = event.currentTarget.getAttribute('href') ?? ''
  if (!openTeamFromUrl(url)) void Taro.navigateTo({ url })
}

function formatDataTimestamp(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
