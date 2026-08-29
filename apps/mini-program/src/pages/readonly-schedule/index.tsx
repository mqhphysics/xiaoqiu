import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import {
  filterMatches,
  formatDateLabel,
  formatMatchTime,
  getMatchStatusText,
  getMatchStatusTone,
  getScheduleDateOptions,
  getScheduleStageOptions,
  groupMatchesByDateAndStage,
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
  | {
      phase: 'ready'
      tournamentName: string
      matches: ReadonlyMatch[]
      source: PublicDataSource
    }

export default function ReadonlySchedulePage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [dateKey, setDateKey] = useState('')
  const [stageName, setStageName] = useState('')
  const tournamentId = getCurrentInstance().router?.params.tournamentId ?? ''

  const load = useCallback(async () => {
    if (!tournamentId) {
      setState({ phase: 'failed', message: '缺少赛事参数，请从赛事列表进入。' })
      return
    }

    setState({ phase: 'loading' })
    try {
      const result = await readonlyScheduleRepository.getTournament(tournamentId)
      if (!result.data) {
        setState({ phase: 'failed', message: '赛事尚未公开或不存在。' })
        return
      }
      setDateKey('')
      setStageName('')
      setState({
        phase: 'ready',
        tournamentName: result.data.name,
        matches: result.data.recentMatches,
        source: result.source,
      })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '赛程加载失败，请稍后重试。',
      })
    }
  }, [tournamentId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell
      active="schedule"
      tournamentId={tournamentId}
      source={state.phase === 'ready' ? state.source : undefined}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取已发布赛程" />}

      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛程加载失败"
          description={state.message}
          onRetry={() => void load()}
        />
      )}

      {state.phase === 'ready' && (
        <ScheduleContent
          dateKey={dateKey}
          matches={state.matches}
          stageName={stageName}
          tournamentName={state.tournamentName}
          onDateChange={setDateKey}
          onStageChange={setStageName}
        />
      )}
    </PublicShell>
  )
}

function ScheduleContent({
  dateKey,
  matches,
  stageName,
  tournamentName,
  onDateChange,
  onStageChange,
}: {
  dateKey: string
  matches: ReadonlyMatch[]
  stageName: string
  tournamentName: string
  onDateChange: (value: string) => void
  onStageChange: (value: string) => void
}) {
  const dates = useMemo(() => getScheduleDateOptions(matches), [matches])
  const stages = useMemo(() => getScheduleStageOptions(matches), [matches])
  const filteredMatches = useMemo(
    () =>
      filterMatches(matches, { dateKey: dateKey || undefined, stageName: stageName || undefined }),
    [dateKey, matches, stageName],
  )
  const groups = useMemo(() => groupMatchesByDateAndStage(filteredMatches), [filteredMatches])

  return (
    <View>
      <View className="page-intro schedule-intro">
        <View>
          <Text className="page-intro__eyebrow">SCHEDULE</Text>
          <Text className="page-intro__title">赛程</Text>
        </View>
        <Text className="page-intro__copy">{tournamentName}，按日期和阶段快速查看。</Text>
      </View>

      {matches.length === 0 ? (
        <DataState
          kind="empty"
          title="暂无已发布赛程"
          description="赛程发布后会按日期和阶段显示在这里。"
        />
      ) : (
        <View>
          <View className="schedule-toolbar surface">
            <View className="schedule-filter">
              <Text className="schedule-filter__label">日期</Text>
              <View className="schedule-filter__options">
                <Button
                  className={`filter-button ${dateKey === '' ? 'filter-button--active' : ''}`}
                  onClick={() => onDateChange('')}
                >
                  全部
                </Button>
                {dates.map((date) => (
                  <Button
                    className={`filter-button ${dateKey === date ? 'filter-button--active' : ''}`}
                    key={date}
                    onClick={() => onDateChange(date)}
                  >
                    {formatDateLabel(`${date}T12:00:00`)}
                  </Button>
                ))}
              </View>
            </View>
            <View className="schedule-filter">
              <Text className="schedule-filter__label">阶段</Text>
              <View className="schedule-filter__options">
                <Button
                  className={`filter-button ${stageName === '' ? 'filter-button--active' : ''}`}
                  onClick={() => onStageChange('')}
                >
                  全部
                </Button>
                {stages.map((stage) => (
                  <Button
                    className={`filter-button ${stageName === stage ? 'filter-button--active' : ''}`}
                    key={stage}
                    onClick={() => onStageChange(stage)}
                  >
                    {stage}
                  </Button>
                ))}
              </View>
            </View>
          </View>

          <Text className="schedule-result-count">当前显示 {filteredMatches.length} 场比赛</Text>

          {groups.length === 0 ? (
            <DataState kind="empty" title="没有符合筛选条件的比赛" />
          ) : (
            <View className="schedule-groups">
              {groups.map((dateGroup) => (
                <View className="schedule-date" key={dateGroup.dateKey}>
                  <View className="schedule-date__heading">
                    <Text className="schedule-date__label">{dateGroup.dateLabel}</Text>
                    <Text className="schedule-date__count">
                      {dateGroup.stages.reduce((count, stage) => count + stage.matches.length, 0)}{' '}
                      场
                    </Text>
                  </View>
                  {dateGroup.stages.map((stage) => (
                    <View
                      className="schedule-stage"
                      key={`${dateGroup.dateKey}-${stage.stageName}`}
                    >
                      <Text className="schedule-stage__title">{stage.stageName}</Text>
                      <View className="schedule-match-list surface">
                        {stage.matches.map((match) => (
                          <View
                            className="schedule-match link-row"
                            key={match.id}
                            onClick={() =>
                              void Taro.navigateTo({
                                url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(match.id)}`,
                              })
                            }
                          >
                            <Text className="schedule-match__time">
                              {formatMatchTime(match.scheduledStartAt)}
                            </Text>
                            <View className="schedule-match__teams">
                              <Text>{match.homeTeamName}</Text>
                              <Text className="schedule-match__versus">VS</Text>
                              <Text>{match.awayTeamName}</Text>
                            </View>
                            <View className="schedule-match__meta">
                              <Text>{match.roundName}</Text>
                              <Text>
                                {match.venueName}
                                {match.pitchName ? ` · ${match.pitchName}` : ''}
                              </Text>
                            </View>
                            <Text
                              className={`status-tag status-tag--${getMatchStatusTone(match.status)}`}
                            >
                              {getMatchStatusText(match.status)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  )
}
