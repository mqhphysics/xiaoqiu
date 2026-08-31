import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState, SectionHeading, TeamMark } from '../../components/public-ui'
import {
  findFocusMatch,
  formatCompactDate,
  formatMatchTime,
  getMatchStatusText,
  sortMatchesByStartAt,
} from '../../features/readonly-schedule/readonly-schedule.logic'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type {
  PublicDataSource,
  ReadonlyTournamentDetail,
} from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type HomeState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | {
      phase: 'ready'
      tournament: ReadonlyTournamentDetail | null
      source: PublicDataSource
    }

export default function IndexPage() {
  const [state, setState] = useState<HomeState>({ phase: 'loading' })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const list = await readonlyScheduleRepository.listTournaments()
      const selected = list.data[0]
      if (!selected) {
        setState({ phase: 'ready', tournament: null, source: list.source })
        return
      }

      const detail = await readonlyScheduleRepository.getTournament(selected.id)
      setState({ phase: 'ready', tournament: detail.data, source: detail.source })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '公开赛事加载失败，请稍后重试。',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const tournament = state.phase === 'ready' ? state.tournament : null
  const source = state.phase === 'ready' ? state.source : undefined

  return (
    <PublicShell active="home" tournamentId={tournament?.id} source={source}>
      {state.phase === 'loading' && (
        <DataState kind="loading" title="正在读取公开赛事" description="赛程与球队信息马上就好。" />
      )}

      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="首页数据加载失败"
          description={state.message}
          onRetry={() => void load()}
        />
      )}

      {state.phase === 'ready' && !tournament && (
        <DataState
          kind="empty"
          title="目前没有已发布赛事"
          description="赛事发布后，这里会显示赛程、参赛球队和下一场比赛。"
        />
      )}

      {state.phase === 'ready' && tournament && <HomeContent tournament={tournament} />}
    </PublicShell>
  )
}

function HomeContent({ tournament }: { tournament: ReadonlyTournamentDetail }) {
  const focusMatch = findFocusMatch(tournament.recentMatches)
  const previewMatches = sortMatchesByStartAt(tournament.recentMatches).slice(0, 3)

  return (
    <View>
      <View className="home-hero">
        <View className="home-hero__content">
          <Text className="home-hero__eyebrow">XIAOQIU CAMPUS FOOTBALL</Text>
          <Text className="home-hero__title">晓球</Text>
          <Text className="home-hero__event">{tournament.name}</Text>
          {focusMatch ? (
            <View className="home-hero__focus">
              <Text className="home-hero__focus-label">
                {focusMatch.status === 'LIVE' ? '正在进行' : '下一场比赛'}
              </Text>
              <Text className="home-hero__focus-teams">
                {focusMatch.homeTeamName} vs {focusMatch.awayTeamName}
              </Text>
              <Text className="home-hero__focus-meta">
                {formatCompactDate(focusMatch.scheduledStartAt)}{' '}
                {formatMatchTime(focusMatch.scheduledStartAt)} · {focusMatch.venueName}
              </Text>
            </View>
          ) : (
            <Text className="home-hero__focus-meta">赛程已经发布，比赛时间待赛事方确认。</Text>
          )}
          <View className="home-hero__actions">
            <Button
              className="button button--light"
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(tournament.id)}`,
                })
              }
            >
              查看完整赛程
            </Button>
            <Button
              className="button home-hero__secondary"
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/readonly-teams/index?tournamentId=${encodeURIComponent(tournament.id)}`,
                })
              }
            >
              浏览参赛球队
            </Button>
          </View>
        </View>
      </View>

      <View className="home-facts">
        <View className="home-fact">
          <Text className="home-fact__value">{tournament.teamCount}</Text>
          <Text className="home-fact__label">参赛球队</Text>
        </View>
        <View className="home-fact">
          <Text className="home-fact__value">{tournament.matchCount}</Text>
          <Text className="home-fact__label">已发布比赛</Text>
        </View>
        <View className="home-fact">
          <Text className="home-fact__value">{tournament.startDate}</Text>
          <Text className="home-fact__label">赛事开始</Text>
        </View>
        <View className="home-fact home-fact--accent">
          <Text className="home-fact__value">{tournament.statusText}</Text>
          <Text className="home-fact__label">公开状态</Text>
        </View>
      </View>

      <View className="content-section home-grid">
        <View className="home-grid__main">
          <SectionHeading eyebrow="SCHEDULE" title="近期赛程" action="按开赛时间排序" />
          <View className="home-match-list surface">
            {previewMatches.map((match) => (
              <View
                className="home-match link-row"
                key={match.id}
                onClick={() =>
                  void Taro.navigateTo({
                    url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(match.id)}`,
                  })
                }
              >
                <View className="home-match__time">
                  <Text className="home-match__date">
                    {formatCompactDate(match.scheduledStartAt)}
                  </Text>
                  <Text className="home-match__clock">
                    {formatMatchTime(match.scheduledStartAt)}
                  </Text>
                </View>
                <View className="home-match__body">
                  <Text className="home-match__teams">
                    {match.homeTeamName} vs {match.awayTeamName}
                  </Text>
                  <Text className="home-match__meta">
                    {match.stageName} · {match.roundName} · {match.venueName}
                  </Text>
                </View>
                <Text className={`status-tag ${match.status === 'LIVE' ? 'status-tag--live' : ''}`}>
                  {getMatchStatusText(match.status)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="home-grid__aside">
          <SectionHeading eyebrow="TEAMS" title="参赛球队" action={`${tournament.teamCount} 支`} />
          <View className="home-team-list surface">
            {tournament.teams.slice(0, 4).map((team) => (
              <View
                className="home-team link-row"
                key={team.id}
                onClick={() =>
                  void Taro.navigateTo({
                    url: `/pages/readonly-team-detail/index?tournamentId=${encodeURIComponent(tournament.id)}&teamId=${encodeURIComponent(team.id)}`,
                  })
                }
              >
                <TeamMark teamCode={team.teamCode} name={team.name} />
                <View className="home-team__body">
                  <Text className="home-team__name">{team.name}</Text>
                  <Text className="home-team__meta">公开名单 {team.rosterPlayerCount} 人</Text>
                </View>
                <Text className="home-team__arrow">›</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
