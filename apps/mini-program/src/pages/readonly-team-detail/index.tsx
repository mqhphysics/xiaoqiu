import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState, SectionHeading, TeamMark } from '../../components/public-ui'
import {
  getRegistrationStatusText,
  getRosterStatusText,
} from '../../features/readonly-schedule/readonly-schedule.logic'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type {
  PublicDataSource,
  ReadonlyTeam,
} from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; team: ReadonlyTeam; source: PublicDataSource }

export default function ReadonlyTeamDetailPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const params = getCurrentInstance().router?.params
  const tournamentId = params?.tournamentId ?? ''
  const teamId = params?.teamId ?? ''

  const load = useCallback(async () => {
    if (!tournamentId || !teamId) {
      setState({ phase: 'failed', message: '缺少赛事或球队参数，请从球队列表进入。' })
      return
    }

    setState({ phase: 'loading' })
    try {
      const result = await readonlyScheduleRepository.getTeam(tournamentId, teamId)
      if (!result.data) {
        setState({ phase: 'failed', message: '没有找到该球队，或球队名单尚未公开。' })
        return
      }
      setState({ phase: 'ready', team: result.data, source: result.source })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '球队详情加载失败，请稍后重试。',
      })
    }
  }, [teamId, tournamentId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell
      active="teams"
      tournamentId={tournamentId}
      source={state.phase === 'ready' ? state.source : undefined}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取球队与公开名单" />}

      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="球队详情不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}

      {state.phase === 'ready' && <TeamContent team={state.team} />}
    </PublicShell>
  )
}

function TeamContent({ team }: { team: ReadonlyTeam }) {
  return (
    <View>
      <View className="team-detail-hero">
        <View className="team-detail-hero__identity">
          <View className="team-detail-mark">
            <TeamMark teamCode={team.teamCode} name={team.name} />
          </View>
          <View className="team-detail-hero__copy">
            <Text className="team-detail-hero__eyebrow">{team.teamCode}</Text>
            <Text className="team-detail-hero__title">{team.name}</Text>
            <Text className="team-detail-hero__short">{team.shortName}</Text>
          </View>
        </View>
        <View className="team-detail-hero__statuses">
          <Text className="status-tag status-tag--approved">
            {getRegistrationStatusText(team.registrationStatus)}
          </Text>
          <Text className="status-tag status-tag--locked">
            {getRosterStatusText(team.rosterStatus)}
          </Text>
        </View>
      </View>

      <View className="team-detail-facts">
        <View className="team-detail-fact">
          <Text className="team-detail-fact__label">领队</Text>
          <Text className="team-detail-fact__value">{team.leaderDisplayName ?? '未公开'}</Text>
        </View>
        <View className="team-detail-fact">
          <Text className="team-detail-fact__label">教练</Text>
          <Text className="team-detail-fact__value">{team.coachDisplayName ?? '未公开'}</Text>
        </View>
        <View className="team-detail-fact">
          <Text className="team-detail-fact__label">名单版本</Text>
          <Text className="team-detail-fact__value">
            {team.rosterSnapshotVersion === null ? '待锁定' : `v${team.rosterSnapshotVersion}`}
          </Text>
        </View>
        <View className="team-detail-fact">
          <Text className="team-detail-fact__label">公开球员</Text>
          <Text className="team-detail-fact__value">{team.rosterPlayerCount} 人</Text>
        </View>
      </View>

      <View className="content-section">
        <SectionHeading eyebrow="PUBLIC ROSTER" title="公开名单" action="姓名与球衣号" />
        {team.players.length === 0 ? (
          <DataState
            kind="empty"
            title="暂无公开球员"
            description="名单锁定后，允许公开的姓名和球衣号会显示在这里。"
          />
        ) : (
          <View className="roster-table surface">
            <View className="roster-table__head">
              <Text>号码</Text>
              <Text>球员</Text>
            </View>
            {team.players.map((player) => (
              <View className="roster-table__row" key={player.id}>
                <Text className="roster-table__number">{player.shirtNumber ?? '-'}</Text>
                <Text className="roster-table__name">{player.displayName}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="team-detail-actions">
        <Button
          className="button button--secondary"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/readonly-teams/index?tournamentId=${encodeURIComponent(team.tournamentId)}`,
            })
          }
        >
          返回球队列表
        </Button>
        <Button
          className="button button--outline"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(team.tournamentId)}`,
            })
          }
        >
          查看赛事赛程
        </Button>
      </View>
    </View>
  )
}
