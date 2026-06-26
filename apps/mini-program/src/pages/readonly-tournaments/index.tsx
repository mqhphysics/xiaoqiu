import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import {
  readonlyScheduleRepository,
} from '../../features/readonly-schedule/readonly-schedule.repository'
import type { ReadonlyTournamentSummary } from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'LOADING' }
  | { phase: 'FAILED'; message: string }
  | { phase: 'READY'; tournaments: ReadonlyTournamentSummary[]; source: 'api' | 'mock' }

export default function ReadonlyTournamentsPage() {
  const [state, setState] = useState<PageState>({ phase: 'LOADING' })

  const load = useCallback(async () => {
    setState({ phase: 'LOADING' })
    try {
      const result = await readonlyScheduleRepository.listTournaments()
      setState({ phase: 'READY', tournaments: result.data, source: result.source })
    } catch {
      setState({ phase: 'FAILED', message: '赛事列表加载失败，请稍后重试。' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View className="readonly-page">
      <View className="hero">
        <Text className="hero__eyebrow">P1 READONLY</Text>
        <Text className="hero__title">赛事与赛程</Text>
        <Text className="hero__copy">先把公开赛事看清楚，再进入报名和比赛数据闭环。</Text>
      </View>

      {state.phase === 'LOADING' && <Text className="state-card">正在加载赛事…</Text>}

      {state.phase === 'FAILED' && (
        <View className="state-card">
          <Text className="state-card__title">{state.message}</Text>
          <Button className="state-card__button" onClick={() => void load()}>
            重试
          </Button>
        </View>
      )}

      {state.phase === 'READY' && state.tournaments.length === 0 && (
        <Text className="state-card">暂无已发布赛事。</Text>
      )}

      {state.phase === 'READY' && state.tournaments.length > 0 && (
        <View className="tournament-list">
          <Text className="source-note">
            数据来源：{state.source === 'api' ? '只读 API' : '本地 mock fixture'}
          </Text>
          {state.tournaments.map((tournament) => (
            <View
              className="tournament-card"
              key={tournament.id}
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/readonly-tournament-detail/index?tournamentId=${tournament.id}`,
                })
              }
            >
              <Text className="tournament-card__status">{tournament.statusText}</Text>
              <Text className="tournament-card__title">{tournament.name}</Text>
              <Text className="tournament-card__meta">
                {tournament.seasonName} · {tournament.teamCount} 队 · {tournament.matchCount} 场
              </Text>
              <Text className="tournament-card__copy">{tournament.description}</Text>
              <Text className="tournament-card__date">
                {tournament.startDate} 至 {tournament.endDate}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
