import Taro from '@tarojs/taro'
import { openTeam as openTeamDetail } from '../../features/product/team-navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AvatarCropper } from '../../components/avatar-cropper'
import {
  MediaAccountEntry,
  MediaUploadButton,
  usePersonalBackground,
} from '../../features/managed-media/index.h5'
import { SettingsDialog } from '../../components/settings-dialog'
import { identityEntryActions } from '../../features/identity/entry-actions.h5'
import { DesktopPostComposer } from '../../components/post-composer'
import { useOverlayFocus } from '../../components/overlay-focus'
import { openMessaging } from '../../components/messaging-drawer'
import { TeamCrest, TeamName, UserAvatar } from '../../components/product-ui'
import { PostTags } from '../../components/post-tags'
import { openPlayer } from '../../features/product/player-navigation'
import { PersonTrigger } from '../../components/person-trigger'
import { VerificationBadge } from '../../components/verification-badge'
import { BadgeManager } from '../../components/badge-manager/index.h5'
import { ReactionHeart } from '../../components/reaction-heart'
import { displayedBadgeKind, identityLabels } from '../../features/product/identity-badges'
import { updateBadgeDisplay, useBadgeDisplay } from '../../features/product/badge-display.h5'
import { DataState } from '../../components/public-ui'
import { updatePrimaryTeamCache } from '../../components/public-shell'
import { ReportModal } from '../../components/report-modal'
import { captainRequest } from '../../features/captain-roster/roster.repository'
import {
  openPost,
  updatePostInteraction,
  usePostInteraction,
} from '../../features/product/post-navigation'
import {
  formatDate,
  formatTime,
  matchStatusLabel,
  roleLabel,
  verificationLabel,
} from '../../features/product/product.format'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import type {
  MatchSummary,
  PostSummary,
  TeamDashboardResponse,
  TeamPreferencesResponse,
} from '../../features/product/product.types'
import { ProfileIcon, type ProfileIconName } from './profile-icons.h5'
import {
  calendarEvent,
  canRemind,
  emptyLibrary,
  isPendingMatch,
  libraryKey,
  managedTeamIds,
  parseLibrary,
  type ProfileLibrary,
} from './profile.logic'
import type { DesktopProfileProps, ProfileService } from './desktop-profile'
import './desktop-profile.h5.scss'
import { TeamRelationsDialog } from './team-relations.h5'

type Tab = 'posts' | 'matches' | 'bookmarks'
type Modal =
  | 'edit'
  | 'team'
  | 'relationship'
  | 'follow'
  | 'collect'
  | 'identity'
  | 'badge'
  | 'logout'
  | ProfileService
  | null
const SERVICE_TITLES: Record<ProfileService, string> = {
  notifications: '我的通知',
  reports: '我的反馈记录',
  adminReports: '投诉处理台',
  identities: '实名账号目录',
}
const toastError = (error: unknown) =>
  void Taro.showToast({
    title: error instanceof Error ? error.message : '操作失败，请重试',
    icon: 'none',
  })
const matchUrl = (id: string) =>
  `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(id)}`

export function useDesktopProfile() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const change = () => setDesktop(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return desktop
}

function useProfileLibrary(key: string) {
  const [library, setLibrary] = useState<ProfileLibrary>(emptyLibrary)
  const [error, setError] = useState('')
  useEffect(() => {
    const read = () => {
      try {
        setLibrary(parseLibrary(localStorage.getItem(key)))
        setError('')
      } catch {
        setError('本机关注和收藏读取失败，请检查浏览器存储权限。')
      }
    }
    read()
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) read()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])
  const toggle = (field: Exclude<keyof ProfileLibrary, 'version'>, id: string) => {
    try {
      // Read the latest browser value so another tab's choices are retained.
      const current = parseLibrary(localStorage.getItem(key))
      const ids = current[field]
      const next = {
        ...current,
        [field]: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
      }
      localStorage.setItem(key, JSON.stringify(next))
      setLibrary(next)
      setError('')
      return true
    } catch {
      setError('保存失败：请允许此网站使用浏览器存储后重试。')
      return false
    }
  }
  return { library, error, toggle }
}

export function DesktopProfile({ home, user, onUserChange, renderService }: DesktopProfileProps) {
  useEffect(() => {
    const changed = (event: Event) => {
      const updated = (event as CustomEvent<DesktopProfileProps['user']>).detail
      if (updated.id === user.id && updated.organizationId === user.organizationId)
        onUserChange(updated)
    }
    window.addEventListener('xiaoqiu:identity:changed', changed)
    return () => window.removeEventListener('xiaoqiu:identity:changed', changed)
  }, [user.id, user.organizationId, onUserChange])
  const personalBackground = usePersonalBackground(user.id)
  const displayedKind = useBadgeDisplay(user.id)
  const badgeKind = displayedBadgeKind(user.verificationLevel, user.roles, false, displayedKind)
  useEffect(() => {
    let active = true
    void productRepository
      .getBadgePreference()
      .then((result) => {
        if (active) updateBadgeDisplay(user.id, result.displayedKind)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [user.id, user.organizationId])
  const [tab, setTab] = useState<Tab>('posts')
  const [modal, setModal] = useState<Modal>(null)
  const [avatar, setAvatar] = useState(false)
  const [feedback, setFeedback] = useState(false)
  const [composer, setComposer] = useState(false)
  const [settings, setSettings] = useState(false)
  const [reminder, setReminder] = useState<MatchSummary | null>(null)
  const [preferences, setPreferences] = useState<TeamPreferencesResponse | null>(null)
  const [dashboard, setDashboard] = useState<TeamDashboardResponse | null>(null)
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [seasonPostIds, setSeasonPostIds] = useState<string[]>([])
  const [schedule, setSchedule] = useState<MatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState('')
  const [query, setQuery] = useState('')
  const [matchFilter, setMatchFilter] = useState<'all' | 'pending' | 'finished'>('all')
  const [missingBookmarks, setMissingBookmarks] = useState<string[]>([])
  const epoch = useRef(0)
  const actionBusy = useRef(false)
  const { library, error: storageError, toggle } = useProfileLibrary(libraryKey(user))
  const primary = preferences?.primaryTeam ?? null
  const teams = home.teams
  const authorizedIds = managedTeamIds(
    user,
    teams.map((team) => team.id),
  )
  const isAdmin = user.roles.some(
    (role) =>
      role.role === 'PLATFORM_ADMIN' ||
      (role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId === user.organizationId),
  )
  const ownPosts = posts.filter(
    (post) => post.author.id === user.id && seasonPostIds.includes(post.id),
  )
  const bookmarkedPosts = posts.filter((post) => library.bookmarkedPostIds.includes(post.id))
  const watchedTeamIds = new Set([
    primary?.id,
    ...(preferences?.followedTeams.map((team) => team.id) ?? []),
  ])
  const followedMatches = schedule.filter(
    (match) =>
      library.followedMatchIds.includes(match.id) ||
      Boolean(
        (match.homeTeam && watchedTeamIds.has(match.homeTeam.id)) ||
        (match.awayTeam && watchedTeamIds.has(match.awayTeam.id)),
      ),
  )
  const visibleMatches = followedMatches
    .filter(
      (match) =>
        matchFilter === 'all' ||
        (matchFilter === 'pending' ? isPendingMatch(match) : !isPendingMatch(match)),
    )
    .sort((a, b) => (b.scheduledStartAt ?? '').localeCompare(a.scheduledStartAt ?? ''))

  const load = useCallback(async () => {
    const requestId = ++epoch.current
    setLoading(true)
    const results = await Promise.allSettled([
      productRepository.getTeamPreferences(),
      captainRequest<{ items: PostSummary[] }>(
        `/public/posts?tournamentId=${encodeURIComponent(home.tournament.id)}`,
      ),
      productRepository.getCompetitionData(home.tournament.id),
    ])
    if (requestId !== epoch.current) return
    const issues: Record<string, string> = {}
    const [teamResult, postResult, matchResult] = results
    if (teamResult.status === 'fulfilled') {
      setPreferences(teamResult.value)
      updatePrimaryTeamCache(teamResult.value.primaryTeam)
    } else
      issues.team = teamResult.reason instanceof Error ? teamResult.reason.message : '主队读取失败'
    if (postResult.status === 'fulfilled') {
      setPosts(postResult.value.items)
      setSeasonPostIds(postResult.value.items.map((post) => post.id))
    } else
      issues.posts = postResult.reason instanceof Error ? postResult.reason.message : '动态读取失败'
    if (matchResult.status === 'fulfilled') setSchedule(matchResult.value.schedule)
    else
      issues.matches =
        matchResult.reason instanceof Error ? matchResult.reason.message : '赛程读取失败'
    setErrors(issues)
    setLoading(false)
  }, [home.tournament.id])
  useEffect(() => {
    void load()
    return () => {
      epoch.current += 1
    }
  }, [load])
  useEffect(() => {
    const closeOverlays = () => {
      setModal(null)
      setReminder(null)
      setAvatar(false)
      setFeedback(false)
      setComposer(false)
      setSettings(false)
    }
    window.addEventListener('hashchange', closeOverlays)
    return () => window.removeEventListener('hashchange', closeOverlays)
  }, [])
  useEffect(() => {
    let active = true
    setDashboard(null)
    if (primary)
      void productRepository
        .getTeamDashboard(primary.id, home.tournament.id)
        .then((data) => {
          if (active) setDashboard(data)
        })
        .catch(() => {
          /* The main team data remains available without a motto. */
        })
    return () => {
      active = false
    }
  }, [primary?.id, home.tournament.id])
  useEffect(() => {
    let active = true
    const missing = library.bookmarkedPostIds.filter((id) => !posts.some((post) => post.id === id))
    if (loading || errors.posts || !missing.length) {
      setMissingBookmarks([])
      return
    }
    void Promise.allSettled(missing.map((id) => productRepository.getPost(id))).then((results) => {
      if (!active) return
      const found: PostSummary[] = []
      const unavailable: string[] = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') found.push(result.value)
        else unavailable.push(missing[index]!)
      })
      if (found.length)
        setPosts((current) => [
          ...current,
          ...found.filter((post) => !current.some((item) => item.id === post.id)),
        ])
      setMissingBookmarks(unavailable)
    })
    return () => {
      active = false
    }
  }, [library.bookmarkedPostIds, posts, loading, errors.posts])

  const openModal = (value: Modal) => {
    setQuery('')
    setSelectedTeam(primary?.id ?? '')
    setModal(value)
  }
  const openTeam = (teamId: string) => {
    setModal(null)
    void openTeamDetail(teamId, home.tournament.id).catch(toastError)
  }
  const saveTeam = async () => {
    if (!selectedTeam || actionBusy.current) return
    actionBusy.current = true
    setBusy(true)
    try {
      const updated = await productRepository.updateTeamPreferences(
        selectedTeam,
        preferences?.followedTeams.map((team) => team.id).filter((id) => id !== selectedTeam) ?? [],
      )
      setPreferences(updated)
      updatePrimaryTeamCache(updated.primaryTeam)
      setModal(null)
      void Taro.showToast({ title: '主队已更新', icon: 'success' })
    } catch (error) {
      toastError(error)
    } finally {
      actionBusy.current = false
      setBusy(false)
    }
  }
  const logout = async () => {
    if (actionBusy.current) return
    actionBusy.current = true
    setBusy(true)
    try {
      await productRepository.logout()
    } catch {
      /* The repository clears the local session. */
    } finally {
      await Taro.reLaunch({ url: '/pages/login/index' })
    }
  }
  const closeModal = () => {
    if (!actionBusy.current) setModal(null)
  }
  const chooseTab = (value: Tab) => {
    setTab(value)
    document.getElementById('profile-stream')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    })
  }

  return (
    <div className="desktop-profile">
      <div className="profile-backdrop" aria-hidden="true">
        <div className="profile-backdrop__stadium" />
        <span>
          MORE
          <br />
          THAN
          <br />A<br />
          GAME
        </span>
      </div>
      <div className="profile-top">
        <section className="profile-person profile-surface" aria-label="个人资料">
          {personalBackground ? (
            <img
              className="profile-personal-background"
              src={personalBackground}
              alt="个人背景"
              loading="lazy"
            />
          ) : null}
          <div className="profile-background-change">
            <MediaUploadButton
              purpose="USER_BACKGROUND"
              targetId={user.id}
              label="更换背景"
              compact
            />
          </div>
          <div className="profile-person__main">
            <button
              data-profile-button=""
              className="profile-person__avatar"
              aria-label="更换头像"
              onClick={() => setAvatar(true)}
            >
              <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="large" />
              <span>
                <ProfileIcon name="pencil" />
                更换头像
              </span>
            </button>
            <div className="profile-person__copy">
              <h1>
                <PersonTrigger userId={user.id} name={user.displayName}>
                  {user.displayName}
                </PersonTrigger>
              </h1>
              <p>{user.bio || '写一句简介，让球友更了解你。'}</p>
              <div className="profile-person__meta">
                <span>
                  <ProfileIcon name="shield" />
                  {badgeKind
                    ? identityLabels[badgeKind]
                    : verificationLabel(user.verificationLevel)}
                </span>
                <span>
                  <ProfileIcon name="user" />
                  {user.roles.some((role) => role.role === 'TEAM_CAPTAIN')
                    ? '球队队长'
                    : `@${user.username}`}
                </span>
              </div>
              <button
                data-profile-button=""
                className="profile-button profile-button--outline"
                onClick={() => openModal('edit')}
              >
                <ProfileIcon name="pencil" />
                编辑资料
              </button>
            </div>
          </div>
          <div className="profile-person__stats">
            {(
              [
                ['posts', errors.posts ? '—' : ownPosts.length, '我的动态'],
                [
                  'matches',
                  errors.matches || errors.team ? '—' : followedMatches.length,
                  '关注比赛',
                ],
                ['bookmarks', library.bookmarkedPostIds.length, '收藏内容'],
              ] as const
            ).map(([id, count, label]) => (
              <button data-profile-button="" key={id} onClick={() => chooseTab(id)}>
                <strong>{loading && id !== 'bookmarks' ? '—' : count}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="profile-team" aria-label="我的主队">
          <button
            data-profile-button=""
            className="profile-team__label"
            onClick={() => openModal('team')}
          >
            <ProfileIcon name="shield" />
            我的主队
            <ProfileIcon name="right" />
          </button>
          <div className="profile-team__main">
            <div className="profile-team__crest">
              <TeamCrest team={primary} size="large" />
            </div>
            <div>
              <h2>{loading ? '正在读取主队' : (primary?.name ?? '选择你的主队')}</h2>
              <p>
                {errors.team ||
                  dashboard?.team.motto ||
                  (primary ? '每一次呐喊，都让我们离球场更近。' : '关注一支球队，把热爱留在校园。')}
              </p>
              <div className="profile-team__tags">
                {['团结', '拼搏', '热爱', '友谊'].map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="profile-team__actions">
            <button
              data-profile-button=""
              className="profile-button profile-button--light"
              onClick={() => (primary ? openTeam(primary.id) : openModal('team'))}
            >
              {primary ? '查看球队' : '选择主队'}
              <ProfileIcon name="arrow" />
            </button>
            <button
              data-profile-button=""
              className="profile-button profile-button--glass"
              onClick={() => openModal('team')}
            >
              <ProfileIcon name="reset" />
              更换主队
            </button>
          </div>
          <div className="profile-team__slogan" aria-hidden="true">
            足球让平凡的
            <br />
            校园日子闪闪发光
            <i />
          </div>
        </section>
      </div>
      <div className="profile-body">
        <aside className="profile-functions" aria-label="我的功能">
          <section className="profile-function-card profile-surface">
            <div className="profile-function-heading">
              <h2>我的功能</h2>
              <p>个人资料与球队事务，都在这里。</p>
            </div>
            <div className="profile-function-grid">
              <Shortcut
                icon="user"
                title="个人信息"
                note="头像、昵称与账户资料"
                onClick={() => openModal('edit')}
              />
              <Shortcut
                icon="shield"
                title="我的身份"
                note={badgeKind ? identityLabels[badgeKind] : '查看当前身份'}
                onClick={() => openModal('identity')}
              />
              <Shortcut
                icon="users"
                title={
                  authorizedIds.length ? '管理球队' : user.linkedPlayer ? '我的球队' : '加入球队'
                }
                note={
                  authorizedIds.length
                    ? '名单、阵容与成员'
                    : user.linkedPlayer
                      ? '查看球队与球员'
                      : '发现球队，申请加入'
                }
                onClick={() => openModal('relationship')}
              />
              <Shortcut
                icon="comment"
                title="我的消息"
                note="通知与校内私信"
                onClick={() => openMessaging()}
              />
              <Shortcut
                icon="exchange"
                title="身份管理"
                note="认证申请 · 展示身份"
                onClick={() => openModal('badge')}
              />
              <Shortcut
                icon="settings"
                title="设置"
                note="调整浏览偏好"
                onClick={() => setSettings(true)}
              />
              <Shortcut
                icon="comment"
                title="问题反馈"
                note="反馈问题 · 查看回复"
                onClick={() => setFeedback(true)}
              />
              <Shortcut
                icon="logout"
                title="退出登录"
                note="退出当前账号"
                onClick={() => openModal('logout')}
              />
            </div>
            <div className="profile-function-links">
              <button data-profile-button onClick={() => openModal('reports')}>
                反馈记录 <ProfileIcon name="right" />
              </button>
              <button data-profile-button onClick={() => openModal('notifications')}>
                通知记录 <ProfileIcon name="right" />
              </button>
              {isAdmin && (
                <button
                  data-profile-button
                  onClick={() => void identityEntryActions.administrationEntry()}
                >
                  管理中心 <ProfileIcon name="right" />
                </button>
              )}
            </div>
          </section>
        </aside>
        <section className="profile-stream profile-surface" id="profile-stream">
          <div className="profile-tabs" role="tablist" aria-label="个人内容">
            {(
              [
                { id: 'posts', label: '我的动态', icon: 'comment' },
                { id: 'matches', label: '关注的比赛', icon: 'trophy' },
                { id: 'bookmarks', label: '收藏', icon: 'star' },
              ] as const
            ).map((item) => (
              <button
                data-profile-button=""
                key={item.id}
                id={`profile-tab-${item.id}`}
                role="tab"
                aria-selected={tab === item.id}
                aria-controls="profile-tabpanel"
                tabIndex={tab === item.id ? 0 : -1}
                className={tab === item.id ? 'is-active' : ''}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const tabs: Tab[] = ['posts', 'matches', 'bookmarks']
                  const index = tabs.indexOf(tab)
                  const next =
                    event.key === 'Home'
                      ? 'posts'
                      : event.key === 'End'
                        ? 'bookmarks'
                        : tabs[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]!
                  setTab(next)
                  document.getElementById(`profile-tab-${next}`)?.focus()
                }}
              >
                <ProfileIcon name={item.icon} />
                {item.label}
              </button>
            ))}
            <button
              data-profile-button=""
              className="profile-tabs__add"
              aria-label={
                tab === 'posts' ? '发布动态' : tab === 'matches' ? '关注更多比赛' : '添加收藏'
              }
              onClick={() =>
                tab === 'posts'
                  ? setComposer(true)
                  : openModal(tab === 'matches' ? 'follow' : 'collect')
              }
            >
              <ProfileIcon name="plus" />
            </button>
          </div>
          <div id="profile-tabpanel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
            {storageError && (
              <p className="profile-error" role="alert">
                {storageError}
              </p>
            )}
            {loading ? (
              <DataState kind="loading" title="正在读取个人内容" />
            ) : (tab === 'matches' ? errors.matches || errors.team : errors.posts) ? (
              <DataState
                kind="error"
                title="内容读取失败"
                description={
                  (tab === 'matches' ? errors.matches || errors.team : errors.posts) ?? '请稍后重试'
                }
                onRetry={() => void load()}
              />
            ) : (
              <>
                {tab === 'posts' && (
                  <>
                    <div className="profile-stream__note">
                      {home.tournament.seasonName}
                      <span>记录每一个值得记住的瞬间</span>
                    </div>
                    {ownPosts.map((post) => (
                      <ProfilePost
                        key={post.id}
                        post={post}
                        bookmarked={library.bookmarkedPostIds.includes(post.id)}
                        onBookmark={() => toggle('bookmarkedPostIds', post.id)}
                      />
                    ))}
                    {ownPosts.length === 0 && (
                      <ProfileEmpty
                        icon="comment"
                        title="你的球场故事，从这里开始"
                        note="还没有本赛季的公开动态，分享一张照片或一段观赛感受吧。"
                        action="发布第一条动态"
                        onAction={() => setComposer(true)}
                      />
                    )}
                    <p className="profile-data-note">展示本赛季最近 50 条公开动态中的个人内容。</p>
                  </>
                )}
                {tab === 'matches' && (
                  <>
                    <div className="profile-match-filters">
                      {(
                        [
                          { id: 'all', name: '全部' },
                          { id: 'pending', name: '待进行' },
                          { id: 'finished', name: '其他状态' },
                        ] as const
                      ).map((filter) => (
                        <button
                          data-profile-button=""
                          key={filter.id}
                          aria-pressed={matchFilter === filter.id}
                          className={matchFilter === filter.id ? 'is-active' : ''}
                          onClick={() => setMatchFilter(filter.id)}
                        >
                          {filter.name}
                        </button>
                      ))}
                      <button data-profile-button="" onClick={() => openModal('follow')}>
                        关注更多
                        <ProfileIcon name="plus" />
                      </button>
                    </div>
                    <p className="profile-data-note">
                      来自主队、关注球队与本机关注；单场关注及提醒仅保存在当前浏览器。
                    </p>
                    {visibleMatches.map((match) => (
                      <ProfileMatch
                        key={match.id}
                        match={match}
                        compact={false}
                        reminded={library.reminderMatchIds.includes(match.id)}
                        onReminder={() => setReminder(match)}
                        followedLocally={library.followedMatchIds.includes(match.id)}
                        onFollow={() => toggle('followedMatchIds', match.id)}
                      />
                    ))}
                    {visibleMatches.length === 0 && (
                      <ProfileEmpty
                        icon="trophy"
                        title="暂时没有这类关注比赛"
                        note="选择主队或关注单场比赛，在这里查看它们的赛程。"
                        action="去关注比赛"
                        onAction={() => openModal('follow')}
                      />
                    )}
                  </>
                )}
                {tab === 'bookmarks' && (
                  <>
                    <div className="profile-stream__note">
                      我的收藏<span>仅保存在当前浏览器 · 当前账号</span>
                    </div>
                    {bookmarkedPosts.map((post) => (
                      <ProfilePost
                        key={post.id}
                        post={post}
                        bookmarked
                        onBookmark={() => toggle('bookmarkedPostIds', post.id)}
                      />
                    ))}
                    {missingBookmarks.map((id) => (
                      <div className="profile-unavailable" key={id}>
                        <span>这条收藏暂时无法读取，可能已下架或网络不可用。</span>
                        <button
                          data-profile-button=""
                          onClick={() => {
                            void productRepository
                              .getPost(id)
                              .then((post) =>
                                setPosts((current) => [
                                  ...current.filter((item) => item.id !== id),
                                  post,
                                ]),
                              )
                              .catch(toastError)
                          }}
                        >
                          重试
                        </button>
                        <button
                          data-profile-button=""
                          onClick={() => toggle('bookmarkedPostIds', id)}
                        >
                          移除收藏
                        </button>
                      </div>
                    ))}
                    {library.bookmarkedPostIds.length === 0 && (
                      <ProfileEmpty
                        icon="star"
                        title="把喜欢的足球故事留下来"
                        note="收藏资讯与动态，下次在这里继续看。"
                        action="挑选收藏内容"
                        onAction={() => openModal('collect')}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
      {modal === 'edit' && (
        <ProfileInformation
          user={user}
          onUserChange={onUserChange}
          onClose={closeModal}
          onAvatar={() => setAvatar(true)}
        />
      )}
      {modal === 'relationship' && (
        <TeamRelationsDialog
          teams={teams}
          tournamentId={home.tournament.id}
          managedIds={authorizedIds}
          onClose={closeModal}
        />
      )}
      {modal === 'team' && (
        <ProfileDialog
          title="选择我的主队"
          note="每个账号可以选择一支主队，已有关注球队会保留。"
          onClose={closeModal}
          footer={
            <button
              data-profile-button=""
              className="profile-button profile-button--primary"
              disabled={!selectedTeam || busy || Boolean(errors.team) || loading}
              onClick={() => void saveTeam()}
            >
              {busy ? '正在保存…' : '保存主队'}
            </button>
          }
        >
          <input
            data-profile-input=""
            className="profile-search"
            aria-label="搜索球队"
            placeholder="搜索球队名称或学院"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {errors.team && <p className="profile-error">主队偏好读取失败，请关闭后重试。</p>}
          <div className="profile-team-options">
            {teams
              .filter((team) => `${team.name}${team.collegeName ?? ''}`.includes(query.trim()))
              .map((team) => (
                <button
                  data-profile-button=""
                  key={team.id}
                  aria-pressed={selectedTeam === team.id}
                  className={selectedTeam === team.id ? 'is-active' : ''}
                  onClick={() => setSelectedTeam(team.id)}
                >
                  <TeamCrest team={team} size="small" />
                  <span>
                    <strong>{team.name}</strong>
                    <small>{team.collegeName || '校园球队'}</small>
                  </span>
                  <ProfileIcon name={selectedTeam === team.id ? 'check' : 'right'} />
                </button>
              ))}
          </div>
          {teams.filter((team) => `${team.name}${team.collegeName ?? ''}`.includes(query.trim()))
            .length === 0 && <p className="profile-data-note">没有匹配的球队。</p>}
        </ProfileDialog>
      )}
      {(modal === 'follow' || modal === 'collect') && (
        <ProfileDialog
          title={modal === 'follow' ? '关注更多比赛' : '收藏内容'}
          note="仅保存在当前浏览器，按组织与账号分别保存。"
          onClose={closeModal}
        >
          <input
            data-profile-input=""
            className="profile-search"
            aria-label={modal === 'follow' ? '搜索比赛' : '搜索动态'}
            placeholder={modal === 'follow' ? '搜索球队或比赛' : '搜索动态或作者'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {(modal === 'follow' ? errors.matches : errors.posts) ? (
            <DataState kind="error" title="列表读取失败" onRetry={() => void load()} />
          ) : (
            <div className="profile-choice-list">
              {modal === 'follow'
                ? schedule
                    .filter((match) =>
                      `${match.title}${match.homeTeam?.name}${match.awayTeam?.name}`.includes(
                        query.trim(),
                      ),
                    )
                    .map((match) => (
                      <button
                        data-profile-button=""
                        key={match.id}
                        aria-pressed={library.followedMatchIds.includes(match.id)}
                        onClick={() => toggle('followedMatchIds', match.id)}
                      >
                        <ProfileIcon
                          name={library.followedMatchIds.includes(match.id) ? 'check' : 'plus'}
                        />
                        <span>
                          <strong>
                            {match.homeTeam?.name ?? match.homePlaceholder ?? '主队待定'} vs{' '}
                            {match.awayTeam?.name ?? match.awayPlaceholder ?? '客队待定'}
                          </strong>
                          <small>
                            {formatDate(match.scheduledStartAt)} · {matchStatusLabel(match.status)}
                            {(match.homeTeam && watchedTeamIds.has(match.homeTeam.id)) ||
                            (match.awayTeam && watchedTeamIds.has(match.awayTeam.id))
                              ? ' · 已随球队关注'
                              : ''}
                          </small>
                        </span>
                      </button>
                    ))
                : posts
                    .filter((post) =>
                      `${post.title ?? ''}${post.body}${post.author.displayName}`.includes(
                        query.trim(),
                      ),
                    )
                    .map((post) => (
                      <button
                        data-profile-button=""
                        key={post.id}
                        aria-pressed={library.bookmarkedPostIds.includes(post.id)}
                        onClick={() => toggle('bookmarkedPostIds', post.id)}
                      >
                        <ProfileIcon
                          name={library.bookmarkedPostIds.includes(post.id) ? 'check' : 'star'}
                        />
                        <span>
                          <strong>{post.title || post.body.slice(0, 65)}</strong>
                          <small>
                            {post.author.displayName} · {formatDate(post.publishedAt)}
                          </small>
                        </span>
                      </button>
                    ))}
            </div>
          )}
          {storageError && (
            <p role="alert" className="profile-error">
              {storageError}
            </p>
          )}
          {query && (
            <p className="profile-data-note">仅显示匹配“{query}”的内容；清空搜索可查看全部。</p>
          )}
          <button
            data-profile-button=""
            className="profile-button profile-button--primary"
            onClick={closeModal}
          >
            完成
          </button>
        </ProfileDialog>
      )}
      {modal === 'identity' && (
        <ProfileDialog
          title="我的身份"
          note="以下实名信息仅本人可见，不会出现在公开档案中。"
          onClose={closeModal}
        >
          <dl className="profile-identity">
            {[
              ['昵称', user.displayName],
              ['账号', `@${user.username}`],
              ['认证', verificationLabel(user.verificationLevel)],
              ['姓名', user.realName || '未登记'],
              ['学号', user.studentId || '未登记'],
              ['邮箱', user.email || '未绑定'],
              ['角色', user.roles.map((role) => roleLabel(role.role)).join('、') || '普通用户'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {user.linkedPlayer && (
            <button
              data-profile-button=""
              className="profile-button profile-button--primary"
              onClick={() => {
                setModal(null)
                void openPlayer(user.linkedPlayer!.id, home.tournament.id).catch(toastError)
              }}
            >
              查看球员档案
              <ProfileIcon name="arrow" />
            </button>
          )}
        </ProfileDialog>
      )}
      {modal === 'badge' && (
        <ProfileDialog
          title="身份管理"
          note="申请新的认证身份，也可以选择当前对外展示的身份。"
          onClose={closeModal}
        >
          <div className="profile-identity-apply">
            <div>
              <strong>认证与申请</strong>
              <p>认领球员档案，申请队长、教练或信息员身份。</p>
            </div>
            <button
              data-profile-button
              className="profile-button profile-button--outline"
              onClick={() => {
                setModal(null)
                void identityEntryActions.identity()
              }}
            >
              认证身份 <ProfileIcon name="arrow" />
            </button>
          </div>
          <h3 className="profile-display-heading">选择展示身份</h3>
          <BadgeManager user={user} onClose={closeModal} />
        </ProfileDialog>
      )}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      {modal && modal in SERVICE_TITLES && (
        <ProfileDialog wide title={SERVICE_TITLES[modal as ProfileService]} onClose={closeModal}>
          {renderService(modal as ProfileService, (service) => setModal(service))}
        </ProfileDialog>
      )}
      {modal === 'logout' && (
        <ProfileDialog
          title="退出登录"
          note="退出后可继续以游客身份浏览公开赛事。"
          onClose={closeModal}
        >
          <div className="profile-dialog__actions">
            <button
              data-profile-button=""
              className="profile-button profile-button--outline"
              disabled={busy}
              onClick={closeModal}
            >
              取消
            </button>
            <button
              data-profile-button=""
              className="profile-button profile-button--primary"
              disabled={busy}
              onClick={() => void logout()}
            >
              {busy ? '正在退出…' : '确认退出'}
            </button>
          </div>
        </ProfileDialog>
      )}
      {reminder && (
        <ProfileDialog
          title="比赛提醒"
          note="本机标记用于整理关注列表；导入日历后，由日历应用负责开赛前 15 分钟提醒。"
          onClose={() => setReminder(null)}
        >
          <div className="profile-reminder-summary">
            <strong>
              {reminder.homeTeam?.name ?? '主队待定'} vs {reminder.awayTeam?.name ?? '客队待定'}
            </strong>
            <p>
              {formatDate(reminder.scheduledStartAt)} {formatTime(reminder.scheduledStartAt)} ·{' '}
              {reminder.venue?.name ?? '场地待定'}
            </p>
          </div>
          {!canRemind(reminder) && (
            <p className="profile-error">
              这场比赛的时间已过、待定或状态不支持提醒，请先查看最新赛程。
            </p>
          )}
          <div className="profile-dialog__actions">
            <button
              data-profile-button=""
              className="profile-button profile-button--outline"
              disabled={!canRemind(reminder) && !library.reminderMatchIds.includes(reminder.id)}
              onClick={() => toggle('reminderMatchIds', reminder.id)}
            >
              <ProfileIcon name="bell" />
              {library.reminderMatchIds.includes(reminder.id) ? '取消本机标记' : '添加本机标记'}
            </button>
            <button
              data-profile-button=""
              className="profile-button profile-button--primary"
              disabled={!canRemind(reminder)}
              onClick={() => {
                try {
                  const url = URL.createObjectURL(
                    new Blob([calendarEvent(reminder)], { type: 'text/calendar;charset=utf-8' }),
                  )
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `xiaoqiu-${reminder.id}.ics`
                  link.click()
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
                } catch (error) {
                  toastError(error)
                }
              }}
            >
              <ProfileIcon name="calendar" />
              导出日历提醒
            </button>
          </div>
          <p className="profile-data-note">
            日历导入不会自动同步后续赛程变更，请以站内最新安排为准。
          </p>
          {storageError && (
            <p className="profile-error" role="alert">
              {storageError}
            </p>
          )}
        </ProfileDialog>
      )}
      {avatar && (
        <AvatarCropper
          onCancel={() => setAvatar(false)}
          onConfirm={async (dataUrl) => {
            const result = await productRepository.uploadAvatar(dataUrl)
            onUserChange(result.user)
            setAvatar(false)
            void Taro.showToast({ title: '头像已更新', icon: 'success' })
          }}
        />
      )}
      {feedback && (
        <ReportModal targetType="FEEDBACK" title="问题反馈" onClose={() => setFeedback(false)} />
      )}
      <DesktopPostComposer
        open={composer}
        onClose={() => setComposer(false)}
        onPublished={(post) => {
          setPosts((current) => [post, ...current])
          setSeasonPostIds((current) => [post.id, ...current])
          setTab('posts')
        }}
      />
    </div>
  )
}

function ProfileDialog({
  title,
  note,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  note?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useOverlayFocus(true, '.profile-dialog', onClose)
  return createPortal(
    <div
      className="profile-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={`profile-dialog ${wide ? 'profile-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id="profile-dialog-title">{title}</h2>
            {note && <p>{note}</p>}
          </div>
          <button data-profile-button="" aria-label="关闭弹窗" onClick={onClose}>
            <ProfileIcon name="close" />
          </button>
        </header>
        <div className="profile-dialog__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}

function ProfileInformation({
  user,
  onUserChange,
  onClose,
  onAvatar,
}: Pick<DesktopProfileProps, 'user' | 'onUserChange'> & {
  onClose: () => void
  onAvatar: () => void
}) {
  const [editing, setEditing] = useState<'name' | 'email' | 'bio' | null>(null)
  const [correction, setCorrection] = useState(false)
  const background = usePersonalBackground(user.id)
  return (
    <ProfileDialog title="个人信息" note="公开资料与仅本人可见的账户信息。" onClose={onClose}>
      <div className="profile-info-list">
        <div className="profile-info-row">
          <span>头像</span>
          <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="small" />
          <button data-profile-button onClick={onAvatar}>
            更换
          </button>
        </div>
        <div className="profile-info-row">
          <span>昵称</span>
          <strong>{user.displayName}</strong>
          <button data-profile-button onClick={() => setEditing('name')}>
            更改
          </button>
        </div>
        <div className="profile-info-row">
          <span>个人背景</span>
          <span>
            {background ? (
              <img className="profile-info-background" src={background} alt="当前个人背景" />
            ) : (
              '默认背景'
            )}
          </span>
          <MediaUploadButton purpose="USER_BACKGROUND" targetId={user.id} label="更换" />
        </div>
        <div className="profile-info-row">
          <span>个人简介</span>
          <span>{user.bio || '还没有填写简介'}</span>
          <button data-profile-button onClick={() => setEditing('bio')}>
            更改
          </button>
        </div>
        <p className="profile-info-private">以下信息仅本人可见</p>
        <div className="profile-info-row">
          <span>姓名</span>
          <strong>{user.realName || '未登记'}</strong>
          <button data-profile-button onClick={() => setCorrection(true)}>
            申请更正
          </button>
        </div>
        <div className="profile-info-row">
          <span>学号</span>
          <span>{user.studentId || '未登记'}</span>
          <button data-profile-button onClick={() => setCorrection(true)}>
            申请更正
          </button>
        </div>
        <div className="profile-info-row">
          <span>绑定邮箱</span>
          <span>{user.email || '未绑定'}</span>
          <button data-profile-button onClick={() => setEditing('email')}>
            {user.email ? '更换' : '绑定'}
          </button>
        </div>
      </div>
      {editing && (
        <ProfileEditor
          key={editing}
          user={user}
          field={editing}
          onUserChange={onUserChange}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="profile-info-media">
        <MediaAccountEntry includeBackground={false} />
      </div>
      {correction && (
        <ReportModal
          targetType="FEEDBACK"
          title="实名资料更正申请"
          onClose={() => setCorrection(false)}
        />
      )}
    </ProfileDialog>
  )
}

function ProfileEditor({
  user,
  onUserChange,
  onClose,
  field,
}: Pick<DesktopProfileProps, 'user' | 'onUserChange'> & {
  onClose: () => void
  field: 'name' | 'email' | 'bio'
}) {
  const [name, setName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email ?? '')
  const [bio, setBio] = useState(user.bio ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const close = () => {
    if (!busy.current) onClose()
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    if (name.trim().length < 2) {
      setError('昵称至少需要 2 个字。')
      return
    }
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的邮箱地址。')
      return
    }
    busy.current = true
    setSaving(true)
    setError('')
    try {
      onUserChange(await productRepository.updateProfile(name.trim(), email.trim(), bio.trim()))
      onClose()
      void Taro.showToast({ title: '资料已保存', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <form
      className="profile-edit-form profile-edit-form--inline"
      onSubmit={(event) => void save(event)}
    >
      {field === 'name' && (
        <label data-profile-field="">
          昵称
          <input
            data-profile-input=""
            autoComplete="nickname"
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      )}
      {field === 'email' && (
        <label data-profile-field="">
          绑定邮箱
          <input
            data-profile-input=""
            type="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
          <small>用于账号联系与登录，当前未提供邮件验证码验证。</small>
        </label>
      )}
      {field === 'bio' && (
        <label data-profile-field="">
          个人简介
          <textarea
            data-profile-textarea=""
            value={bio}
            maxLength={280}
            rows={4}
            onChange={(event) => setBio(event.target.value)}
          />
          <small>{bio.length}/280</small>
        </label>
      )}
      {error && (
        <p role="alert" className="profile-error">
          {error}
        </p>
      )}
      <div className="profile-dialog__actions">
        <button
          data-profile-button=""
          type="button"
          className="profile-button profile-button--outline"
          disabled={saving}
          onClick={close}
        >
          取消
        </button>
        <button
          data-profile-button=""
          className="profile-button profile-button--primary"
          disabled={saving}
        >
          {saving ? '正在保存…' : '保存资料'}
        </button>
      </div>
    </form>
  )
}

function ProfileEmpty({
  icon,
  title,
  note,
  action,
  onAction,
}: {
  icon: ProfileIconName
  title: string
  note: string
  action: string
  onAction: () => void
}) {
  return (
    <div className="profile-empty-state">
      <ProfileIcon name={icon} />
      <h3>{title}</h3>
      <p>{note}</p>
      <button
        data-profile-button=""
        className="profile-button profile-button--outline"
        onClick={onAction}
      >
        {action}
        <ProfileIcon name="arrow" />
      </button>
    </div>
  )
}
function Shortcut({
  icon,
  title,
  note,
  onClick,
}: {
  icon: ProfileIconName
  title: string
  note: string
  onClick: () => void
}) {
  return (
    <button data-profile-button="" className="profile-shortcut" onClick={onClick}>
      <span className="profile-shortcut__icon">
        <ProfileIcon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
      <ProfileIcon name="right" />
    </button>
  )
}
function ProfileMatch({
  match,
  compact,
  reminded,
  onReminder,
  followedLocally,
  onFollow,
}: {
  match: MatchSummary
  compact: boolean
  reminded: boolean
  onReminder: () => void
  followedLocally?: boolean
  onFollow?: () => void
}) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const viewMatch = () => void Taro.navigateTo({ url: matchUrl(match.id) }).catch(toastError)
  return (
    <article className={`profile-match ${compact ? 'profile-match--compact' : ''}`}>
      <div className="profile-match__meta">
        <span>{match.roundName || match.stageName || match.title}</span>
        <time>
          {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
        </time>
      </div>
      <button
        data-profile-button=""
        className="profile-match__teams"
        aria-label={`查看${match.homeTeam?.name ?? '主队待定'}对${match.awayTeam?.name ?? '客队待定'}比赛`}
        onClick={viewMatch}
      >
        <span>
          <TeamCrest team={match.homeTeam} size="small" />
          <strong>
            <TeamName
              team={match.homeTeam}
              tournamentId={match.tournamentId}
              fallback={match.homePlaceholder ?? '待定'}
            />
          </strong>
        </span>
        <b>{hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}</b>
        <span>
          <TeamCrest team={match.awayTeam} size="small" />
          <strong>
            <TeamName
              team={match.awayTeam}
              tournamentId={match.tournamentId}
              fallback={match.awayPlaceholder ?? '待定'}
            />
          </strong>
        </span>
      </button>
      <div className="profile-match__footer">
        <span>
          <ProfileIcon name="pin" />
          {match.venue?.name ?? '场地待定'}
        </span>
        <button
          data-profile-button=""
          className="profile-button profile-button--primary"
          onClick={isPendingMatch(match) ? onReminder : viewMatch}
        >
          <ProfileIcon name={isPendingMatch(match) ? 'bell' : 'arrow'} />
          {isPendingMatch(match) ? (reminded ? '已标记提醒' : '设置提醒') : '查看战报'}
        </button>
      </div>
      {!compact && (
        <div className="profile-match__status">
          <span>
            {matchStatusLabel(match.status)}
            {match.statusReason ? ` · ${match.statusReason}` : ''}
          </span>
          {onFollow && (
            <button data-profile-button="" onClick={onFollow} aria-pressed={followedLocally}>
              <ProfileIcon name={followedLocally ? 'check' : 'plus'} />
              {followedLocally ? '取消本机关注' : '单独关注'}
            </button>
          )}
        </div>
      )}
      {isPendingMatch(match) &&
        match.scheduledStartAt &&
        new Date(match.scheduledStartAt).getTime() < Date.now() && (
          <p className="profile-match__past">时间已过，赛事状态待更新</p>
        )}
    </article>
  )
}
function ProfilePost({
  post: original,
  bookmarked,
  onBookmark,
}: {
  post: PostSummary
  bookmarked: boolean
  onBookmark: () => void
}) {
  const post = usePostInteraction(original)
  const [menu, setMenu] = useState(false)
  const [liking, setLiking] = useState(false)
  const [share, setShare] = useState(false)
  const pending = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const images = post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []
  const url = `${window.location.origin}${window.location.pathname}#/pages/post-detail/index?postId=${encodeURIComponent(post.id)}`
  useEffect(() => {
    if (!menu) return
    const outside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [menu])
  const like = async () => {
    if (pending.current) return
    pending.current = true
    setLiking(true)
    try {
      const result = await productRepository.setLike(post.id, !post.likedByMe)
      updatePostInteraction({ ...post, likedByMe: result.liked, likeCount: result.likeCount })
    } catch (issue) {
      toastError(issue)
    } finally {
      pending.current = false
      setLiking(false)
    }
  }
  return (
    <article className="profile-post">
      <div className="profile-post__avatar">
        <UserAvatar
          name={post.author.displayName}
          avatarUrl={post.author.avatarUrl}
          userId={post.author.id}
          size="small"
        />
      </div>
      <div className="profile-post__content">
        <header>
          <PersonTrigger userId={post.author.id} name={post.author.displayName}>
            <strong>{post.author.displayName}</strong>
          </PersonTrigger>
          <VerificationBadge
            level={post.author.verificationLevel}
            roles={post.author.roles}
            official={post.author.official}
            displayedKind={post.author.displayedBadgeKind}
            userId={post.author.id}
          />
          <time>
            {formatDate(post.publishedAt)} {formatTime(post.publishedAt)}
          </time>
          {post.type === 'OFFICIAL' && <span>官方</span>}
        </header>
        <button
          data-profile-button=""
          className="profile-post__text"
          onClick={() => void openPost(post.id)}
        >
          {post.title && <strong>{post.title}</strong>}
          <span>{post.body}</span>
        </button>
        <PostTags tags={post.tags} tournamentId={post.tournamentId} />
        {images.length > 0 && (
          <div
            className={`profile-post__photos profile-post__photos--${Math.min(3, images.length)}`}
          >
            {images.slice(0, 3).map((source, index) => (
              <button
                data-profile-button=""
                key={`${source}-${index}`}
                aria-label={`查看动态图片 ${index + 1}，共 ${images.length} 张`}
                onClick={() => void openPost(post.id)}
              >
                <img
                  data-profile-image=""
                  src={resolveMediaUrl(source)}
                  alt={post.title || '动态配图'}
                  loading="lazy"
                />
                {images.length > 3 && index === 2 && <span>+{images.length - 3}</span>}
              </button>
            ))}
          </div>
        )}
        <footer>
          <span className="profile-post__team">
            {post.team && (
              <>
                <ProfileIcon name="pin" />
                {post.team.name}
              </>
            )}
          </span>
          <div className="profile-post__actions">
            <button
              data-profile-button=""
              aria-label={`${post.likedByMe ? '取消点赞' : '点赞'}动态`}
              aria-pressed={post.likedByMe}
              disabled={liking}
              onClick={() => void like()}
            >
              <ReactionHeart active={post.likedByMe} />
              {post.likeCount}
            </button>
            <button
              data-profile-button=""
              aria-label="查看动态评论"
              onClick={() => void openPost(post.id)}
            >
              <ProfileIcon name="comment" />
              {post.commentCount}
            </button>
            <button data-profile-button="" aria-label="分享动态" onClick={() => setShare(true)}>
              <ProfileIcon name="send" />
            </button>
            <div ref={menuRef} className="profile-post__more">
              <button
                data-profile-button=""
                aria-label="更多动态操作"
                aria-expanded={menu}
                onClick={() => setMenu((current) => !current)}
              >
                <ProfileIcon name="more" />
              </button>
              {menu && (
                <div className="profile-post__menu">
                  <button
                    data-profile-button=""
                    onClick={() => {
                      onBookmark()
                      setMenu(false)
                    }}
                  >
                    <ProfileIcon name="star" />
                    {bookmarked ? '取消收藏' : '收藏到本机'}
                  </button>
                  <button
                    data-profile-button=""
                    onClick={() => {
                      setShare(true)
                      setMenu(false)
                    }}
                  >
                    <ProfileIcon name="send" />
                    分享链接
                  </button>
                </div>
              )}
            </div>
          </div>
        </footer>
      </div>
      {share && (
        <ProfileDialog
          title="分享动态"
          note="复制链接，和球友一起回到这个瞬间。"
          onClose={() => setShare(false)}
        >
          <input
            data-profile-input=""
            className="profile-search"
            aria-label="动态分享链接"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            data-profile-button=""
            className="profile-button profile-button--primary"
            onClick={() => {
              if (!navigator.clipboard) {
                void Taro.showToast({ title: '请选中上方链接手动复制', icon: 'none' })
                return
              }
              void navigator.clipboard
                .writeText(url)
                .then(() => {
                  void Taro.showToast({ title: '链接已复制', icon: 'success' })
                })
                .catch(() => {
                  void Taro.showToast({ title: '请选中上方链接手动复制', icon: 'none' })
                })
            }}
          >
            复制链接
          </button>
        </ProfileDialog>
      )}
    </article>
  )
}
