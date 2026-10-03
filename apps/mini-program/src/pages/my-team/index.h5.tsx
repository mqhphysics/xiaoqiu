import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { TeamCrest, UserAvatar } from '../../components/product-ui'
import { TeamContent, Empty, openPlayer } from '../../components/team-hub/content.h5'
import { TeamPicker } from '../../components/team-hub/picker.h5'
import { PlayerPicker } from '../../components/team-hub/player-picker.h5'
import { useDesktopTeamView, useTeamData } from '../../components/team-hub/data.h5'
import { TeamIcon } from '../../components/team-hub/icons.h5'
import { productRepository } from '../../features/product/product.repository'
import { positionLabel } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import { openTeam } from '../../features/product/team-navigation'
import { TEAM_PREFERENCES_EVENT } from '../../features/product/team-navigation.h5'
import type {
  HomeResponse,
  PlayerFollowsResponse,
  TeamPreferencesResponse,
} from '../../features/product/product.types'
import ExistingMyTeamPage from './index.tsx'
import '../../components/team-hub/index.h5.scss'

export default function H5MyTeamPage() {
  const desktop = useDesktopTeamView()
  const params = getCurrentInstance().router?.params
  // Team management and roster review retain their existing dedicated workflows.
  return desktop && !params?.teamId && params?.review !== 'roster' ? (
    <DesktopMyTeamPage />
  ) : (
    <ExistingMyTeamPage />
  )
}

function DesktopMyTeamPage() {
  const routeTournamentId = getCurrentInstance().router?.params.tournamentId ?? ''
  const [home, setHome] = useState<HomeResponse | null>(null)
  const [preferences, setPreferences] = useState<TeamPreferencesResponse | null>(null)
  const [players, setPlayers] = useState<PlayerFollowsResponse>({ items: [] })
  const [playerError, setPlayerError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [picker, setPicker] = useState<'primary' | 'follow' | 'player' | null>(null)
  const sequence = useRef(0)
  const currentPrimary = useRef('')
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const signedIn = Boolean(readSession())
      const [homeData, prefs, follows] = await Promise.all([
        productRepository.getHome(routeTournamentId || undefined),
        signedIn
          ? productRepository.getTeamPreferences(routeTournamentId || undefined)
          : Promise.resolve(null),
        signedIn
          ? productRepository
              .getPlayerFollows()
              .then((value) => ({ value, error: '' }))
              .catch((issue) => ({
                value: { items: [] },
                error: issue instanceof Error ? issue.message : '球员关注加载失败',
              }))
          : Promise.resolve({ value: { items: [] }, error: '' }),
      ])
      if (request !== sequence.current) return
      setHome(homeData)
      setPreferences(prefs)
      currentPrimary.current = prefs?.primaryTeam?.id ?? ''
      setPlayers(follows.value)
      setPlayerError(follows.error)
      setSelectedTeam(prefs?.primaryTeam?.id ?? '')
    } catch (issue) {
      if (request === sequence.current)
        setError(issue instanceof Error ? issue.message : '主队空间加载失败')
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [routeTournamentId])
  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])
  useEffect(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<TeamPreferencesResponse>).detail
      if (currentPrimary.current !== (next.primaryTeam?.id ?? ''))
        setSelectedTeam(next.primaryTeam?.id ?? '')
      currentPrimary.current = next.primaryTeam?.id ?? ''
      setPreferences(next)
    }
    window.addEventListener(TEAM_PREFERENCES_EVENT, changed)
    return () => window.removeEventListener(TEAM_PREFERENCES_EVENT, changed)
  }, [])
  const tournamentId = routeTournamentId || home?.tournament.id || ''
  const openPicker = (mode: 'primary' | 'follow' | 'player') => {
    if (mode !== 'primary' && !readSession()) {
      void Taro.showToast({ title: '登录后可以关注球队和球员', icon: 'none' })
      return
    }
    if (mode === 'follow' && !preferences?.primaryTeam) {
      setPicker('primary')
      return
    }
    setPicker(mode)
  }
  return (
    <PublicShell active="team" tournamentId={tournamentId}>
      <div className="th-root th-page">
        {loading ? (
          <DataState kind="loading" title="正在加载主队空间" />
        ) : error ? (
          <DataState
            kind="error"
            title="主队空间暂不可用"
            description={error}
            onRetry={() => void load()}
          />
        ) : home ? (
          <>
            <div className="th-follow-strip">
              <section className="th-follow-strip__primary">
                <div className="th-follow-strip__label">
                  <strong>我的主队</strong>
                  <button
                    data-team-control
                    type="button"
                    className="th-icon-button th-switch"
                    aria-label="切换主队"
                    onClick={() => openPicker('primary')}
                  >
                    <TeamIcon name="switch" />
                    <span role="tooltip">切换主队</span>
                  </button>
                </div>
                {preferences?.primaryTeam ? (
                  <FollowTeamChip
                    team={preferences.primaryTeam}
                    selected={selectedTeam === preferences.primaryTeam.id}
                    primary
                    tournamentId={tournamentId}
                    onSelect={() => setSelectedTeam(preferences.primaryTeam!.id)}
                  />
                ) : (
                  <button
                    data-team-control
                    type="button"
                    className="th-follow-chip"
                    onClick={() => openPicker('primary')}
                  >
                    <TeamIcon name="plus" />
                    选择我的主队
                  </button>
                )}
              </section>
              <section className="th-follow-strip__teams">
                <div className="th-follow-strip__label">
                  <span>我关注的球队</span>
                  <button
                    data-team-control
                    type="button"
                    className="th-icon-button"
                    aria-label="管理关注球队"
                    title="管理关注球队"
                    onClick={() => openPicker('follow')}
                  >
                    <TeamIcon name="plus" />
                  </button>
                </div>
                <HorizontalFollowStrip>
                  {preferences?.followedTeams.length ? (
                    preferences.followedTeams.map((team) => (
                      <FollowTeamChip
                        key={team.id}
                        team={team}
                        selected={selectedTeam === team.id}
                        tournamentId={tournamentId}
                        onSelect={() => setSelectedTeam(team.id)}
                      />
                    ))
                  ) : (
                    <button
                      data-team-control
                      type="button"
                      className="th-empty-chip"
                      onClick={() => openPicker('follow')}
                    >
                      关注更多校园球队
                    </button>
                  )}
                </HorizontalFollowStrip>
              </section>
              <section className="th-follow-strip__players">
                <div className="th-follow-strip__label">
                  <span>我关注的球员</span>
                  <button
                    data-team-control
                    type="button"
                    className="th-icon-button"
                    aria-label="管理关注球员"
                    title="管理关注球员"
                    onClick={() => openPicker('player')}
                  >
                    <TeamIcon name="plus" />
                  </button>
                </div>
                <HorizontalFollowStrip>
                  {players.items.length ? (
                    players.items.map((player) => (
                      <button
                        data-team-control
                        type="button"
                        className="th-follow-chip th-follow-chip--player"
                        key={player.id}
                        onClick={() => void openPlayer(player.id, tournamentId)}
                      >
                        <UserAvatar
                          name={player.displayName}
                          avatarUrl={player.avatarUrl}
                          size="small"
                        />
                        <span>
                          <strong>{player.displayName}</strong>
                          <small>{positionLabel(player.position)}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <button
                      data-team-control
                      type="button"
                      className="th-empty-chip"
                      onClick={() => openPicker('player')}
                    >
                      {playerError ? '关注加载失败，点击重试' : '关注球员，追踪绿茵表现'}
                    </button>
                  )}
                </HorizontalFollowStrip>
              </section>
            </div>
            {selectedTeam ? (
              <SelectedTeam key={selectedTeam} teamId={selectedTeam} tournamentId={tournamentId} />
            ) : (
              <section className="th-surface th-welcome">
                <Empty
                  title="把热爱，留给你的主队"
                  copy="选择主队后，这里会展示球队动态、赛程、球员与球队资料。"
                />
                <button
                  data-team-control
                  type="button"
                  className="th-primary-button"
                  onClick={() => openPicker('primary')}
                >
                  选择主队
                  <TeamIcon name="arrow" />
                </button>
                <div className="th-discover">
                  {home.teams.map((team) => (
                    <button
                      data-team-control
                      data-team-action
                      type="button"
                      key={team.id}
                      onClick={() => void openTeam(team.id, tournamentId)}
                    >
                      <TeamCrest team={team} interactive={false} />
                      <strong>{team.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
        {picker && picker !== 'player' && home ? (
          <TeamPicker
            mode={picker}
            preferences={preferences}
            teams={home.teams}
            onClose={() => setPicker(null)}
            onSaved={(next) => {
              setPreferences(next)
              if (picker === 'primary') setSelectedTeam(next.primaryTeam?.id ?? '')
            }}
          />
        ) : null}
        {picker === 'player' ? (
          <PlayerPicker
            tournamentId={tournamentId}
            follows={players}
            onChange={setPlayers}
            onClose={() => setPicker(null)}
          />
        ) : null}
      </div>
    </PublicShell>
  )
}

function FollowTeamChip({
  team,
  selected,
  primary = false,
  tournamentId,
  onSelect,
}: {
  team: NonNullable<TeamPreferencesResponse['primaryTeam']>
  selected: boolean
  primary?: boolean
  tournamentId: string
  onSelect: () => void
}) {
  return (
    <div
      className={`th-follow-chip ${primary ? 'th-follow-chip--primary' : ''} ${selected ? 'is-selected' : ''}`}
    >
      <button
        data-team-control
        type="button"
        className="th-chip-select"
        aria-label={`查看${team.name}动态与赛程`}
        aria-pressed={selected}
        onClick={onSelect}
      />
      <button
        data-team-control
        data-team-action
        type="button"
        className="th-chip-identity"
        aria-label={`查看${team.name}球队详情`}
        onClick={() => void openTeam(team.id, tournamentId)}
      >
        <TeamCrest team={team} interactive={false} />
        <strong>{team.name}</strong>
      </button>
    </div>
  )
}

function HorizontalFollowStrip({ children }: PropsWithChildren) {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = strip.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || element.scrollWidth <= element.clientWidth + 1) return
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      event.stopPropagation()
      element.scrollLeft += delta * units
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  return (
    <div className="th-follow-strip__scroll" ref={strip}>
      {children}
    </div>
  )
}

function SelectedTeam({
  teamId,
  tournamentId: initialTournamentId,
}: {
  teamId: string
  tournamentId: string
}) {
  const [tournamentId, setTournamentId] = useState(initialTournamentId)
  const state = useTeamData(teamId, tournamentId)
  if (state.loading && !state.data)
    return <DataState kind="loading" title="正在读取球队动态与赛程" />
  if (state.error || !state.data)
    return (
      <>
        <DataState
          kind="error"
          title="球队内容暂不可用"
          description={state.error}
          onRetry={() => void state.reload()}
        />
        {tournamentId !== initialTournamentId ? (
          <button
            data-team-control
            type="button"
            className="th-soft-button"
            onClick={() => setTournamentId(initialTournamentId)}
          >
            返回原赛事
          </button>
        ) : null}
      </>
    )
  return (
    <>
      {state.loading ? <DataState kind="loading" title="正在读取赛事数据" /> : null}
      <div style={{ display: state.loading ? 'none' : undefined }} aria-busy={state.loading}>
        <TeamContent
          data={state.data}
          competition={state.competition}
          competitionError={state.competitionError}
          tournamentId={tournamentId}
          onTournamentChange={setTournamentId}
          onReload={() => void state.reload()}
          onPostPublished={(post) =>
            state.setData((current) =>
              current ? { ...current, posts: [post, ...current.posts] } : current,
            )
          }
        />
      </div>
    </>
  )
}
