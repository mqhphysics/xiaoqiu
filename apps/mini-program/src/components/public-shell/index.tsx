import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState, type PropsWithChildren } from 'react'

import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type { TeamSummary } from '../../features/product/product.types'
import type { PublicDataSource } from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PublicSection = 'home' | 'schedule' | 'data' | 'team' | 'me' | 'tournaments' | 'teams'

interface PublicShellProps extends PropsWithChildren {
  active: PublicSection
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

export function PublicShell({
  active,
  onActiveReselect,
  tournamentId,
  source,
  showBack = false,
  children,
}: PublicShellProps) {
  const session = readSession()
  const teamCacheKey = session ? `${session.user.id}:${session.expiresAt}` : null
  const [menuOpen, setMenuOpen] = useState(false)
  const [primaryTeam, setPrimaryTeam] = useState<TeamSummary | null>(() =>
    teamCacheKey && primaryTeamCache.has(teamCacheKey)
      ? (primaryTeamCache.get(teamCacheKey) ?? null)
      : null,
  )
  const [navigatingTo, setNavigatingTo] = useState<PublicSection | null>(null)
  const normalizedActive = active === 'teams' ? 'team' : active === 'tournaments' ? 'data' : active
  const currentPath = normalizePath(getCurrentInstance().router?.path ?? '')

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

  const closeMenu = () => setMenuOpen(false)
  const navigateToSection = async (section: PublicSection) => {
    const targetPath = getSectionPath(section, tournamentId)
    if (navigatingTo) return
    if (currentPath === normalizePath(targetPath)) {
      onActiveReselect?.()
      return
    }
    closeMenu()
    setNavigatingTo(section)
    try {
      if (!prefersReducedMotion()) await wait(130)
      await goToSection(section, tournamentId)
    } catch {
      await Taro.showToast({ title: '页面切换失败，请重试', icon: 'none' })
    } finally {
      setNavigatingTo(null)
    }
  }
  const logout = async () => {
    closeMenu()
    primaryTeamCache.clear()
    await productRepository.logout()
    await Taro.reLaunch({ url: '/pages/login/index' })
  }

  return (
    <View className="public-app">
      <View className="public-topbar">
        <View className="public-topbar__inner">
          <View className="public-brand-area">
            {showBack && (
              <Button
                aria-label="返回"
                className="public-back"
                onClick={() => void goBack(active, tournamentId)}
              >
                <Text className="public-back__glyph">←</Text>
              </Button>
            )}
            <View className="public-brand" onClick={() => void navigateToSection('home')}>
              <Text className="public-brand__mark">XQ</Text>
              <View className="public-brand__copy">
                <Text className="public-brand__name">晓球</Text>
                <Text className="public-brand__caption">把校园比赛认真记录下来</Text>
              </View>
            </View>
          </View>

          <View className="public-nav">
            {navItems.map((item) =>
              item.key === 'team' ? (
                <Button
                  aria-label={primaryTeam ? `打开${primaryTeam.name}` : '打开主队'}
                  className={`public-team-nav ${normalizedActive === item.key ? 'public-team-nav--active' : ''} ${navigatingTo === item.key ? 'public-team-nav--switching' : ''}`}
                  key={item.key}
                  onClick={() => void navigateToSection(item.key)}
                >
                  <Text
                    className="public-team-nav__crest"
                    style={
                      primaryTeam?.primaryColor ? { backgroundColor: primaryTeam.primaryColor } : {}
                    }
                  >
                    {primaryTeam?.shortName.slice(0, 2) ?? '杯'}
                  </Text>
                </Button>
              ) : (
                <Button
                  className={`public-nav__item ${normalizedActive === item.key ? 'public-nav__item--active' : ''} ${navigatingTo === item.key ? 'public-nav__item--switching' : ''}`}
                  key={item.key}
                  onClick={() => void navigateToSection(item.key)}
                >
                  <Text className="public-nav__label">{item.label}</Text>
                </Button>
              ),
            )}
          </View>

          <View className="public-account-wrap">
            <Button
              aria-label="打开账户菜单"
              aria-expanded={menuOpen}
              className="public-account"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <Text className="public-account__avatar">
                {session?.user.displayName.slice(0, 1) ?? '访'}
              </Text>
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
                <Button className="public-account-menu__item" onClick={() => void showFeedback()}>
                  问题反馈
                </Button>
                <Button className="public-account-menu__item" onClick={() => void showContact()}>
                  联系赛事组
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
          </View>
        </View>
      </View>

      {menuOpen && <View className="public-menu-scrim" onClick={closeMenu} />}

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
              <Text
                className="mobile-team-tab__crest"
                style={
                  primaryTeam?.primaryColor ? { backgroundColor: primaryTeam.primaryColor } : {}
                }
              >
                {primaryTeam?.shortName.slice(0, 2) ?? '杯'}
              </Text>
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

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration))
}

async function showFeedback() {
  await Taro.showToast({ title: '反馈工单将在下一版本接入', icon: 'none', duration: 2200 })
}

async function showContact() {
  await Taro.showModal({
    title: '联系赛事组',
    content: '请联系绿茵杯赛事工作组；正式联系方式将在上线前补充。',
    showCancel: false,
  })
}
