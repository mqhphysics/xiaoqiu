import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import {
  formatDateLabel,
  formatMatchTime,
  getMatchStatusText,
  getMatchStatusTone,
} from '../../features/readonly-schedule/readonly-schedule.logic'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type { ReadonlyMatch } from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'LOADING' }
  | { phase: 'FAILED'; message: string }
  | { phase: 'READY'; match: ReadonlyMatch; source: 'api' | 'mock' }

export default function ReadonlyMatchDetailPage() {
  const [state, setState] = useState<PageState>({ phase: 'LOADING' })
  const matchId = getCurrentInstance().router?.params.matchId ?? 'match-001'

  const load = useCallback(async () => {
    setState({ phase: 'LOADING' })
    try {
      const result = await readonlyScheduleRepository.getMatch(matchId)
      if (!result.data) {
        setState({ phase: 'FAILED', message: '没有找到该比赛。' })
        return
      }
      setState({ phase: 'READY', match: result.data, source: result.source })
    } catch {
      setState({ phase: 'FAILED', message: '比赛详情加载失败，请稍后重试。' })
    }
  }, [matchId])

  useEffect(() => {
    void load()
  }, [load])

  if (state.phase === 'LOADING') {
    return <Text className="state-card">正在加载比赛详情…</Text>
  }

  if (state.phase === 'FAILED') {
    return (
      <View className="match-page">
        <View className="state-card">
          <Text className="state-card__title">{state.message}</Text>
          <Button className="primary-button" onClick={() => void load()}>
            重试
          </Button>
        </View>
      </View>
    )
  }

  const { match } = state
  return (
    <View className="match-page">
      <View className="match-hero">
        <Text className={`status-pill status-pill--${getMatchStatusTone(match.status)}`}>
          {getMatchStatusText(match.status)}
        </Text>
        <View className="versus">
          <Text className="team-name">{match.homeTeamName}</Text>
          <Text className="versus-mark">VS</Text>
          <Text className="team-name">{match.awayTeamName}</Text>
        </View>
        <Text className="source-note">
          数据来源：{state.source === 'api' ? '只读 API' : '本地 mock fixture'}
        </Text>
      </View>

      <View className="info-card">
        <Text className="info-title">比赛信息</Text>
        <Text className="info-line">
          {formatDateLabel(match.scheduledStartAt)} {formatMatchTime(match.scheduledStartAt)}
        </Text>
        <Text className="info-line">
          {match.stageName} · {match.roundName} · {match.groupName ?? '淘汰赛'}
        </Text>
        <Text className="info-line">
          {match.venueName} · {match.pitchName}
        </Text>
        {match.statusReason && <Text className="warning-line">{match.statusReason}</Text>}
      </View>

      <View className="action-row">
        <Button
          className="primary-button"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/readonly-team-detail/index?teamId=${match.homeTeamId}`,
            })
          }
        >
          主队详情
        </Button>
        <Button
          className="secondary-button"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/readonly-team-detail/index?teamId=${match.awayTeamId}`,
            })
          }
        >
          客队详情
        </Button>
      </View>
    </View>
  )
}
