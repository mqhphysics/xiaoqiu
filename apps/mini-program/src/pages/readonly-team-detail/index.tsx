import { useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'

import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type { ReadonlyTeam } from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; team: ReadonlyTeam; source: 'api' | 'mock' }

export default function ReadonlyTeamDetailPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const teamId = getCurrentInstance().router?.params.teamId ?? ''

  const loadTeam = async () => {
    if (!teamId) {
      setState({ status: 'failed', message: '缺少球队参数，请从赛程或赛事详情进入。' })
      return
    }

    setState({ status: 'loading' })
    try {
      const result = await readonlyScheduleRepository.getTeam(teamId)
      if (!result.data) {
        setState({ status: 'failed', message: '未找到该球队信息。' })
        return
      }
      setState({ status: 'ready', team: result.data, source: result.source })
    } catch (error) {
      const message = error instanceof Error ? error.message : '球队详情加载失败'
      setState({ status: 'failed', message })
    }
  }

  useEffect(() => {
    void loadTeam()
  }, [teamId])

  if (state.status === 'loading') {
    return (
      <View className="readonly-team-detail page-state">
        <Text>正在加载球队信息...</Text>
      </View>
    )
  }

  if (state.status === 'failed') {
    return (
      <View className="readonly-team-detail page-state">
        <Text className="state-title">加载失败</Text>
        <Text className="state-desc">{state.message}</Text>
        <Button className="retry-button" onClick={() => void loadTeam()}>
          重试
        </Button>
      </View>
    )
  }

  const { team, source } = state

  return (
    <View className="readonly-team-detail">
      <View className="hero-card">
        <View className="source-pill">{source === 'mock' ? 'Mock 数据' : 'API 数据'}</View>
        <Text className="team-name">{team.name}</Text>
        <Text className="team-meta">
          {team.shortName} · {team.groupName}
        </Text>
        <View className="color-row">
          <Text className="color-label">队服颜色</Text>
          <Text className="color-value">{team.colors}</Text>
        </View>
      </View>

      <View className="section-card">
        <Text className="section-title">球队成员</Text>
        <View className="info-grid">
          <View className="info-item">
            <Text className="info-label">教练</Text>
            <Text className="info-value">{team.coachName}</Text>
          </View>
          <View className="info-item">
            <Text className="info-label">队长</Text>
            <Text className="info-value">{team.captainName}</Text>
          </View>
        </View>
        <View className="roster-list">
          {team.rosterPreview.map((player) => (
            <View key={player} className="roster-item">
              {player}
            </View>
          ))}
        </View>
      </View>

      <Button
        className="primary-button"
        onClick={() =>
          void Taro.navigateTo({
            url: `/pages/readonly-tournament-detail/index?tournamentId=${team.tournamentId}`,
          })
        }
      >
        返回赛事详情
      </Button>
    </View>
  )
}
