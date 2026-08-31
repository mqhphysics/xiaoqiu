import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import {
  eventLabel,
  formatLongDate,
  formatTime,
  positionLabel,
} from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import type { MatchExperienceResponse } from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; match: MatchExperienceResponse }

export default function MatchDetailPage() {
  const matchId = getCurrentInstance().router?.params.matchId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [lineupTeamId, setLineupTeamId] = useState('')

  const load = useCallback(async () => {
    if (!matchId) {
      setState({ phase: 'failed', message: '缺少比赛参数。' })
      return
    }
    setState({ phase: 'loading' })
    try {
      const match = await productRepository.getMatch(matchId)
      setLineupTeamId(match.lineups[0]?.team.id ?? '')
      setState({ phase: 'ready', match })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '比赛详情加载失败。',
      })
    }
  }, [matchId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell active="schedule" tournamentId={state.phase === 'ready' ? state.match.tournamentId : undefined}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取比赛详情" />}
      {state.phase === 'failed' && (
        <DataState kind="error" title="比赛详情不可用" description={state.message} onRetry={() => void load()} />
      )}
      {state.phase === 'ready' && (
        <MatchContent match={state.match} lineupTeamId={lineupTeamId} onLineupTeamChange={setLineupTeamId} />
      )}
    </PublicShell>
  )
}

function MatchContent({
  match,
  lineupTeamId,
  onLineupTeamChange,
}: {
  match: MatchExperienceResponse
  lineupTeamId: string
  onLineupTeamChange: (id: string) => void
}) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const selectedLineup = match.lineups.find((lineup) => lineup.team.id === lineupTeamId) ?? match.lineups[0]
  return (
    <View>
      <View className="experience-match-header">
        <View className="experience-match-header__meta">
          <Text>{match.stageName ?? '赛事'} · {match.roundName ?? match.title}</Text>
          <MatchStatus status={match.status} />
        </View>
        <Text className="experience-match-header__date">
          {formatLongDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
        </Text>
        <Text className="experience-match-header__venue">{match.venue?.name ?? '场地待定'}</Text>

        <View className="experience-scoreboard">
          <TeamSide team={match.homeTeam} placeholder={match.homePlaceholder} tournamentId={match.tournamentId} />
          <View className="experience-scoreboard__score">
            <Text>{hasScore ? match.homeScore + ' : ' + match.awayScore : 'VS'}</Text>
            {(match.homePenaltyScore !== null || match.awayPenaltyScore !== null) && (
              <Text>点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}</Text>
            )}
          </View>
          <TeamSide team={match.awayTeam} placeholder={match.awayPlaceholder} tournamentId={match.tournamentId} />
        </View>
      </View>

      {(match.summary || match.statusReason) && (
        <View className="match-summary surface">
          <Text className="match-summary__label">{match.statusReason ? '比赛说明' : '比赛战报'}</Text>
          <Text className="match-summary__body">{match.statusReason ?? match.summary}</Text>
          {match.attendance !== null && <Text className="match-summary__attendance">现场观众 {match.attendance} 人</Text>}
        </View>
      )}

      <View className="match-experience-grid">
        <View className="match-event-section">
          <ProductSection kicker="TIMELINE" title="比赛事件" note={match.events.length + ' 条'} />
          {match.events.length === 0 ? (
            <DataState kind="empty" title="暂无比赛事件" />
          ) : (
            <View className="event-timeline surface">
              {match.events.map((event) => (
                <View
                  className={'event-row ' + (event.team.id === match.homeTeam?.id ? 'event-row--home' : 'event-row--away')}
                  key={event.id}
                >
                  <Text className="event-row__minute">{event.minute}{event.stoppageMinute ? '+' + event.stoppageMinute : ''}'</Text>
                  <Text className={'event-row__type event-row__type--' + event.type.toLowerCase()}>{eventLabel(event.type)}</Text>
                  <View className="event-row__copy">
                    <Text>{event.player?.displayName ?? event.team.shortName}</Text>
                    <Text>
                      {event.relatedPlayer ? '助攻 ' + event.relatedPlayer.displayName : event.description ?? event.team.name}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="match-lineup-section">
          <ProductSection kicker="LINEUPS" title="双方阵容" note={match.lineups.length > 0 ? '公开出场名单' : '待公布'} />
          {match.lineups.length === 0 ? (
            <DataState kind="empty" title="阵容尚未公布" />
          ) : (
            <View className="lineup-panel surface">
              <View className="lineup-tabs">
                {match.lineups.map((lineup) => (
                  <Button
                    className={lineupTeamId === lineup.team.id ? 'lineup-tab--active' : ''}
                    key={lineup.team.id}
                    onClick={() => onLineupTeamChange(lineup.team.id)}
                  >
                    {lineup.team.shortName}
                  </Button>
                ))}
              </View>
              <View className="lineup-list">
                {selectedLineup?.players.map((player) => (
                  <View
                    className="lineup-player"
                    key={player.id}
                    onClick={() => void Taro.navigateTo({ url: '/pages/player-detail/index?playerId=' + encodeURIComponent(player.id) + '&tournamentId=' + encodeURIComponent(match.tournamentId) })}
                  >
                    <Text className="lineup-player__number">{player.shirtNumber ?? '-'}</Text>
                    <UserAvatar name={player.displayName} size="small" />
                    <View className="lineup-player__copy">
                      <Text>{player.displayName}</Text>
                      <Text>{positionLabel(player.position)} · {player.starter ? '首发' : '替补'}</Text>
                    </View>
                    <Text className="lineup-player__minutes">{player.minutesPlayed}'</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

function TeamSide({
  team,
  placeholder,
  tournamentId,
}: {
  team: MatchExperienceResponse['homeTeam']
  placeholder: string | null | undefined
  tournamentId: string
}) {
  return (
    <View
      className={'experience-scoreboard__team ' + (team ? 'experience-scoreboard__team--linked' : '')}
      onClick={() => team && void Taro.navigateTo({ url: '/pages/readonly-team-detail/index?teamId=' + encodeURIComponent(team.id) + '&tournamentId=' + encodeURIComponent(tournamentId) })}
    >
      <TeamCrest team={team} size="large" />
      <Text>{team?.name ?? placeholder ?? '席位待定'}</Text>
    </View>
  )
}
