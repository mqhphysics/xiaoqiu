import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { PropsWithChildren } from 'react'

import type { PublicDataSource } from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PublicSection = 'home' | 'tournaments' | 'schedule' | 'teams'

interface PublicShellProps extends PropsWithChildren {
  active: PublicSection
  tournamentId?: string | undefined
  source?: PublicDataSource | undefined
}

const navItems: Array<{ key: PublicSection; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'tournaments', label: '赛事' },
  { key: 'schedule', label: '赛程' },
  { key: 'teams', label: '球队' },
]

export function PublicShell({ active, tournamentId, source, children }: PublicShellProps) {
  return (
    <View className="public-app">
      <View className="public-topbar">
        <View className="public-topbar__inner">
          <View className="public-brand" onClick={() => void goToSection('home', tournamentId)}>
            <Text className="public-brand__mark">XQ</Text>
            <View className="public-brand__copy">
              <Text className="public-brand__name">晓球</Text>
              <Text className="public-brand__caption">校园足球赛事</Text>
            </View>
          </View>

          <View className="public-nav">
            {navItems.map((item) => (
              <Button
                className={`public-nav__item ${active === item.key ? 'public-nav__item--active' : ''}`}
                key={item.key}
                onClick={() => void goToSection(item.key, tournamentId)}
              >
                {item.label}
              </Button>
            ))}
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
  }

  await Taro.reLaunch({ url: paths[section] })
}
