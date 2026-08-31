import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { PropsWithChildren } from 'react'

import type { PublicDataSource } from '../../features/readonly-schedule/readonly-schedule.types'
import { readSession } from '../../features/product/session'

import './index.scss'

type PublicSection = 'home' | 'schedule' | 'data' | 'team' | 'me' | 'tournaments' | 'teams'

interface PublicShellProps extends PropsWithChildren {
  active: PublicSection
  tournamentId?: string | undefined
  source?: PublicDataSource | undefined
}

const navItems: Array<{ key: PublicSection; label: string; shortLabel: string }> = [
  { key: 'home', label: '首页', shortLabel: 'HOME' },
  { key: 'schedule', label: '赛程', shortLabel: 'MATCH' },
  { key: 'data', label: '数据', shortLabel: 'DATA' },
  { key: 'team', label: '主队', shortLabel: 'CLUB' },
  { key: 'me', label: '我的', shortLabel: 'ME' },
]

export function PublicShell({ active, tournamentId, source, children }: PublicShellProps) {
  const session = readSession()
  const normalizedActive = active === 'teams' ? 'team' : active === 'tournaments' ? 'data' : active

  return (
    <View className="public-app">
      <View className="public-topbar">
        <View className="public-topbar__inner">
          <View className="public-brand" onClick={() => void goToSection('home', tournamentId)}>
            <Text className="public-brand__mark">XQ</Text>
            <View className="public-brand__copy">
              <Text className="public-brand__name">晓球</Text>
              <Text className="public-brand__caption">把校园比赛认真记录下来</Text>
            </View>
          </View>

          <View className="public-nav">
            {navItems.map((item) => (
              <Button
                className={`public-nav__item ${normalizedActive === item.key ? 'public-nav__item--active' : ''}`}
                key={item.key}
                onClick={() => void goToSection(item.key, tournamentId)}
              >
                <Text className="public-nav__label">{item.label}</Text>
              </Button>
            ))}
          </View>

          <View className="public-account" onClick={() => void goToSection('me', tournamentId)}>
            <Text className="public-account__avatar">
              {session?.user.displayName.slice(0, 1) ?? '访'}
            </Text>
            <View className="public-account__copy">
              <Text className="public-account__name">
                {session?.user.displayName ?? '游客模式'}
              </Text>
              <Text className="public-account__hint">{session ? '账户已登录' : '登录体验完整功能'}</Text>
            </View>
          </View>
        </View>
      </View>

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
        {navItems.map((item) => (
          <Button
            className={`mobile-tabbar__item ${normalizedActive === item.key ? 'mobile-tabbar__item--active' : ''}`}
            key={item.key}
            onClick={() => void goToSection(item.key, tournamentId)}
          >
            <Text className="mobile-tabbar__mark">{item.shortLabel}</Text>
            <Text className="mobile-tabbar__label">{item.label}</Text>
          </Button>
        ))}
      </View>
    </View>
  )
}

async function goToSection(section: PublicSection, tournamentId?: string) {
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

  await Taro.reLaunch({ url: paths[section] })
}
