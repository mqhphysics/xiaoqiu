import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { productRepository } from '../../features/product/product.repository'
import { positionLabel } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import type {
  PlayerFollowsResponse,
  SearchResponse,
  TeamPreferencesResponse,
  TeamSummary,
} from '../../features/product/product.types'
import { TeamCrest, UserAvatar } from '../product-ui'
import { useOverlayFocus } from '../overlay-focus'
import { TeamIcon } from './icons.h5'
import { publishPreferences } from './picker.h5'
import { saveTeamPreference } from './follow.h5'
import {
  SpringReorderList,
  type ReorderHandleProps,
} from '../interactions/spring-reorder-list.h5'
import {
  applyOrder,
  readFollowOrder,
  writeFollowOrder,
  type FollowOrder,
} from '../interactions/follow-order.h5'
import '../interactions/interactions.h5.scss'

type SuggestPlayer = {
  id: string
  displayName: string
  position: string | null
  avatarUrl: string | null
  teamName: string | null
}

function userId(): string {
  return readSession()?.user.id ?? ''
}

function remember(order: FollowOrder) {
  const id = userId()
  if (id) writeFollowOrder(id, order)
}

export function FollowBoard({
  initialPhase,
  preferences,
  players,
  teams,
  tournamentId,
  onClose,
  onTeams,
  onPlayers,
}: {
  initialPhase: 'order' | 'add'
  preferences: TeamPreferencesResponse
  players: PlayerFollowsResponse
  teams: TeamSummary[]
  tournamentId: string
  onClose: () => void
  onTeams: (value: TeamPreferencesResponse) => void
  onPlayers: (value: PlayerFollowsResponse) => void
}) {
  const [phase, setPhase] = useState(initialPhase)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [suggestedPlayers, setSuggestedPlayers] = useState<SuggestPlayer[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tail = useRef(Promise.resolve())
  const locked = useRef(false)
  const close = () => {
    if (!locked.current) onClose()
  }
  useOverlayFocus(true, '.th-follow-board', close)

  useEffect(() => {
    if (initialPhase === 'add') inputRef.current?.focus()
  }, [initialPhase])

  useEffect(() => {
    const text = query.trim()
    if (phase !== 'add' || text.length < 1) {
      setResults(null)
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void productRepository
        .search(text, 'ALL', tournamentId)
        .then((data) => {
          if (active) setResults(data)
        })
        .catch((issue) => {
          if (active) setError(issue instanceof Error ? issue.message : '搜索失败')
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [phase, query, tournamentId])

  useEffect(() => {
    if (phase !== 'add' || query.trim() || !preferences.primaryTeam) {
      setSuggestedPlayers([])
      return
    }
    let active = true
    void productRepository
      .getTeamDashboard(preferences.primaryTeam.id, tournamentId)
      .then((dashboard) => {
        if (!active) return
        setSuggestedPlayers(
          dashboard.roster.slice(0, 8).map((player) => ({
            id: player.id,
            displayName: player.displayName,
            position: player.position,
            avatarUrl: player.avatarUrl,
            teamName: preferences.primaryTeam?.name ?? null,
          })),
        )
      })
      .catch(() => {
        if (active) setSuggestedPlayers([])
      })
    return () => {
      active = false
    }
  }, [phase, query, preferences.primaryTeam, tournamentId])

  const enqueue = (task: () => Promise<void>) => {
    tail.current = tail.current.then(task, task)
  }

  const followedTeamIds = new Set(preferences.followedTeams.map((team) => team.id))
  const primaryId = preferences.primaryTeam?.id ?? ''
  const followedPlayerIds = new Set(players.items.map((player) => player.id))

  const commitTeams = (next: TeamSummary[]) => {
    const id = userId()
    const previous = readFollowOrder(id)
    const order = { ...previous, teams: next.map((team) => team.id) }
    remember(order)
    onTeams({ ...preferences, followedTeams: next })
    if (!primaryId) return
    enqueue(async () => {
      locked.current = true
      setError('')
      try {
        const saved = await productRepository.updateTeamPreferences(
          primaryId,
          order.teams.filter((teamId) => teamId !== primaryId),
        )
        const ordered = applyOrder(saved.followedTeams, order.teams)
        remember({ ...readFollowOrder(id), teams: ordered.map((team) => team.id) })
        const published = { ...saved, followedTeams: ordered }
        publishPreferences(published)
        onTeams(published)
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : '顺序保存失败')
      } finally {
        locked.current = false
      }
    })
  }

  const commitPlayers = (next: PlayerFollowsResponse['items']) => {
    const id = userId()
    const order = { ...readFollowOrder(id), players: next.map((player) => player.id) }
    remember(order)
    onPlayers({ items: next })
  }

  const toggleTeam = (teamId: string) => {
    if (teamId === primaryId || busy) return
    setBusy(teamId)
    setError('')
    enqueue(async () => {
      locked.current = true
      try {
        const saved = await saveTeamPreference(teamId, 'follow')
        const id = userId()
        const order = readFollowOrder(id)
        const ordered = applyOrder(saved.followedTeams, order.teams)
        remember({ ...order, teams: ordered.map((team) => team.id) })
        onTeams({ ...saved, followedTeams: ordered })
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : '关注保存失败')
      } finally {
        locked.current = false
        setBusy(null)
      }
    })
  }

  const togglePlayer = (playerId: string) => {
    if (busy) return
    setBusy(playerId)
    setError('')
    enqueue(async () => {
      locked.current = true
      try {
        const saved = followedPlayerIds.has(playerId)
          ? await productRepository.unfollowPlayer(playerId)
          : await productRepository.followPlayer(playerId)
        const id = userId()
        const order = readFollowOrder(id)
        const ordered = applyOrder(saved.items, order.players)
        remember({ ...order, players: ordered.map((player) => player.id) })
        onPlayers({ items: ordered })
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : '关注保存失败')
      } finally {
        locked.current = false
        setBusy(null)
      }
    })
  }

  const back = () => {
    setQuery('')
    setResults(null)
    setPhase('order')
    inputRef.current?.blur()
  }

  const suggestedTeams = [...teams]
    .sort((a, b) => Number(followedTeamIds.has(a.id)) - Number(followedTeamIds.has(b.id)))
    .slice(0, 8)
  const typed = query.trim().length > 0
  const resultTeams = results?.teams ?? []
  const resultPlayers: SuggestPlayer[] = (results?.players ?? []).map((player) => ({
    id: player.id,
    displayName: player.displayName,
    position: player.position,
    avatarUrl: player.avatarUrl,
    teamName: player.team?.name ?? null,
  }))

  return createPortal(
    <div
      className="th-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className="th-follow-board th-picker th-root xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="th-follow-board-title"
      >
        <div className="th-heading xq-dialog__header">
          <div>
            <h2 id="th-follow-board-title">我的关注</h2>
            <p className="th-small-note">拖动调整顺序，或搜索后关注球队和球员。</p>
          </div>
          <button
            data-team-control
            type="button"
            className="th-icon-button"
            aria-label="关闭关注"
            onClick={close}
          >
            <TeamIcon name="close" />
          </button>
        </div>
        <div className="th-search th-follow-board__search">
          {phase === 'add' ? (
            <button
              data-team-control
              type="button"
              className="th-follow-board__back"
              aria-label="返回关注列表"
              onClick={back}
            >
              <TeamIcon name="arrow" />
            </button>
          ) : null}
          <input
            ref={inputRef}
            data-team-control
            data-xq-bare=""
            aria-label="搜索球队或球员"
            placeholder="搜索球队或球员"
            value={query}
            onFocus={() => setPhase('add')}
            onChange={(event) => {
              setPhase('add')
              setQuery(event.target.value)
            }}
          />
        </div>
        <div className="th-picker__list">
          {error ? (
            <p className="th-inline-error" role="alert">
              {error}
            </p>
          ) : null}
          {phase === 'order' ? (
            <>
              <section className="th-follow-board__section" aria-label="关注的球队">
                <h3>关注的球队</h3>
                {preferences.followedTeams.length ? (
                  <SpringReorderList
                    items={preferences.followedTeams}
                    label="关注的球队"
                    onReorder={commitTeams}
                    renderRow={(team, index, controls) => (
                      <ReorderRow
                        title={team.name}
                        meta={team.collegeName ?? '校园球队'}
                        crest={<TeamCrest team={team} interactive={false} />}
                        index={index}
                        count={preferences.followedTeams.length}
                        dragging={controls.dragging}
                        handleProps={controls.handleProps}
                        moveUp={controls.moveUp}
                        moveDown={controls.moveDown}
                      />
                    )}
                  />
                ) : (
                  <p className="th-small-note">还没有关注球队。点上方搜索框添加。</p>
                )}
              </section>
              <section className="th-follow-board__section" aria-label="关注的球员">
                <h3>关注的球员</h3>
                {players.items.length ? (
                  <SpringReorderList
                    items={players.items}
                    label="关注的球员"
                    onReorder={commitPlayers}
                    renderRow={(player, index, controls) => (
                      <ReorderRow
                        title={player.displayName}
                        meta={`${positionLabel(player.position)} · ${player.team?.name ?? '球队未登记'}`}
                        crest={
                          <UserAvatar
                            name={player.displayName}
                            avatarUrl={player.avatarUrl}
                            size="small"
                          />
                        }
                        index={index}
                        count={players.items.length}
                        dragging={controls.dragging}
                        handleProps={controls.handleProps}
                        moveUp={controls.moveUp}
                        moveDown={controls.moveDown}
                      />
                    )}
                  />
                ) : (
                  <p className="th-small-note">还没有关注球员。点上方搜索框添加。</p>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="th-follow-board__section">
                <h3>{typed ? (searching ? '正在搜索…' : '球队') : '推荐球队'}</h3>
                {(typed ? resultTeams : suggestedTeams).map((team) => (
                  <SuggestRow
                    key={team.id}
                    title={team.name}
                    meta={team.collegeName ?? '校园球队'}
                    crest={<TeamCrest team={team} interactive={false} />}
                    action={
                      team.id === primaryId
                        ? '主队'
                        : busy === team.id
                          ? '保存中…'
                          : followedTeamIds.has(team.id)
                            ? '已关注'
                            : '关注'
                    }
                    disabled={Boolean(busy) || team.id === primaryId}
                    onAction={() => toggleTeam(team.id)}
                  />
                ))}
                {typed && !searching && resultTeams.length === 0 ? (
                  <p className="th-small-note">没有匹配的球队。</p>
                ) : null}
              </section>
              <section className="th-follow-board__section">
                <h3>{typed ? '球员' : '推荐球员'}</h3>
                {(typed ? resultPlayers : suggestedPlayers).map((player) => (
                  <SuggestRow
                    key={player.id}
                    title={player.displayName}
                    meta={`${positionLabel(player.position)} · ${player.teamName ?? '球队未登记'}`}
                    crest={
                      <UserAvatar
                        name={player.displayName}
                        avatarUrl={player.avatarUrl}
                        size="small"
                      />
                    }
                    action={
                      busy === player.id
                        ? '保存中…'
                        : followedPlayerIds.has(player.id)
                          ? '已关注'
                          : '关注'
                    }
                    disabled={Boolean(busy)}
                    onAction={() => togglePlayer(player.id)}
                  />
                ))}
                {!typed && !preferences.primaryTeam ? (
                  <p className="th-small-note">先设置主队，这里会推荐队内球员。也可以直接输入姓名搜索。</p>
                ) : null}
                {typed && !searching && resultPlayers.length === 0 ? (
                  <p className="th-small-note">没有匹配的球员。</p>
                ) : null}
              </section>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function SuggestRow({
  title,
  meta,
  crest,
  action,
  disabled,
  onAction,
}: {
  title: string
  meta: string
  crest: ReactNode
  action: string
  disabled: boolean
  onAction: () => void
}) {
  return (
    <div className="th-follow-suggest">
      {crest}
      <span className="th-follow-suggest__copy">
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <button
        data-team-control
        type="button"
        className="th-soft-button"
        disabled={disabled}
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  )
}

function ReorderRow({
  title,
  meta,
  crest,
  index,
  count,
  dragging,
  handleProps,
  moveUp,
  moveDown,
}: {
  title: string
  meta: string
  crest: ReactNode
  index: number
  count: number
  dragging: boolean
  handleProps: ReorderHandleProps
  moveUp: () => void
  moveDown: () => void
}) {
  return (
    <div className={`xq-reorder-card ${dragging ? 'is-lifted' : ''}`}>
      <button
        type="button"
        className="xq-reorder-grip"
        aria-label={`拖动调整${title}的顺序`}
        {...handleProps}
      >
        <i />
        <i />
        <i />
      </button>
      {crest}
      <span className="xq-reorder-copy">
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <span className="xq-reorder-move">
        <button
          type="button"
          aria-label={`上移${title}`}
          disabled={index === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={moveUp}
        >
          上移
        </button>
        <button
          type="button"
          aria-label={`下移${title}`}
          disabled={index === count - 1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={moveDown}
        >
          下移
        </button>
      </span>
    </div>
  )
}
