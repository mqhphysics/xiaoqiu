import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react'

import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { getConfiguration, readAccountPresence } from '../../features/product-config/policy-state'
import { productConfigRepository } from '../../features/product-config/product-config.repository'
import {
  runNavigationEntry,
  runPrivateEntry,
} from '../../features/product-config/navigation-entry.logic'
import { useProductConfiguration } from '../../features/product-config/use-product-config'
import type { TeamSummary } from '../../features/product/product.types'
import type { PublicDataSource } from '../../features/readonly-schedule/readonly-schedule.types'
import { TeamCrest, UserAvatar } from '../product-ui'
import { MessagingDrawer, openMessaging } from '../messaging-drawer'
import { ReportModal } from '../report-modal'
import { SettingsDialog } from '../settings-dialog'
import { IconButton } from '../icon-button'
import { PersistentHeaderSearch } from './persistent-header-search'
import {
  animateNavigationEntrance,
  captureNavigationOrigin,
  clearNavigationOrigin,
  playTeamFocus,
} from './navigation-transition'
import { TeamNavFocus } from './team-nav-focus'
import { DesktopAccount, useDesktopAccount } from './desktop-account'

import './index.scss'

type PublicSection = 'home' | 'schedule' | 'data' | 'team' | 'me' | 'tournaments' | 'teams'

interface PublicShellProps extends PropsWithChildren {
  active: PublicSection
  headerSearch?: ReactNode
  onActiveReselect?: () => void
  tournamentId?: string | undefined
  source?: PublicDataSource | undefined
  showBack?: boolean
}

const navItems: Array<{ key: PublicSection; label: string; shortLabel: string }> = [
  { key: 'home', label: '首页', shortLabel: 'HOME' },
  { key: 'schedule', label: '赛程', shortLabel: 'MATCH' },
  { key: 'team', label: '', shortLabel: '' },
  { key: 'data', label: '数据', shortLabel: 'DATA' },
  { key: 'me', label: '我的', shortLabel: 'ME' },
]

const primaryTeamCache = new Map<string, TeamSummary | null>()
const primaryTeamListeners = new Set<(key: string, team: TeamSummary | null) => void>()

export function updatePrimaryTeamCache(team: TeamSummary | null): void {
  const session = readSession()
  if (!session) return
  const key = `${session.user.id}:${session.expiresAt}`
  primaryTeamCache.set(key, team)
  for (const listener of primaryTeamListeners) listener(key, team)
}

export function PublicShell({
  active,
  headerSearch,
  onActiveReselect,
  tournamentId,
  source,
  showBack = false,
  children,
}: PublicShellProps) {
  const session = readSession()
  const desktopAccount = useDesktopAccount()
  useProductConfiguration()
  const teamCacheKey = session ? `${session.user.id}:${session.expiresAt}` : null
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [primaryTeam, setPrimaryTeam] = useState<TeamSummary | null>(() =>
    teamCacheKey && primaryTeamCache.has(teamCacheKey)
      ? (primaryTeamCache.get(teamCacheKey) ?? null)
      : null,
  )
  const [navigatingTo, setNavigatingTo] = useState<PublicSection | null>(null)
  const shellRef = useRef<HTMLElement | null>(null)
  const navigationLock = useRef(false)
  const normalizedActive = active === 'teams' ? 'team' : active === 'tournaments' ? 'data' : active
  const selectedNavItem = navigatingTo ?? normalizedActive
  const currentPath = normalizePath(getCurrentInstance().router?.path ?? '')

  useLayoutEffect(() => {
    if (!shellRef.current || Taro.getEnv() !== Taro.ENV_TYPE.WEB) return
    return animateNavigationEntrance(shellRef.current, normalizedActive)
  }, [normalizedActive])

  useEffect(() => {
    let mounted = true
    if (!session) {
      setPrimaryTeam(null)
      return () => {
        mounted = false
      }
    }
    if (teamCacheKey && primaryTeamCache.has(teamCacheKey)) {
      setPrimaryTeam(primaryTeamCache.get(teamCacheKey) ?? null)
    }
    void productRepository
      .getTeamPreferences()
      .then((preferences) => {
        if (!mounted) return
        if (teamCacheKey) primaryTeamCache.set(teamCacheKey, preferences.primaryTeam)
        setPrimaryTeam(preferences.primaryTeam)
      })
      .catch(() => {
        if (mounted && (!teamCacheKey || !primaryTeamCache.has(teamCacheKey))) {
          setPrimaryTeam(null)
        }
      })
    return () => {
      mounted = false
    }
  }, [session?.accessToken, teamCacheKey])

  useEffect(() => {
    const listener = (key: string, team: TeamSummary | null) => {
      if (key === teamCacheKey) setPrimaryTeam(team)
    }
    primaryTeamListeners.add(listener)
    return () => {
      primaryTeamListeners.delete(listener)
    }
  }, [teamCacheKey])

  const closeMenu = () => setMenuOpen(false)
  const entryAccount = () => {
    const account = readAccountPresence()
    return {
      hasSession: account.hasSession,
      needsAccount: account.needsAccount,
      organizationId: account.session?.user.organizationId ?? null,
    }
  }
  const notifyUnavailable = (title: string) =>
    Taro.showToast({ title, icon: 'none', duration: 2200 })
  const navigateToSection = async (section: PublicSection) => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      await runNavigationEntry(section, {
        getConfiguration,
        account: entryAccount,
        getCapabilities: productConfigRepository.getCapabilities,
        navigate: () => performNavigation(section),
        notify: notifyUnavailable,
      })
    } else await performNavigation(section)
  }
  const performNavigation = async (section: PublicSection) => {
    const guest = Taro.getEnv() === Taro.ENV_TYPE.WEB && !readAccountPresence().hasSession
    const destination = guest && section === 'team' ? 'teams' : section
    const targetPath = getSectionPath(destination, tournamentId)
    if (navigationLock.current) return
    if (currentPath === normalizePath(targetPath)) {
      if (section === 'team' && isDesktopH5() && shellRef.current) playTeamFocus(shellRef.current)
      onActiveReselect?.()
      return
    }
    closeMenu()
    navigationLock.current = true
    const desktopH5 = isDesktopH5()
    if (desktopH5 && shellRef.current) {
      const target = section === 'teams' ? 'team' : section === 'tournaments' ? 'data' : section
      captureNavigationOrigin(shellRef.current, target)
    } else {
      setNavigatingTo(section)
    }
    try {
      if (!desktopH5 && !prefersReducedMotion()) await wait(160)
      await goToSection(destination, tournamentId)
    } catch {
      clearNavigationOrigin()
      await Taro.showToast({ title: '页面切换失败，请重试', icon: 'none' })
    } finally {
      navigationLock.current = false
      setNavigatingTo(null)
    }
  }
  const logout = async () => {
    closeMenu()
    primaryTeamCache.clear()
    try {
      await productRepository.logout()
    } finally {
      await Taro.reLaunch({ url: '/pages/login/index' })
    }
  }
  const openFeedback = async () => {
    closeMenu()
    if (!session) {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB)
      await runPrivateEntry(null, {
        getConfiguration,
        account: entryAccount,
        getCapabilities: productConfigRepository.getCapabilities,
        navigate: () => {
          setFeedbackOpen(true)
        },
        notify: notifyUnavailable,
      })
    else setFeedbackOpen(true)
  }
  const openPrivateMenu = async (kind: 'messages' | 'settings') => {
    closeMenu()
    const open = () => {
      if (kind === 'messages') openMessaging()
      else setSettingsOpen(true)
    }
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB)
      await runPrivateEntry(kind === 'messages' ? 'messages.read' : null, {
        getConfiguration,
        account: entryAccount,
        getCapabilities: productConfigRepository.getCapabilities,
        navigate: open,
        notify: notifyUnavailable,
      })
    else open()
  }

  return (
    <View
      ref={shellRef}
      className={`public-app ${Taro.getEnv() === Taro.ENV_TYPE.WEB ? 'public-app--h5' : ''} public-app--section-${normalizedActive} ${active === 'home' && !showBack ? 'public-app--home' : ''}`}
    >
      <View className="public-topbar">
        <View className="public-topbar__inner">
          <View className="public-brand-area">
            {showBack && (
              <IconButton
                icon="back"
                aria-label="返回"
                className="public-back"
                onClick={() => void goBack(active, tournamentId)}
              >
                <Text className="public-back__glyph">←</Text>
              </IconButton>
            )}
            <View className="public-brand" onClick={() => void navigateToSection('home')}>
              <View aria-hidden="true" className="public-brand__mark" />
              <View className="public-brand__copy">
                <Text className="public-brand__name">晓球</Text>
                <Text className="public-brand__caption">把校园比赛认真记录下来</Text>
              </View>
            </View>
          </View>

          <View className={`public-nav public-nav--selected-${selectedNavItem}`}>
            <View aria-hidden="true" className="public-nav__selection">
              <View className="public-nav__line" />
              <View className="public-nav__arc" />
            </View>
            {navItems.map((item) =>
              item.key === 'team' ? (
                <Button
                  aria-label={primaryTeam ? `打开${primaryTeam.name}` : '打开主队'}
                  className={`public-team-nav ${selectedNavItem === item.key ? 'public-team-nav--active' : ''}`}
                  key={item.key}
                  aria-current={normalizedActive === item.key ? 'page' : undefined}
                  onClick={() => void navigateToSection(item.key)}
                >
                  <TeamNavFocus team={primaryTeam} />
                  {primaryTeam ? (
                    <TeamCrest team={primaryTeam} size="large" />
                  ) : (
                    <Text className="public-team-nav__crest public-team-nav__crest--empty">主</Text>
                  )}
                </Button>
              ) : (
                <Button
                  className={`public-nav__item ${selectedNavItem === item.key ? 'public-nav__item--active' : ''}`}
                  key={item.key}
                  aria-current={normalizedActive === item.key ? 'page' : undefined}
                  onClick={() => void navigateToSection(item.key)}
                >
                  <View
                    aria-hidden="true"
                    className={`public-nav__icon public-nav__icon--${item.key}`}
                  />
                  <Text className="public-nav__label">{item.label}</Text>
                </Button>
              ),
            )}
          </View>

          <View className="public-account-wrap">
            <View className="public-header-search">
              {headerSearch === undefined ? <PersistentHeaderSearch /> : headerSearch}
            </View>
            {desktopAccount ? (
              <DesktopAccount
                user={session?.user ?? null}
                onProfile={() => void navigateToSection('me')}
                onMessages={() => void openPrivateMenu('messages')}
                onSettings={() => void openPrivateMenu('settings')}
                onFeedback={() => void openFeedback()}
                onLogout={() => void logout()}
              />
            ) : (
              <>
                <Button
                  aria-label="打开账户菜单"
                  aria-expanded={menuOpen}
                  className="public-account"
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <View className="public-account__avatar">
                    <UserAvatar
                      avatarUrl={session?.user.avatarUrl ?? null}
                      name={session?.user.displayName ?? '访客'}
                      size="small"
                    />
                  </View>
                  <View className="public-account__copy">
                    <Text className="public-account__name">
                      {session?.user.displayName ?? '游客模式'}
                    </Text>
                  </View>
                </Button>

                {menuOpen && (
                  <View className="public-account-menu">
                    <View className="public-account-menu__identity">
                      <Text>{session?.user.displayName ?? '游客'}</Text>
                      <Text>{session ? `@${session.user.username}` : '公开浏览模式'}</Text>
                    </View>
                    {!session && (
                      <Button
                        className="public-account-menu__item"
                        onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}
                      >
                        登录或注册
                      </Button>
                    )}
                    {session && (
                      <Button
                        className="public-account-menu__item"
                        onClick={() => void openPrivateMenu('messages')}
                      >
                        消息与私信
                      </Button>
                    )}
                    <Button
                      className="public-account-menu__item"
                      onClick={() => void openFeedback()}
                    >
                      问题反馈
                    </Button>
                    <Button
                      className="public-account-menu__item"
                      onClick={() => void openPrivateMenu('settings')}
                    >
                      设置
                    </Button>
                    <View className="public-account-menu__version">
                      <Text>晓球 V1.0.0</Text>
                    </View>
                    {session && (
                      <Button
                        className="public-account-menu__item public-account-menu__item--danger"
                        onClick={() => void logout()}
                      >
                        退出登录
                      </Button>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </View>

      {menuOpen && !desktopAccount && <View className="public-menu-scrim" onClick={closeMenu} />}

      {source === 'mock' && (
        <View className="mock-banner">
          <Text className="mock-banner__label">开发演示数据</Text>
          <Text className="mock-banner__copy">当前未连接公开 API，页面内容均为虚构数据。</Text>
        </View>
      )}

      <View className="public-content">{children}</View>

      <View className="public-footer">
        <Text className="public-footer__brand">晓球</Text>
        <Text className="public-footer__copy">校园足球的赛程、球队与公开名单</Text>
      </View>

      <View className="mobile-tabbar">
        {navItems.map((item) =>
          item.key === 'team' ? (
            <Button
              aria-label={primaryTeam ? `打开${primaryTeam.name}` : '打开主队'}
              className={`mobile-team-tab ${normalizedActive === item.key ? 'mobile-team-tab--active' : ''} ${navigatingTo === item.key ? 'mobile-team-tab--switching' : ''}`}
              key={item.key}
              onClick={() => void navigateToSection(item.key)}
            >
              {primaryTeam ? (
                <TeamCrest team={primaryTeam} size="large" />
              ) : (
                <Text className="mobile-team-tab__crest mobile-team-tab__crest--empty">主</Text>
              )}
            </Button>
          ) : (
            <Button
              className={`mobile-tabbar__item ${normalizedActive === item.key ? 'mobile-tabbar__item--active' : ''} ${navigatingTo === item.key ? 'mobile-tabbar__item--switching' : ''}`}
              key={item.key}
              onClick={() => void navigateToSection(item.key)}
            >
              <Text className="mobile-tabbar__mark">{item.shortLabel}</Text>
              <Text className="mobile-tabbar__label">{item.label}</Text>
            </Button>
          ),
        )}
      </View>
      {session && <MessagingDrawer />}
      {feedbackOpen && (
        <ReportModal
          targetType="FEEDBACK"
          title="问题反馈"
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </View>
  )
}

async function goBack(active: PublicSection, tournamentId?: string) {
  try {
    await Taro.navigateBack({ delta: 1 })
  } catch {
    await goToSection(active, tournamentId)
  }
}

async function goToSection(section: PublicSection, tournamentId?: string) {
  if (section === 'me' && !readSession()) {
    await Taro.reLaunch({ url: '/pages/login/index' })
    return
  }
  const url = getSectionPath(section, tournamentId)
  if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
    await Taro.redirectTo({ url })
    return
  }
  await Taro.reLaunch({ url })
}

function getSectionPath(section: PublicSection, tournamentId?: string): string {
  const encodedTournamentId = tournamentId ? encodeURIComponent(tournamentId) : ''
  const fallback = '/pages/readonly-tournaments/index'
  const paths: Record<PublicSection, string> = {
    home: '/pages/index/index',
    tournaments: fallback,
    schedule: encodedTournamentId
      ? `/pages/readonly-schedule/index?tournamentId=${encodedTournamentId}`
      : fallback,
    teams: encodedTournamentId
      ? `/pages/readonly-teams/index?tournamentId=${encodedTournamentId}`
      : fallback,
    data: encodedTournamentId
      ? `/pages/data-center/index?tournamentId=${encodedTournamentId}`
      : '/pages/data-center/index',
    team: encodedTournamentId
      ? `/pages/my-team/index?tournamentId=${encodedTournamentId}`
      : '/pages/my-team/index',
    me: '/pages/me/index',
  }
  return paths[section]
}

function normalizePath(path: string): string {
  const pathname = path.split('?')[0] ?? ''
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function isDesktopH5(): boolean {
  return (
    Taro.getEnv() === Taro.ENV_TYPE.WEB &&
    typeof window !== 'undefined' &&
    window.matchMedia('(min-width: 721px)').matches
  )
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration))
}
