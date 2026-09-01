import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, TeamCrest } from '../../components/product-ui'
import { formatLongDate, formatTime } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import type { CompetitionDataResponse, MatchSummary } from '../../features/product/product.types'

import './index.scss'

type Filter = 'all' | 'upcoming' | 'finished'
type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionDataResponse }

export default function SchedulePage() {
  const routeTournamentId = getCurrentInstance().router?.params.tournamentId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [filter, setFilter] = useState<Filter>('all')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const tournamentId = routeTournamentId || (await productRepository.getHome()).tournament.id
      setState({ phase: 'ready', data: await productRepository.getCompetitionData(tournamentId) })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '赛程加载失败。',
      })
    }
  }, [routeTournamentId])

  useEffect(() => {
    void load()
  }, [load])

  const tournamentId = state.phase === 'ready' ? state.data.tournament.id : routeTournamentId
  return (
    <PublicShell active="schedule" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取完整赛程" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛程不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <ScheduleContent
          data={state.data}
          direction={direction}
          filter={filter}
          onDirectionChange={setDirection}
          onFilterChange={setFilter}
        />
      )}
    </PublicShell>
  )
}

function ScheduleContent({
  data,
  direction,
  filter,
  onDirectionChange,
  onFilterChange,
}: {
  data: CompetitionDataResponse
  direction: 'asc' | 'desc'
  filter: Filter
  onDirectionChange: (value: 'asc' | 'desc') => void
  onFilterChange: (value: Filter) => void
}) {
  const groups = useMemo(() => {
    const filtered = data.schedule.filter((match) => {
      if (filter === 'finished') return ['FINISHED', 'CONFIRMED'].includes(match.status)
      if (filter === 'upcoming')
        return !['FINISHED', 'CONFIRMED', 'CANCELLED'].includes(match.status)
      return true
    })
    const sorted = [...filtered].sort((a, b) => {
      const aTime = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : 0
      const bTime = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : 0
      return direction === 'asc' ? aTime - bTime : bTime - aTime
    })
    const result = new Map<string, MatchSummary[]>()
    for (const match of sorted) {
      const key = match.scheduledStartAt?.slice(0, 10) ?? 'TBD'
      result.set(key, [...(result.get(key) ?? []), match])
    }
    return [...result.entries()]
  }, [data.schedule, direction, filter])

  const finished = data.schedule.filter((match) =>
    ['FINISHED', 'CONFIRMED'].includes(match.status),
  ).length
  return (
    <View>
      <View className="schedule-header">
        <View>
          <Text className="schedule-header__eyebrow">MATCH SCHEDULE</Text>
          <Text className="schedule-header__title">赛程</Text>
          <Text className="schedule-header__event">{data.tournament.name}</Text>
        </View>
        <View className="schedule-header__summary">
          <View>
            <Text>{data.schedule.length}</Text>
            <Text>全部</Text>
          </View>
          <View>
            <Text>{finished}</Text>
            <Text>已结束</Text>
          </View>
          <View>
            <Text>{data.schedule.length - finished}</Text>
            <Text>待进行</Text>
          </View>
        </View>
      </View>

      <View className="schedule-controls">
        <View className="schedule-segment">
          <FilterButton
            active={filter === 'all'}
            label="全部"
            onClick={() => onFilterChange('all')}
          />
          <FilterButton
            active={filter === 'upcoming'}
            label="未开始"
            onClick={() => onFilterChange('upcoming')}
          />
          <FilterButton
            active={filter === 'finished'}
            label="已结束"
            onClick={() => onFilterChange('finished')}
          />
        </View>
        <View className="schedule-order">
          <Button
            className={direction === 'asc' ? 'schedule-order__active' : ''}
            onClick={() => onDirectionChange('asc')}
          >
            日期正序
          </Button>
          <Button
            className={direction === 'desc' ? 'schedule-order__active' : ''}
            onClick={() => onDirectionChange('desc')}
          >
            日期倒序
          </Button>
        </View>
      </View>

      {groups.length === 0 ? (
        <DataState kind="empty" title="当前筛选下没有比赛" />
      ) : (
        <View className="schedule-timeline">
          {groups.map(([dateKey, matches]) => (
            <View className="schedule-day" key={dateKey}>
              <View className="schedule-day__date">
                <Text>{formatLongDate(matches[0]?.scheduledStartAt ?? null)}</Text>
                <Text>{matches.length} 场</Text>
              </View>
              <View className="schedule-day__matches">
                {matches.map((match) => (
                  <ScheduleMatch key={match.id} match={match} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      className={'schedule-filter-button ' + (active ? 'schedule-filter-button--active' : '')}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function ScheduleMatch({ match }: { match: MatchSummary }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  return (
    <View
      className="timeline-match"
      onClick={() =>
        void Taro.navigateTo({
          url: '/pages/readonly-match-detail/index?matchId=' + encodeURIComponent(match.id),
        })
      }
    >
      <View className="timeline-match__time">
        <Text>{formatTime(match.scheduledStartAt)}</Text>
        <Text>{match.venue?.name ?? '场地待定'}</Text>
      </View>
      <View className="timeline-match__body">
        <View className="timeline-match__meta">
          <Text>{match.title}</Text>
          <MatchStatus status={match.status} />
        </View>
        <View className="timeline-match__team">
          <TeamCrest team={match.homeTeam} size="small" />
          <Text>{match.homeTeam?.name ?? match.homePlaceholder ?? '主队待定'}</Text>
          <Text>{hasScore ? match.homeScore : '-'}</Text>
        </View>
        <View className="timeline-match__team">
          <TeamCrest team={match.awayTeam} size="small" />
          <Text>{match.awayTeam?.name ?? match.awayPlaceholder ?? '客队待定'}</Text>
          <Text>{hasScore ? match.awayScore : '-'}</Text>
        </View>
        {match.statusReason && <Text className="timeline-match__reason">{match.statusReason}</Text>}
      </View>
      <Text className="timeline-match__open">详情</Text>
    </View>
  )
}
