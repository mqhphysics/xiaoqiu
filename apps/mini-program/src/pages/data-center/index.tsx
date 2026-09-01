import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { formatDate, formatTime } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import type {
  CompetitionDataResponse,
  PlayerStats,
  StandingRow,
} from '../../features/product/product.types'

import './index.scss'

type ViewMode = 'overview' | 'standings' | 'bracket' | 'leaders'
type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionDataResponse }

const views: Array<{ key: ViewMode; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'standings', label: '积分榜' },
  { key: 'bracket', label: '淘汰赛' },
  { key: 'leaders', label: '球员榜' },
]

export default function DataCenterPage() {
  const routeTournamentId = getCurrentInstance().router?.params.tournamentId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [mode, setMode] = useState<ViewMode>('overview')
  const [leaderMode, setLeaderMode] = useState<'scorers' | 'assists'>('scorers')

  const load = useCallback(
    async (requestedId?: string) => {
      setState({ phase: 'loading' })
      try {
        const tournamentId =
          requestedId || routeTournamentId || (await productRepository.getHome()).tournament.id
        setState({ phase: 'ready', data: await productRepository.getCompetitionData(tournamentId) })
      } catch (error) {
        setState({
          phase: 'failed',
          message: error instanceof Error ? error.message : '赛事数据加载失败。',
        })
      }
    },
    [routeTournamentId],
  )

  useEffect(() => {
    void load()
  }, [load])

  const tournamentId = state.phase === 'ready' ? state.data.tournament.id : routeTournamentId
  return (
    <PublicShell active="data" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在计算赛事数据" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛事数据不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View>
          <View className="data-hero">
            <View>
              <Text className="data-hero__eyebrow">COMPETITION DATA</Text>
              <Text className="data-hero__title">{state.data.tournament.name}</Text>
              <Text className="data-hero__subtitle">{state.data.tournament.seasonName}</Text>
            </View>
            <View className="season-switcher">
              <Text className="season-switcher__label">赛季</Text>
              <View className="season-switcher__buttons">
                {state.data.seasons.map((season) => (
                  <Button
                    className={
                      'season-button ' +
                      (season.tournamentId === state.data.tournament.id
                        ? 'season-button--active'
                        : '')
                    }
                    key={season.tournamentId}
                    onClick={() => void load(season.tournamentId)}
                  >
                    {season.year}
                  </Button>
                ))}
              </View>
            </View>
          </View>

          <View className="data-view-tabs">
            {views.map((view) => (
              <Button
                className={'data-view-tab ' + (mode === view.key ? 'data-view-tab--active' : '')}
                key={view.key}
                onClick={() => setMode(view.key)}
              >
                {view.label}
              </Button>
            ))}
          </View>

          {mode === 'overview' && (
            <Overview
              data={state.data}
              onGoBracket={() => setMode('bracket')}
              onGoLeaders={() => setMode('leaders')}
              onGoStandings={() => setMode('standings')}
            />
          )}
          {mode === 'standings' && <Standings groups={state.data.groups} />}
          {mode === 'bracket' && <Bracket data={state.data} />}
          {mode === 'leaders' && (
            <Leaders
              active={leaderMode}
              assists={state.data.leaders.assists}
              scorers={state.data.leaders.scorers}
              tournamentId={state.data.tournament.id}
              onChange={setLeaderMode}
            />
          )}
        </View>
      )}
    </PublicShell>
  )
}

function Overview({
  data,
  onGoBracket,
  onGoLeaders,
  onGoStandings,
}: {
  data: CompetitionDataResponse
  onGoBracket: () => void
  onGoLeaders: () => void
  onGoStandings: () => void
}) {
  const finished = data.schedule.filter((match) =>
    ['FINISHED', 'CONFIRMED'].includes(match.status),
  ).length
  const live = data.schedule.filter((match) => match.status === 'LIVE').length
  const teams = new Set(
    data.schedule.flatMap((match) => [match.homeTeam?.id, match.awayTeam?.id]).filter(Boolean),
  ).size
  return (
    <View>
      <View className="data-kpi-grid">
        <Kpi value={teams} label="参赛球队" />
        <Kpi value={data.schedule.length} label="全部比赛" />
        <Kpi value={finished} label="已结束" />
        <Kpi value={live} label="正在进行" live />
      </View>

      <View className="data-overview-grid">
        <View className="data-overview-block">
          <ProductSection kicker="GROUP STAGE" title="小组形势" note="积分优先" />
          {data.groups.length === 0 ? (
            <View className="compact-empty">本赛季采用淘汰赛赛制</View>
          ) : (
            <View className="surface overview-standings">
              {data.groups.map((group) => (
                <View className="overview-group" key={group.id}>
                  <Text className="overview-group__name">{group.name}</Text>
                  {group.standings.slice(0, 3).map((row) => (
                    <View className="overview-group__row" key={row.teamId}>
                      <Text>{row.rank}</Text>
                      <Text>{row.teamName}</Text>
                      <Text>{row.points} 分</Text>
                    </View>
                  ))}
                </View>
              ))}
              <Button className="data-more-button" onClick={onGoStandings}>
                查看完整积分榜
              </Button>
            </View>
          )}
        </View>

        <View className="data-overview-block">
          <ProductSection kicker="LEADERS" title="射手领跑" note="进球数" />
          <View className="surface overview-leaders">
            {data.leaders.scorers.slice(0, 5).map((player, index) => (
              <View className="overview-leader" key={player.id}>
                <Text className="overview-leader__rank">{index + 1}</Text>
                <UserAvatar name={player.displayName} size="small" />
                <View className="overview-leader__copy">
                  <Text>{player.displayName}</Text>
                  <Text>{player.team?.name ?? '暂无球队'}</Text>
                </View>
                <Text className="overview-leader__value">{player.goals}</Text>
              </View>
            ))}
            <Button className="data-more-button" onClick={onGoLeaders}>
              查看球员榜
            </Button>
          </View>
        </View>
      </View>

      {data.bracket.length > 0 && (
        <View className="data-overview-bracket">
          <ProductSection
            kicker="KNOCKOUT"
            title="淘汰赛进程"
            note={data.bracket.length + ' 个轮次'}
          />
          <View className="overview-bracket-rounds">
            {data.bracket.map((round) => (
              <View className="overview-bracket-round" key={round.id}>
                <Text>{round.name}</Text>
                <Text>{round.matches.length} 场</Text>
              </View>
            ))}
            <Button className="data-more-button data-more-button--inline" onClick={onGoBracket}>
              展开对阵
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}

function Kpi({ value, label, live = false }: { value: number; label: string; live?: boolean }) {
  return (
    <View className={'data-kpi ' + (live ? 'data-kpi--live' : '')}>
      <Text className="data-kpi__value">{value}</Text>
      <Text className="data-kpi__label">{label}</Text>
    </View>
  )
}

function Standings({ groups }: { groups: CompetitionDataResponse['groups'] }) {
  if (groups.length === 0) {
    return (
      <DataState kind="empty" title="本赛季没有小组积分榜" description="该赛季采用淘汰赛赛制。" />
    )
  }
  return (
    <View className="standings-page">
      <ProductSection kicker="GROUP TABLES" title="小组赛积分榜" note="胜 3 分 · 平 1 分" />
      <View className="standings-grid">
        {groups.map((group) => (
          <View className="standing-table surface" key={group.id}>
            <Text className="standing-table__title">{group.name}</Text>
            <View className="standing-table__head">
              <Text>排名</Text>
              <Text>球队</Text>
              <Text>赛</Text>
              <Text>净胜</Text>
              <Text>积分</Text>
            </View>
            {group.standings.map((row) => (
              <StandingTableRow key={row.teamId} row={row} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function StandingTableRow({ row }: { row: StandingRow }) {
  return (
    <View
      className={'standing-table__row ' + (row.rank <= 2 ? 'standing-table__row--qualifying' : '')}
    >
      <Text>{row.rank}</Text>
      <View className="standing-table__team">
        <Text
          className="standing-table__color"
          style={{ backgroundColor: row.primaryColor ?? '#758079' }}
        />
        <Text>{row.shortName}</Text>
      </View>
      <Text>{row.played}</Text>
      <Text>
        {row.goalDifference > 0 ? '+' : ''}
        {row.goalDifference}
      </Text>
      <Text className="standing-table__points">{row.points}</Text>
    </View>
  )
}

function Bracket({ data }: { data: CompetitionDataResponse }) {
  if (data.bracket.length === 0) {
    return (
      <DataState kind="empty" title="暂无淘汰赛对阵" description="晋级席位确认后将在这里显示。" />
    )
  }
  return (
    <View className="bracket-page">
      <ProductSection kicker="BRACKET" title="淘汰赛晋级树" note="从半决赛通往决赛" />
      <View className="bracket-scroll">
        {data.bracket.map((round, roundIndex) => {
          const orderedMatches = [...round.matches].sort((left, right) => {
            const leftThird = left.matchCode.includes('THIRD') ? 1 : 0
            const rightThird = right.matchCode.includes('THIRD') ? 1 : 0
            return leftThird - rightThird
          })
          return (
            <View className={`bracket-round bracket-round--${roundIndex}`} key={round.id}>
              <Text className="bracket-round__title">
                {roundIndex === 0 ? '半决赛' : '决赛阶段'}
              </Text>
              <View className="bracket-round__matches">
                {orderedMatches.map((match) => {
                  const isThirdPlace = match.matchCode.includes('THIRD')
                  const slotClass = isThirdPlace
                    ? 'bracket-match-slot bracket-match-slot--third'
                    : roundIndex > 0
                      ? 'bracket-match-slot bracket-match-slot--final'
                      : 'bracket-match-slot'
                  return (
                    <View className={slotClass} key={match.id}>
                      {roundIndex > 0 && (
                        <Text className="bracket-match__label">
                          {isThirdPlace ? '三四名决赛' : '冠军决赛'}
                        </Text>
                      )}
                      <View
                        className="bracket-match"
                        onClick={() =>
                          void Taro.navigateTo({
                            url:
                              '/pages/readonly-match-detail/index?matchId=' +
                              encodeURIComponent(match.id),
                          })
                        }
                      >
                        <View className="bracket-match__meta">
                          <Text>
                            {formatDate(match.scheduledStartAt)}{' '}
                            {formatTime(match.scheduledStartAt)}
                          </Text>
                          <MatchStatus status={match.status} />
                        </View>
                        <BracketTeam
                          team={match.homeTeam}
                          placeholder={match.homePlaceholder}
                          score={match.homeScore}
                        />
                        <BracketTeam
                          team={match.awayTeam}
                          placeholder={match.awayPlaceholder}
                          score={match.awayScore}
                        />
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function BracketTeam({
  team,
  placeholder,
  score,
}: {
  team: CompetitionDataResponse['schedule'][number]['homeTeam']
  placeholder: string | null | undefined
  score: number | null
}) {
  return (
    <View className="bracket-match__team">
      <TeamCrest team={team} size="small" />
      <Text>{team?.shortName ?? placeholder ?? '待定'}</Text>
      <Text>{score ?? '-'}</Text>
    </View>
  )
}

function Leaders({
  active,
  assists,
  scorers,
  tournamentId,
  onChange,
}: {
  active: 'scorers' | 'assists'
  assists: PlayerStats[]
  scorers: PlayerStats[]
  tournamentId: string
  onChange: (value: 'scorers' | 'assists') => void
}) {
  const rows = active === 'scorers' ? scorers : assists
  return (
    <View className="leaders-page">
      <View className="leaders-heading">
        <ProductSection kicker="PLAYER RANKING" title="个人数据榜" note="公开比赛数据" />
        <View className="leader-toggle">
          <Button
            className={active === 'scorers' ? 'leader-toggle__active' : ''}
            onClick={() => onChange('scorers')}
          >
            射手榜
          </Button>
          <Button
            className={active === 'assists' ? 'leader-toggle__active' : ''}
            onClick={() => onChange('assists')}
          >
            助攻榜
          </Button>
        </View>
      </View>
      <View className="leader-table surface">
        <View className="leader-table__head">
          <Text>排名</Text>
          <Text>球员</Text>
          <Text>球队</Text>
          <Text>出场</Text>
          <Text>{active === 'scorers' ? '进球' : '助攻'}</Text>
        </View>
        {rows.map((player, index) => (
          <View
            className="leader-table__row"
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
            <Text className="leader-table__rank">{index + 1}</Text>
            <View className="leader-table__player">
              <UserAvatar name={player.displayName} size="small" />
              <Text>{player.displayName}</Text>
            </View>
            <Text>{player.team?.shortName ?? '-'}</Text>
            <Text>{player.appearances}</Text>
            <Text className="leader-table__value">
              {active === 'scorers' ? player.goals : player.assists}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
