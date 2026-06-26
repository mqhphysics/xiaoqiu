import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type { ReadonlyTournamentDetail } from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'LOADING' }
  | { phase: 'FAILED'; message: string }
  | { phase: 'READY'; tournament: ReadonlyTournamentDetail; source: 'api' | 'mock' }

export default function ReadonlyTournamentDetailPage() {
  const [state, setState] = useState<PageState>({ phase: 'LOADING' })
  const tournamentId =
    getCurrentInstance().router?.params.tournamentId ?? 'tournament-campus-cup-2026'

  const load = useCallback(async () => {
    setState({ phase: 'LOADING' })
    try {
      const result = await readonlyScheduleRepository.getTournament(tournamentId)
      if (!result.data) {
        setState({ phase: 'FAILED', message: '没有找到该赛事。' })
        return
      }
      setState({ phase: 'READY', tournament: result.data, source: result.source })
    } catch {
      setState({ phase: 'FAILED', message: '赛事详情加载失败，请稍后重试。' })
    }
  }, [tournamentId])

  useEffect(() => {
    void load()
  }, [load])

  if (state.phase === 'LOADING') {
    return <Text className="state-card">正在加载赛事详情…</Text>
  }

  if (state.phase === 'FAILED') {
    return (
      <View className="detail-page">
        <View className="state-card">
          <Text className="state-card__title">{state.message}</Text>
          <Button className="primary-button" onClick={() => void load()}>
            重试
          </Button>
        </View>
      </View>
    )
  }

  const { tournament } = state
  return (
    <View className="detail-page">
      <View className="summary-card">
        <Text className="summary-card__status">{tournament.statusText}</Text>
        <Text className="summary-card__title">{tournament.name}</Text>
        <Text className="summary-card__meta">
          {tournament.organizationName} · {tournament.seasonName}
        </Text>
        <Text className="summary-card__copy">{tournament.description}</Text>
        <Text className="summary-card__source">
          数据来源：{state.source === 'api' ? '只读 API' : '本地 mock fixture'}
        </Text>
      </View>

      <View className="action-grid">
        <Button
          className="primary-button"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/readonly-schedule/index?tournamentId=${tournament.id}`,
            })
          }
        >
          查看赛程
        </Button>
      </View>

      <View className="section-card">
        <Text className="section-title">赛事规则</Text>
        {tournament.rules.map((rule) => (
          <Text className="rule-line" key={rule}>
            {rule}
          </Text>
        ))}
      </View>

      <View className="section-card">
        <Text className="section-title">参赛球队</Text>
        {tournament.teams.map((team) => (
          <View
            className="team-row"
            key={team.id}
            onClick={() =>
              void Taro.navigateTo({ url: `/pages/readonly-team-detail/index?teamId=${team.id}` })
            }
          >
            <Text className="team-row__name">{team.name}</Text>
            <Text className="team-row__meta">
              {team.groupName} · 队长 {team.captainName}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
