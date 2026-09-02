import { Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchCard, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { positionLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import type { TeamDashboardResponse } from '../../features/product/product.types'

import './index.scss'

const POSITION_GROUPS = [
  { key: 'FORWARD', label: '前锋' },
  { key: 'MIDFIELDER', label: '中场' },
  { key: 'DEFENDER', label: '后卫' },
  { key: 'GOALKEEPER', label: '门将' },
] as const

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; team: TeamDashboardResponse; tournamentId: string }

export default function TeamDetailPage() {
  const params = getCurrentInstance().router?.params
  const teamId = params?.teamId ?? ''
  const routeTournamentId = params?.tournamentId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })

  const load = useCallback(async () => {
    if (!teamId) {
      setState({ phase: 'failed', message: '缺少球队参数。' })
      return
    }
    setState({ phase: 'loading' })
    try {
      const tournamentId = routeTournamentId || (await productRepository.getHome()).tournament.id
      const team = await productRepository.getTeamDashboard(teamId, tournamentId)
      setState({ phase: 'ready', team, tournamentId })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '球队详情加载失败。',
      })
    }
  }, [routeTournamentId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell
      active="team"
      showBack
      tournamentId={state.phase === 'ready' ? state.tournamentId : routeTournamentId}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取球队档案" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="球队详情不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <TeamContent data={state.team} tournamentId={state.tournamentId} />
      )}
    </PublicShell>
  )
}

function TeamContent({
  data,
  tournamentId,
}: {
  data: TeamDashboardResponse
  tournamentId: string
}) {
  const knownPositions = new Set<string>(POSITION_GROUPS.map((group) => group.key))
  const rosterGroups = [
    ...POSITION_GROUPS.map((group) => ({
      ...group,
      players: data.roster.filter((player) => player.position === group.key),
    })),
    {
      key: 'OTHER',
      label: '其他',
      players: data.roster.filter(
        (player) => !player.position || !knownPositions.has(player.position),
      ),
    },
  ].filter((group) => group.players.length > 0)

  return (
    <View>
      <View
        className="public-team-hero"
        style={{ borderColor: data.team.primaryColor ?? '#1f6b45' }}
      >
        <View className="public-team-hero__identity">
          <TeamCrest team={data.team} size="large" />
          <View>
            <Text className="public-team-hero__eyebrow">
              {data.team.teamCode} · {data.team.groupName}
            </Text>
            <Text className="public-team-hero__title">{data.team.name}</Text>
            <Text className="public-team-hero__college">{data.team.collegeName}</Text>
            <Text className="public-team-hero__motto">{data.team.motto}</Text>
          </View>
        </View>
        <View className="public-team-hero__staff">
          <View>
            <Text>队长</Text>
            <Text>{data.team.captainName ?? '未设置'}</Text>
          </View>
          <View>
            <Text>教练</Text>
            <Text>{data.team.coachName ?? '未设置'}</Text>
          </View>
        </View>
      </View>

      <View className="public-team-record">
        <Record value={data.stats.played} label="比赛" />
        <Record value={data.stats.won} label="胜" />
        <Record value={data.stats.drawn} label="平" />
        <Record value={data.stats.lost} label="负" />
        <Record value={data.stats.goalsFor + ':' + data.stats.goalsAgainst} label="进失球" />
        <Record value={data.stats.points} label="积分" accent />
      </View>

      <View className="public-team-about surface">
        <Text className="public-team-about__label">球队简介</Text>
        <Text className="public-team-about__body">{data.team.description ?? '暂无球队简介。'}</Text>
        <Text className="public-team-about__founded">
          {data.team.foundedYear ? '成立于 ' + data.team.foundedYear + ' 年' : ''}
        </Text>
      </View>

      <View className="public-team-section">
        <ProductSection kicker="MATCHES" title="球队赛程" note="近期与待进行" />
        <View className="public-team-match-grid">
          {[...data.upcomingMatches, ...data.recentMatches].slice(0, 6).map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onClick={() =>
                void Taro.navigateTo({
                  url: '/pages/readonly-match-detail/index?matchId=' + encodeURIComponent(match.id),
                })
              }
            />
          ))}
        </View>
      </View>

      <View className="public-team-section">
        <ProductSection kicker="SQUAD" title="完整阵容" note={data.roster.length + ' 名球员'} />
        <View className="public-roster-groups">
          {rosterGroups.map((group) => (
            <View className="public-roster-group surface" key={group.key}>
              <View className="public-roster-group__heading">
                <Text>{group.label}</Text>
                <Text>{group.players.length} 人</Text>
              </View>
              <View className="public-roster">
                <View className="public-roster__head">
                  <Text>号码</Text>
                  <Text>球员</Text>
                  <Text>位置 / 年级</Text>
                  <Text>出场</Text>
                  <Text>进球</Text>
                  <Text>助攻</Text>
                </View>
                {group.players.map((player) => (
                  <View
                    className="public-roster__row"
                    key={player.id}
                    onClick={() =>
                      void Taro.navigateTo({
                        url:
                          '/pages/player-detail/index?playerId=' +
                          encodeURIComponent(player.id) +
                          '&tournamentId=' +
                          encodeURIComponent(tournamentId),
                      })
                    }
                  >
                    <Text className="public-roster__number">{player.shirtNumber ?? '-'}</Text>
                    <View className="public-roster__player">
                      <UserAvatar
                        name={player.displayName}
                        color={player.profileColor}
                        size="small"
                      />
                      <Text>{player.displayName}</Text>
                    </View>
                    <Text>
                      {positionLabel(player.position)} · {player.academicYear}
                    </Text>
                    <Text>{player.appearances}</Text>
                    <Text>{player.goals}</Text>
                    <Text>{player.assists}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

function Record({
  value,
  label,
  accent = false,
}: {
  value: number | string
  label: string
  accent?: boolean
}) {
  return (
    <View
      className={'public-team-record__item ' + (accent ? 'public-team-record__item--accent' : '')}
    >
      <Text>{value}</Text>
      <Text>{label}</Text>
    </View>
  )
}
