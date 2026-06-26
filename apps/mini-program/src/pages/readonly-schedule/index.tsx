import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import {
  formatMatchTime,
  getMatchStatusText,
  getMatchStatusTone,
  groupMatchesByDateAndStage,
} from '../../features/readonly-schedule/readonly-schedule.logic'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type { ScheduleDateGroup } from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'LOADING' }
  | { phase: 'FAILED'; message: string }
  | { phase: 'READY'; groups: ScheduleDateGroup[]; source: 'api' | 'mock' }

export default function ReadonlySchedulePage() {
  const [state, setState] = useState<PageState>({ phase: 'LOADING' })
  const tournamentId =
    getCurrentInstance().router?.params.tournamentId ?? 'tournament-campus-cup-2026'

  const load = useCallback(async () => {
    setState({ phase: 'LOADING' })
    try {
      const result = await readonlyScheduleRepository.listMatches(tournamentId)
      setState({
        phase: 'READY',
        groups: groupMatchesByDateAndStage(result.data),
        source: result.source,
      })
    } catch {
      setState({ phase: 'FAILED', message: '赛程加载失败，请稍后重试。' })
    }
  }, [tournamentId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View className="schedule-page">
      <View className="schedule-header">
        <Text className="schedule-header__title">按日期查看赛程</Text>
        <Text className="schedule-header__copy">小组赛与淘汰赛分阶段展示，移动端优先保证清晰。</Text>
      </View>

      {state.phase === 'LOADING' && <Text className="state-card">正在加载赛程…</Text>}

      {state.phase === 'FAILED' && (
        <View className="state-card">
          <Text className="state-card__title">{state.message}</Text>
          <Button className="retry-button" onClick={() => void load()}>
            重试
          </Button>
        </View>
      )}

      {state.phase === 'READY' && (
        <View>
          <Text className="source-note">
            数据来源：{state.source === 'api' ? '只读 API' : '本地 mock fixture'}
          </Text>
          {state.groups.length === 0 && <Text className="state-card">暂无已发布赛程。</Text>}
          {state.groups.map((dateGroup) => (
            <View className="date-group" key={dateGroup.dateKey}>
              <Text className="date-title">{dateGroup.dateLabel}</Text>
              {dateGroup.stages.map((stage) => (
                <View className="stage-group" key={`${dateGroup.dateKey}-${stage.stageName}`}>
                  <Text className="stage-title">{stage.stageName}</Text>
                  {stage.matches.map((match) => (
                    <View
                      className="match-card"
                      key={match.id}
                      onClick={() =>
                        void Taro.navigateTo({
                          url: `/pages/readonly-match-detail/index?matchId=${match.id}`,
                        })
                      }
                    >
                      <View className="match-card__top">
                        <Text className="match-card__time">{formatMatchTime(match.scheduledStartAt)}</Text>
                        <Text className={`status-pill status-pill--${getMatchStatusTone(match.status)}`}>
                          {getMatchStatusText(match.status)}
                        </Text>
                      </View>
                      <Text className="match-card__teams">
                        {match.homeTeamName} vs {match.awayTeamName}
                      </Text>
                      <Text className="match-card__meta">
                        {match.roundName} · {match.groupName ?? '淘汰赛'} · {match.venueName}
                        {match.pitchName}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
