import { Button, Navigator, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState, SectionHeading } from '../../components/public-ui'
import {
  formatDateLabel,
  formatMatchTime,
  getMatchStatusText,
  getMatchStatusTone,
} from '../../features/readonly-schedule/readonly-schedule.logic'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type {
  PublicDataSource,
  ReadonlyMatch,
} from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; match: ReadonlyMatch; source: PublicDataSource }

export default function ReadonlyMatchDetailPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const matchId = getCurrentInstance().router?.params.matchId ?? ''

  const load = useCallback(async () => {
    if (!matchId) {
      setState({ phase: 'failed', message: '缺少比赛参数，请从赛程进入。' })
      return
    }

    setState({ phase: 'loading' })
    try {
      const result = await readonlyScheduleRepository.getMatch(matchId)
      if (!result.data) {
        setState({ phase: 'failed', message: '没有找到该比赛，或比赛尚未公开。' })
        return
      }
      setState({ phase: 'ready', match: result.data, source: result.source })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '比赛详情加载失败，请稍后重试。',
      })
    }
  }, [matchId])

  useEffect(() => {
    void load()
  }, [load])

  const tournamentId = state.phase === 'ready' ? state.match.tournamentId : undefined

  return (
    <PublicShell
      active="schedule"
      tournamentId={tournamentId}
      source={state.phase === 'ready' ? state.source : undefined}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取比赛详情" />}

      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="比赛详情不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}

      {state.phase === 'ready' && <MatchContent match={state.match} />}
    </PublicShell>
  )
}

function MatchContent({ match }: { match: ReadonlyMatch }) {
  return (
    <View>
      <View className="match-detail-heading">
        <View>
          <Text className="match-detail-heading__eyebrow">
            {match.stageName} · {match.roundName}
          </Text>
          <Text className="match-detail-heading__date">
            {formatDateLabel(match.scheduledStartAt)} {formatMatchTime(match.scheduledStartAt)}
          </Text>
        </View>
        <Text className={`status-tag status-tag--${getMatchStatusTone(match.status)}`}>
          {getMatchStatusText(match.status)}
        </Text>
      </View>

      <View className="match-scoreboard">
        <TeamSide
          label="主队"
          name={match.homeTeamName}
          teamId={match.homeTeamId}
          tournamentId={match.tournamentId}
        />
        <View className="match-scoreboard__center">
          <Text className="match-scoreboard__versus">VS</Text>
          <Text className="match-scoreboard__status">{getMatchStatusText(match.status)}</Text>
        </View>
        <TeamSide
          label="客队"
          name={match.awayTeamName}
          teamId={match.awayTeamId}
          tournamentId={match.tournamentId}
        />
      </View>

      <View className="match-info-grid">
        <View className="match-info surface">
          <Text className="match-info__label">比赛时间</Text>
          <Text className="match-info__value">
            {formatDateLabel(match.scheduledStartAt)} {formatMatchTime(match.scheduledStartAt)}
          </Text>
        </View>
        <View className="match-info surface">
          <Text className="match-info__label">比赛场地</Text>
          <Text className="match-info__value">
            {match.venueName}
            {match.pitchName ? ` · ${match.pitchName}` : ''}
          </Text>
        </View>
        <View className="match-info surface">
          <Text className="match-info__label">赛事阶段</Text>
          <Text className="match-info__value">
            {match.stageName} · {match.roundName}
          </Text>
        </View>
      </View>

      {match.statusReason && (
        <View className="match-notice match-notice--warning">
          <Text className="match-notice__label">赛程说明</Text>
          <Text className="match-notice__copy">{match.statusReason}</Text>
        </View>
      )}

      <View className="content-section">
        <SectionHeading eyebrow="MATCH DATA" title="比赛数据" />
        <View className="match-notice">
          <Text className="match-notice__label">暂未提供</Text>
          <Text className="match-notice__copy">
            当前公开数据仅包含比赛时间、场地、对阵与状态，比分和比赛事件尚未接入。
          </Text>
        </View>
      </View>

      <Button
        className="button button--secondary match-back-button"
        onClick={() =>
          void Taro.navigateTo({
            url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(match.tournamentId)}`,
          })
        }
      >
        返回完整赛程
      </Button>
    </View>
  )
}

function TeamSide({
  label,
  name,
  teamId,
  tournamentId,
}: {
  label: string
  name: string
  teamId: string
  tournamentId: string
}) {
  return (
    <View className="match-team">
      <Text className="match-team__label">{label}</Text>
      <Text className="match-team__name">{name}</Text>
      {teamId ? (
        <Navigator
          className="match-team__link"
          url={`/pages/readonly-team-detail/index?tournamentId=${encodeURIComponent(tournamentId)}&teamId=${encodeURIComponent(teamId)}`}
        >
          查看球队
        </Navigator>
      ) : (
        <View className="match-team__link match-team__link--disabled">席位待定</View>
      )}
    </View>
  )
}
