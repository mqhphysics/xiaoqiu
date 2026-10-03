import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  HOVER_PLAYER_EVENT,
  LEAVE_PLAYER_EVENT,
  OPEN_PLAYER_EVENT,
  openPlayer,
  type PlayerHoverRequest,
  type PlayerRequest,
} from '../../features/product/player-navigation.h5'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import {
  footLabel,
  formatDate,
  formatTime,
  matchStatusLabel,
  positionLabel,
} from '../../features/product/product.format'
import type {
  MessageUser,
  PlayerDetailResponse,
  PlayerFollowsResponse,
  PostSummary,
} from '../../features/product/product.types'
import { readSession } from '../../features/product/session'
import { UserAvatar, TeamCrest, PostCard } from '../product-ui'
import { useOverlayFocus } from '../overlay-focus'
import { openMessaging } from '../messaging-drawer/index.h5'
import { PostIcon } from '../post-social/icons'
import { VerificationBadge } from '../verification-badge/index.h5'
import cover from '../../assets/home-visual/home-campus-action.webp'
import './index.h5.scss'

// Presentation inputs are separate from the public API contract. Team pages can supply
// verified account/media/stat links here when those sources are available.
export interface PlayerPresentation {
  coverUrl?: string | null
  messageUser?: MessageUser | null
  posts?: PostSummary[]
  goalkeeperStats?: { saves: number | null; clearances: number | null }
  verificationLevel?: string | null
}
function playerVerification(playerId: string, presentation: PlayerPresentation) {
  if (presentation.verificationLevel) return presentation.verificationLevel
  const user = readSession()?.user
  return user?.linkedPlayer?.id === playerId ? user.verificationLevel : 'PLAYER_PROFILE'
}
type PlayerState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; player: PlayerDetailResponse }
const FOLLOW_CHANGED = 'xiaoqiu:player-follows-changed'
const pendingReads = new Map<string, Promise<PlayerDetailResponse>>()
function getPlayer(request: PlayerRequest) {
  const key = JSON.stringify([request.playerId, request.tournamentId])
  const pending = pendingReads.get(key)
  if (pending) return pending
  const read = productRepository
    .getPlayer(request.playerId, request.tournamentId)
    .finally(() => pendingReads.delete(key))
  pendingReads.set(key, read)
  return read
}
function readRequest(detail: unknown): PlayerRequest | null {
  if (
    !detail ||
    typeof detail !== 'object' ||
    !('playerId' in detail) ||
    !('tournamentId' in detail)
  )
    return null
  if (
    typeof detail.playerId !== 'string' ||
    !detail.playerId ||
    detail.playerId.length > 150 ||
    typeof detail.tournamentId !== 'string' ||
    detail.tournamentId.length > 150
  )
    return null
  return { playerId: detail.playerId, tournamentId: detail.tournamentId }
}
function usePlayer(request: PlayerRequest) {
  const [state, setState] = useState<PlayerState>({ phase: 'loading' })
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setState({ phase: 'loading' })
    void getPlayer(request)
      .then((player) => {
        if (active) setState({ phase: 'ready', player })
      })
      .catch((issue) => {
        if (active)
          setState({
            phase: 'failed',
            message: issue instanceof Error ? issue.message : '球员资料读取失败，请重试',
          })
      })
    return () => {
      active = false
    }
  }, [request.playerId, request.tournamentId, reload])
  return { state, retry: () => setReload((value) => value + 1) }
}

export function PlayerOverlayHost() {
  const [request, setRequest] = useState<PlayerRequest | null>(null)
  const [hover, setHover] = useState<PlayerHoverRequest | null>(null)
  const timers = useRef<{ enter?: number; leave?: number }>({})
  const clearTimers = useCallback(() => {
    window.clearTimeout(timers.current.enter)
    window.clearTimeout(timers.current.leave)
  }, [])
  const closeHover = useCallback(() => {
    clearTimers()
    setHover(null)
  }, [clearTimers])
  const leaveHover = useCallback(() => {
    window.clearTimeout(timers.current.enter)
    window.clearTimeout(timers.current.leave)
    timers.current.leave = window.setTimeout(() => setHover(null), 220)
  }, [])
  const keepHover = () => window.clearTimeout(timers.current.leave)
  useEffect(() => {
    const open = (event: Event) => {
      const next = readRequest((event as CustomEvent<unknown>).detail)
      if (!next || !window.matchMedia('(min-width: 721px)').matches) return
      closeHover()
      setRequest(next)
    }
    const enter = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail
      const next = readRequest(detail)
      if (
        !next ||
        !detail ||
        typeof detail !== 'object' ||
        !('anchor' in detail) ||
        !(detail.anchor instanceof HTMLElement)
      )
        return
      const anchor = detail.anchor
      clearTimers()
      timers.current.enter = window.setTimeout(() => {
        if (anchor.isConnected) setHover({ ...next, anchor })
      }, 320)
    }
    const close = () => {
      closeHover()
      setRequest(null)
    }
    const resize = () => {
      closeHover()
      if (!window.matchMedia('(min-width: 721px)').matches) setRequest(null)
    }
    window.addEventListener(OPEN_PLAYER_EVENT, open)
    window.addEventListener(HOVER_PLAYER_EVENT, enter)
    window.addEventListener(LEAVE_PLAYER_EVENT, leaveHover)
    window.addEventListener('hashchange', close)
    window.addEventListener('popstate', close)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', closeHover, true)
    return () => {
      clearTimers()
      window.removeEventListener(OPEN_PLAYER_EVENT, open)
      window.removeEventListener(HOVER_PLAYER_EVENT, enter)
      window.removeEventListener(LEAVE_PLAYER_EVENT, leaveHover)
      window.removeEventListener('hashchange', close)
      window.removeEventListener('popstate', close)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', closeHover, true)
    }
  }, [clearTimers, closeHover, leaveHover])
  return (
    <>
      {request && (
        <PlayerDialog
          key={JSON.stringify(request)}
          request={request}
          onClose={() => setRequest(null)}
        />
      )}
      {hover && !request && (
        <PlayerHoverCard
          key={JSON.stringify([hover.playerId, hover.tournamentId])}
          request={hover}
          onEnter={keepHover}
          onLeave={leaveHover}
          onClose={closeHover}
        />
      )}
    </>
  )
}

export function PlayerDialog({
  request,
  onClose,
}: {
  request: PlayerRequest
  onClose: () => void
}) {
  const { state, retry } = usePlayer(request)
  useOverlayFocus(true, '.player-dialog', onClose)
  return createPortal(
    <div
      className="player-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="player-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="球员资料"
        tabIndex={-1}
      >
        <button
          type="button"
          className="player-dialog__close"
          aria-label="关闭球员资料"
          onClick={onClose}
        >
          <PostIcon name="close" />
        </button>
        {state.phase === 'ready' ? (
          <PlayerProfile player={state.player} tournamentId={request.tournamentId} />
        ) : (
          <PlayerReadState state={state} retry={retry} />
        )}
      </section>
    </div>,
    document.body,
  )
}
function PlayerReadState({
  state,
  retry,
}: {
  state: Exclude<PlayerState, { phase: 'ready' }>
  retry: () => void
}) {
  return (
    <div className="player-read-state" role={state.phase === 'failed' ? 'alert' : 'status'}>
      <h2>{state.phase === 'loading' ? '正在读取球员资料' : '球员资料暂时不可用'}</h2>
      <p>{state.phase === 'loading' ? '球场上的每一份成长，都值得记录。' : state.message}</p>
      {state.phase === 'failed' && (
        <button type="button" className="player-button" onClick={retry}>
          重新加载
        </button>
      )}
    </div>
  )
}

export function PlayerProfile({
  player,
  tournamentId,
  presentation = {},
}: {
  player: PlayerDetailResponse
  tournamentId: string
  presentation?: PlayerPresentation
}) {
  const portrait = resolveMediaUrl(player.portraitUrl ?? player.avatarUrl)
  return (
    <>
      <header className="player-profile-hero">
        <img
          className="player-profile-hero__cover"
          src={resolveMediaUrl(presentation.coverUrl) ?? cover}
          alt=""
        />
        <div className="player-profile-hero__portrait">
          {portrait ? (
            <img src={portrait} alt={`${player.displayName}的球员照片`} />
          ) : (
            <UserAvatar name={player.displayName} color={player.profileColor} size="large" />
          )}
        </div>
        <div className="player-profile-hero__identity">
          <div className="player-profile-hero__name">
            <h1>{player.displayName}</h1>
            {player.isDemo && <span className="player-demo-label">演示档案</span>}
          </div>
          <div className="player-profile-hero__facts">
            <div>
              <strong>{player.shirtNumber ?? '待定'}</strong>
              <span>球衣号码</span>
            </div>
            <div>
              <strong>{positionLabel(player.position)}</strong>
              <span>场上位置</span>
            </div>
            {player.team && (
              <button
                type="button"
                className="player-profile-hero__team"
                onClick={() =>
                  void Taro.navigateTo({
                    url: `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(player.team!.id)}&tournamentId=${encodeURIComponent(tournamentId)}`,
                  })
                }
              >
                <TeamCrest team={player.team} size="small" />
                <div>
                  <strong>{player.team.name}</strong>
                  <span>{player.team.collegeName ?? '所属球队'}</span>
                </div>
              </button>
            )}
          </div>
          <p>{player.bio ?? '热爱足球，记录每一次上场。'}</p>
        </div>
        <div className="player-profile-hero__aside">
          <CompactStats player={player} goalkeeperStats={presentation.goalkeeperStats} />
          <PlayerActions player={player} messageUser={presentation.messageUser} />
        </div>
      </header>
      <PlayerProfileSections
        player={player}
        tournamentId={tournamentId}
        presentation={presentation}
      />
    </>
  )
}

// Reuse this component directly in the team page to start at the two tabs,
// without rendering the identity header a second time.
export function PlayerProfileSections({
  player,
  tournamentId,
  presentation = {},
}: {
  player: PlayerDetailResponse
  tournamentId: string
  presentation?: PlayerPresentation
}) {
  const [tab, setTab] = useState<'activity' | 'profile'>('activity')
  const [status, setStatus] = useState<'ALL' | 'FINISHED' | 'UPCOMING'>('ALL')
  const [ownPosts, setOwnPosts] = useState<PostSummary[]>([])
  const [postError, setPostError] = useState('')
  const [postsReload, setPostsReload] = useState(0)
  const [postsLoading, setPostsLoading] = useState(false)
  const session = readSession()
  const ownUserId = session?.user.linkedPlayer?.id === player.id ? session.user.id : null
  useEffect(() => {
    if (!ownUserId || presentation.posts) return
    let active = true
    setPostsLoading(true)
    void productRepository
      .getPosts(tournamentId)
      .then((data) => {
        if (active) {
          setOwnPosts(data.items.filter((post) => post.author.id === ownUserId))
          setPostError('')
        }
      })
      .catch((issue) => {
        if (active) setPostError(issue instanceof Error ? issue.message : '动态读取失败')
      })
      .finally(() => {
        if (active) setPostsLoading(false)
      })
    return () => {
      active = false
    }
  }, [ownUserId, presentation.posts, tournamentId, postsReload])
  const posts = presentation.posts ?? ownPosts
  const matches = player.recentMatches.filter(
    (match) =>
      status === 'ALL' ||
      (status === 'FINISHED'
        ? ['FINISHED', 'CONFIRMED'].includes(match.status)
        : ['SCHEDULED', 'CHECK_IN', 'LIVE'].includes(match.status)),
  )
  const changeTab = (next: typeof tab) => setTab(next)
  return (
    <div className="player-profile-sections">
      <div
        className="player-tabs"
        role="tablist"
        aria-label="球员资料分类"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next =
            event.key === 'Home'
              ? 'activity'
              : event.key === 'End'
                ? 'profile'
                : tab === 'activity'
                  ? 'profile'
                  : 'activity'
          changeTab(next)
          event.currentTarget
            .querySelector<HTMLButtonElement>(`[data-player-tab="${next}"]`)
            ?.focus()
        }}
      >
        <button
          type="button"
          role="tab"
          id="player-activity-tab"
          data-player-tab="activity"
          aria-controls="player-activity-panel"
          aria-selected={tab === 'activity'}
          tabIndex={tab === 'activity' ? 0 : -1}
          onClick={() => changeTab('activity')}
        >
          <PostIcon name="comment" />
          动态与数据
        </button>
        <button
          type="button"
          role="tab"
          id="player-profile-tab"
          data-player-tab="profile"
          aria-controls="player-profile-panel"
          aria-selected={tab === 'profile'}
          tabIndex={tab === 'profile' ? 0 : -1}
          onClick={() => changeTab('profile')}
        >
          <PostIcon name="photo" />
          比赛与资料
        </button>
      </div>
      {tab === 'activity' ? (
        <div
          className="player-profile-grid"
          id="player-activity-panel"
          role="tabpanel"
          aria-labelledby="player-activity-tab"
        >
          <PlayerPanel title="球员动态" note={posts.length ? `${posts.length} 条动态` : undefined}>
            {postsLoading ? (
              <div className="player-section-empty" role="status">
                正在读取球员动态
              </div>
            ) : postError ? (
              <div className="player-section-empty" role="alert">
                {postError}
                <button
                  type="button"
                  className="player-button player-button--secondary"
                  onClick={() => setPostsReload((value) => value + 1)}
                >
                  重试
                </button>
              </div>
            ) : posts.length ? (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onOpen={() =>
                    void Taro.navigateTo({
                      url: `/pages/post-detail/index?postId=${encodeURIComponent(post.id)}`,
                    })
                  }
                  onLike={() => void productRepository.setLike(post.id, !post.likedByMe)}
                />
              ))
            ) : (
              <div className="player-section-empty">
                <PostIcon name="comment" />
                <strong>
                  {ownUserId || presentation.posts ? '还没有球员动态' : '球员动态待补充'}
                </strong>
                <p>
                  {ownUserId || presentation.posts
                    ? '比赛之外，也可以分享训练与日常。'
                    : '关联账号后，这里将展示球员发布的动态。'}
                </p>
              </div>
            )}
          </PlayerPanel>
          <PlayerPanel title="球员数据" note={player.tournamentName ?? '当前赛事'}>
            <CompactStats player={player} goalkeeperStats={presentation.goalkeeperStats} />
            <StatGroup
              title="出场"
              items={[
                [player.stats.starts, '首发'],
                [player.stats.minutes, '上场分钟'],
              ]}
            />
            {player.position === 'GOALKEEPER' ? (
              <StatGroup
                title="守门"
                items={[
                  [presentation.goalkeeperStats?.saves ?? null, '扑救'],
                  [presentation.goalkeeperStats?.clearances ?? null, '解围'],
                ]}
              />
            ) : (
              <StatGroup
                title="进攻"
                items={[
                  [player.stats.goals, '进球'],
                  [player.stats.assists, '助攻'],
                ]}
              />
            )}
            <StatGroup
              title="纪律"
              items={[
                [player.stats.yellowCards, '黄牌'],
                [player.stats.redCards, '红牌'],
              ]}
            />
            <p className="player-data-note">
              {player.isDemo ? '演示赛事数据，非真实比赛统计。' : '统计来自已记录的比赛与出场。'}
              {player.position === 'GOALKEEPER' && !presentation.goalkeeperStats
                ? ' 扑救、解围暂未记录。'
                : ''}
            </p>
          </PlayerPanel>
        </div>
      ) : (
        <div
          className="player-profile-grid"
          id="player-profile-panel"
          role="tabpanel"
          aria-labelledby="player-profile-tab"
        >
          <PlayerPanel title="比赛记录" note={player.tournamentName ?? '当前赛事'}>
            <div className="player-match-filters" aria-label="比赛状态筛选">
              {(
                [
                  ['ALL', '全部'],
                  ['FINISHED', '已结束'],
                  ['UPCOMING', '未结束'],
                ] as const
              ).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={status === key}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="player-match-list">
              {matches.length ? (
                matches.map((match) => (
                  <button
                    type="button"
                    className="player-match-record"
                    key={match.id}
                    onClick={() =>
                      void Taro.navigateTo({
                        url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(match.id)}`,
                      })
                    }
                  >
                    <div className="player-match-record__meta">
                      <span
                        className={`player-match-status ${['FINISHED', 'CONFIRMED'].includes(match.status) ? 'is-finished' : ''}`}
                      >
                        {matchStatusLabel(match.status)}
                      </span>
                      <span>{match.title}</span>
                      <span>
                        {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
                      </span>
                      <span>{match.venue?.name ?? '场地待定'}</span>
                    </div>
                    <div className="player-match-record__teams">
                      <div>
                        <TeamCrest team={match.homeTeam} size="small" />
                        <strong>{match.homeTeam?.shortName ?? '待定'}</strong>
                      </div>
                      <b>
                        {match.homeScore !== null && match.awayScore !== null
                          ? `${match.homeScore} : ${match.awayScore}`
                          : 'VS'}
                      </b>
                      <div>
                        <TeamCrest team={match.awayTeam} size="small" />
                        <strong>{match.awayTeam?.shortName ?? '待定'}</strong>
                      </div>
                    </div>
                    <div className="player-match-record__appearance">
                      <strong>
                        {match.minutesPlayed}
                        <small> 分钟</small>
                      </strong>
                      <span>{match.starter ? '首发出场' : '替补出场'}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="player-section-empty">
                  <strong>暂无符合筛选的比赛</strong>
                  <p>这里展示已记录的最近出场，未确认的参赛安排暂不展示。</p>
                </div>
              )}
            </div>
          </PlayerPanel>
          <div className="player-profile-grid__right">
            <PlayerPanel title="能力值">
              <PlayerAbilities player={player} />
            </PlayerPanel>
            <PlayerPanel title="球员资料">
              <dl className="player-facts">
                {[
                  ['所属球队', player.team?.name ?? '暂无球队'],
                  ['场上位置', positionLabel(player.position)],
                  ['球衣号码', player.shirtNumber ?? '未填写'],
                  ['惯用脚', footLabel(player.dominantFoot)],
                  ['身高', player.heightCm ? `${player.heightCm} cm` : '未填写'],
                  ['年级', player.academicYear ?? '未填写'],
                  ['专业', player.major ?? '未填写'],
                  ['家乡', player.hometown ?? '未填写'],
                  ...(player.secondaryPosition
                    ? [['第二位置', positionLabel(player.secondaryPosition)]]
                    : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </PlayerPanel>
          </div>
        </div>
      )}
    </div>
  )
}
function PlayerPanel({
  title,
  note,
  children,
}: {
  title: string
  note?: string | undefined
  children: ReactNode
}) {
  return (
    <section className="player-panel">
      <div className="player-panel__head">
        <h2>{title}</h2>
        {note && <span>{note}</span>}
      </div>
      {children}
    </section>
  )
}
function StatGroup({ title, items }: { title: string; items: Array<[number | null, string]> }) {
  return (
    <section className="player-stat-group">
      <h3>{title}</h3>
      <div>
        {items.map(([value, label]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value ?? '待记录'}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
function CompactStats({
  player,
  goalkeeperStats,
}: {
  player: PlayerDetailResponse
  goalkeeperStats?: PlayerPresentation['goalkeeperStats']
}) {
  const items: Array<[number | null, string]> =
    player.position === 'GOALKEEPER'
      ? [
          [player.stats.appearances, '出场'],
          [goalkeeperStats?.saves ?? null, '扑救'],
          [goalkeeperStats?.clearances ?? null, '解围'],
        ]
      : [
          [player.stats.appearances, '出场'],
          [player.stats.goals, '进球'],
          [player.stats.assists, '助攻'],
        ]
  return (
    <div className="player-compact-stats">
      {items.map(([value, label]) => (
        <div key={label}>
          <strong>{value ?? '待记录'}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
function PlayerAbilities({ player }: { player: PlayerDetailResponse }) {
  const dimensions = [
    ['shooting', '射门', player.abilities.shooting],
    ['dribbling', '盘带', player.abilities.dribbling],
    ['speed', '速度', player.abilities.speed],
    ['passing', '传球', player.abilities.passing],
    ['defending', '防守', player.abilities.defending],
  ] as const
  const point = (index: number, ratio: number) => {
    const angle = ((-90 + index * 72) * Math.PI) / 180
    return [110 + Math.cos(angle) * 73 * ratio, 105 + Math.sin(angle) * 73 * ratio]
  }
  const polygon = (ratio: number) =>
    dimensions.map((_, index) => point(index, ratio).join(',')).join(' ')
  return (
    <>
      <div className="player-abilities-layout">
        <svg
          className="player-ability-radar"
          viewBox="0 0 220 220"
          role="img"
          aria-label="射门、盘带、速度、传球、防守五维能力图"
        >
          {[1, 0.66, 0.33].map((ratio) => (
            <polygon key={ratio} points={polygon(ratio)} fill="none" stroke="#d9e3dd" />
          ))}
          {dimensions.map(([key], index) => (
            <line
              key={key}
              x1="110"
              y1="105"
              x2={point(index, 1)[0]}
              y2={point(index, 1)[1]}
              stroke="#d9e3dd"
            />
          ))}
          {dimensions.every(([, , value]) => value !== null) && (
            <polygon
              points={dimensions
                .map(([, , value], index) =>
                  point(index, Math.min(100, Math.max(0, value ?? 0)) / 100).join(','),
                )
                .join(' ')}
              fill="rgba(31,107,69,.2)"
              stroke="#1f6b45"
              strokeWidth="2"
            />
          )}
          {dimensions.map(([key, label], index) => (
            <text
              key={key}
              x={point(index, 1.29)[0]}
              y={point(index, 1.29)[1]}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label}
            </text>
          ))}
        </svg>
        <div className="player-ability-values">
          {dimensions.map(([key, label, value]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>{value ?? '待评估'}</strong>
            </div>
          ))}
        </div>
      </div>
      <p className="player-data-note">
        {player.isDemo
          ? '能力值为演示生成值，非实际测评。'
          : '能力值为球员档案资料，不等同于比赛统计。'}
      </p>
    </>
  )
}
function PlayerActions({
  player,
  messageUser,
}: {
  player: PlayerDetailResponse
  messageUser?: MessageUser | null | undefined
}) {
  const session = readSession()
  const [followed, setFollowed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [known, setKnown] = useState(!session)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    if (!session) return
    void productRepository
      .getPlayerFollows()
      .then((data) => {
        if (active) {
          setFollowed(data.items.some((item) => item.id === player.id))
          setKnown(true)
          setError('')
        }
      })
      .catch(() => {
        if (active) setError('关注状态读取失败，请重试')
      })
    const changed = (event: Event) => {
      const data = (event as CustomEvent<PlayerFollowsResponse>).detail
      setFollowed(data.items.some((item) => item.id === player.id))
      setKnown(true)
    }
    window.addEventListener(FOLLOW_CHANGED, changed)
    return () => {
      active = false
      window.removeEventListener(FOLLOW_CHANGED, changed)
    }
  }, [player.id, session?.user.id, reload])
  const toggle = async () => {
    if (!session) {
      await Taro.showToast({ title: '登录后可以关注球员', icon: 'none' })
      return
    }
    if (!known) {
      setError('')
      setReload((value) => value + 1)
      return
    }
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const data = await (followed
        ? productRepository.unfollowPlayer(player.id)
        : productRepository.followPlayer(player.id))
      window.dispatchEvent(new CustomEvent(FOLLOW_CHANGED, { detail: data }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '关注失败，请重试')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <div className="player-actions-wrap">
      <div className="player-actions">
        <button
          type="button"
          className={`player-button ${followed ? 'player-button--followed' : ''}`}
          aria-pressed={followed}
          disabled={busy || (!known && !error)}
          onClick={() => void toggle()}
        >
          <PostIcon name={followed ? 'heart' : 'plus'} />
          {busy
            ? '处理中'
            : followed
              ? '已关注'
              : !known
                ? error
                  ? '重试关注状态'
                  : '读取中'
                : '关注'}
        </button>
        <button
          type="button"
          className="player-button player-button--secondary"
          title={messageUser ? undefined : '选择校内账号开始私聊'}
          onClick={() => {
            if (!session) {
              void Taro.showToast({ title: '登录后可以发消息', icon: 'none' })
              return
            }
            openMessaging(messageUser ?? { chooseRecipient: true })
          }}
        >
          <PostIcon name="comment" />
          发消息
        </button>
      </div>
      {error && (
        <span className="player-action-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
export function PlayerHoverCard({
  request,
  onEnter,
  onLeave,
  onClose,
  presentation = {},
}: {
  request: PlayerHoverRequest
  onEnter: () => void
  onLeave: () => void
  onClose: () => void
  presentation?: PlayerPresentation
}) {
  const { state, retry } = usePlayer(request)
  const rect = request.anchor.getBoundingClientRect()
  const width = Math.min(358, window.innerWidth - 32)
  const left = Math.max(16, Math.min(rect.left - 20, window.innerWidth - width - 16))
  const top =
    rect.bottom + 12 + 272 <= window.innerHeight ? rect.bottom + 12 : Math.max(16, rect.top - 284)
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      }
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest('.player-hover-card') &&
        !request.anchor.contains(event.target)
      )
        onClose()
    }
    document.addEventListener('keydown', escape, true)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', escape, true)
      document.removeEventListener('pointerdown', outside)
    }
  }, [onClose, request.anchor])
  return createPortal(
    <aside
      className="player-hover-card"
      aria-label="球员信息预览"
      style={{ left, top, width }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onLeave()
      }}
    >
      <div className="player-hover-card__cover">
        <img src={resolveMediaUrl(presentation.coverUrl) ?? cover} alt="" />
      </div>
      {state.phase === 'ready' ? (
        <PersonHoverPreview
          name={state.player.displayName}
          avatarUrl={state.player.avatarUrl}
          color={state.player.profileColor}
          meta={`${state.player.team?.name ?? '暂无球队'} · ${positionLabel(state.player.position)}${state.player.shirtNumber ? ` · ${state.player.shirtNumber}号` : ''}`}
          verificationLevel={playerVerification(state.player.id, presentation)}
          onOpen={() => void openPlayer(request.playerId, request.tournamentId)}
          stats={
            <CompactStats player={state.player} goalkeeperStats={presentation.goalkeeperStats} />
          }
          actions={<PlayerActions player={state.player} messageUser={presentation.messageUser} />}
        />
      ) : (
        <PlayerReadState state={state} retry={retry} />
      )}
    </aside>,
    document.body,
  )
}

// Reusable identity body: student/staff callers omit stats entirely.
export function PersonHoverPreview({
  name,
  avatarUrl,
  color,
  meta,
  verificationLevel,
  onOpen,
  stats,
  actions,
}: {
  name: string
  avatarUrl?: string | null | undefined
  color?: string | null | undefined
  meta?: string | undefined
  verificationLevel?: string | null | undefined
  onOpen: () => void
  stats?: ReactNode
  actions: ReactNode
}) {
  return (
    <div className="player-hover-card__body">
      <div className="player-hover-card__identity">
        <button
          type="button"
          className="player-hover-card__avatar"
          aria-label={`查看${name}的资料`}
          onClick={onOpen}
        >
          <UserAvatar
            name={name}
            {...(avatarUrl ? { avatarUrl } : {})}
            {...(color ? { color } : {})}
            size="large"
          />
        </button>
        <div>
          <div className="player-hover-card__name-row">
            <button type="button" className="player-hover-card__name" onClick={onOpen}>
              {name}
            </button>
            <VerificationBadge level={verificationLevel} />
          </div>
          {meta && <span className="player-hover-card__meta">{meta}</span>}
        </div>
      </div>
      {stats}
      {actions}
    </div>
  )
}
