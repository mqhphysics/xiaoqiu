import { useEffect, useState } from 'react'
import { TeamCrest } from '../../components/product-ui'
import { productRepository } from '../../features/product/product.repository'
import { productConfigRepository } from '../../features/product-config/product-config.repository'
import { canReportMatch } from '../../features/identity/entry-scope'
import { formatDate, formatTime } from '../../features/product/product.format'
import { openPlayer } from '../../features/product/player-navigation'
import { matchReportGateway } from '../../features/match-report/repository'
import { rosterRepository } from '../../features/captain-roster/roster.repository'
import { lineupPlanRepository } from '../../features/captain-roster/lineup-plan.repository'
import { openCaptainManageChooser } from '../../features/captain-roster/captain-manage-navigation.h5'
import type { IdentityBadgeKind } from '../../features/product/identity-badges'
import type {
  AuthUser,
  MatchSummary,
  PostSummary,
  TeamSummary,
} from '../../features/product/product.types'
import type { ReportRevision } from '../../features/match-report/types'
import { ProfileIcon } from './profile-icons.h5'
import {
  formatCount,
  lineupStatusLabel,
  nextFollowedMatch,
  nextTeamMatch,
  rosterStatusLabel,
  seasonCardTitle,
  seasonPersona,
  studentActivity,
  summarizeReporter,
  type ReporterRevisionView,
  type SeasonPersona,
} from './my-season.logic'

interface MySeasonProps {
  user: AuthUser
  displayedKind: IdentityBadgeKind | null
  tournamentId: string
  seasonName: string
  schedule: MatchSummary[]
  scheduleReady: boolean
  followedMatchIds: string[]
  posts: PostSummary[]
  managedTeamIds: string[]
  teams: Array<{ id: string; name: string }>
  onOpenInformation: () => void
  onOpenMatches: () => void
  onOpenPosts: () => void
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      persona: SeasonPersona
      stats: Array<[string, number | undefined]>
      team: TeamSummary | null
      rosterLabel: string | null
      lineupLabel: string | null
    }

type RevisionWire = ReportRevision & { action?: string }

function revisionView(item: RevisionWire): ReporterRevisionView {
  return {
    savedBy: item.savedBy,
    ...(item.action ? { action: item.action } : {}),
    status: item.status,
    reason: item.reason,
    eventCount: item.fields.events.length,
  }
}

export function MySeasonCard({
  user,
  displayedKind,
  tournamentId,
  seasonName,
  schedule,
  scheduleReady,
  followedMatchIds,
  posts,
  managedTeamIds,
  teams,
  onOpenInformation,
  onOpenMatches,
  onOpenPosts,
}: MySeasonProps) {
  const persona = seasonPersona({
    displayedKind,
    linkedPlayerId: user.linkedPlayer?.id ?? null,
    roles: user.roles,
  })
  const title = seasonCardTitle(persona)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    setState({ kind: 'loading' })
    const linkedPlayerId = user.linkedPlayer?.id ?? null
    const teamId = managedTeamIds[0]
    const run = async () => {
      try {
        if (persona === 'reporter') {
          const caps = await productConfigRepository.getCapabilities()
          const write = caps.actions['matchReports.write']
          const eligible = schedule.filter(
            (match) =>
              ['FINISHED', 'CONFIRMED'].includes(match.status) &&
              canReportMatch(write, caps.organizationId, match),
          )
          const workspaces = await Promise.all(
            eligible.map(async (match) => {
              try {
                const workspace = await matchReportGateway.load(match.id)
                const latest = workspace.latest ? revisionView(workspace.latest) : null
                let history: ReporterRevisionView[] = []
                if (
                  latest &&
                  (workspace.confirmedReportVersion != null || (workspace.reportVersion ?? 0) > 1)
                ) {
                  try {
                    const page = await matchReportGateway.history(match.id)
                    history = page.items.map((item) => revisionView(item))
                  } catch {
                    history = []
                  }
                }
                return {
                  matchId: match.id,
                  confirmedReportVersion: workspace.confirmedReportVersion ?? null,
                  latest,
                  history,
                }
              } catch {
                return {
                  matchId: match.id,
                  confirmedReportVersion: null,
                  latest: null,
                  history: [],
                }
              }
            }),
          )
          if (!active) return
          const summary = summarizeReporter(workspaces, user)
          setState({
            kind: 'ready',
            persona,
            stats: [
              ['录入场次', summary.matches],
              ['录入事件', summary.events],
              ['更正', summary.corrections],
            ],
            team: null,
            rosterLabel: null,
            lineupLabel: null,
          })
          return
        }

        if (persona === 'student') {
          const commented = posts.filter((post) => post.commentCount > 0).slice(0, 16)
          const details = await Promise.allSettled(
            commented.map((post) => productRepository.getPost(post.id)),
          )
          if (!active) return
          const found = details.flatMap((item) =>
            item.status === 'fulfilled' ? item.value.comments : [],
          )
          const activity = studentActivity({
            followedMatchCount: followedMatchIds.length,
            posts,
            userId: user.id,
            comments: found,
          })
          setState({
            kind: 'ready',
            persona,
            stats: [
              ['关注比赛', activity.followed],
              ['评论', activity.comments],
              ['点赞', activity.likes],
              ['动态', activity.posts],
            ],
            team: null,
            rosterLabel: null,
            lineupLabel: null,
          })
          return
        }

        const [player, roster, lineups] = await Promise.allSettled([
          linkedPlayerId
            ? productRepository.getPlayer(linkedPlayerId, tournamentId)
            : Promise.resolve(null),
          persona === 'captain' && teamId
            ? rosterRepository.read(tournamentId, teamId)
            : Promise.resolve(null),
          persona === 'captain' && teamId
            ? lineupPlanRepository.list(teamId)
            : Promise.resolve({ items: [] }),
        ])
        if (!active) return
        if (linkedPlayerId && player.status === 'rejected' && persona === 'player') {
          setState({ kind: 'error' })
          return
        }
        const readyPlayer = player.status === 'fulfilled' ? player.value : null
        setState({
          kind: 'ready',
          persona,
          stats: [
            ['出场', readyPlayer?.stats.appearances],
            ['进球', readyPlayer?.stats.goals],
            ['助攻', readyPlayer?.stats.assists],
          ],
          team: readyPlayer?.team ?? null,
          rosterLabel:
            persona === 'captain'
              ? rosterStatusLabel(
                  roster.status === 'fulfilled' ? (roster.value?.status ?? null) : null,
                )
              : null,
          lineupLabel:
            persona === 'captain'
              ? lineupStatusLabel(
                  lineups.status === 'fulfilled' ? (lineups.value?.items ?? []) : [],
                )
              : null,
        })
      } catch {
        if (active) setState({ kind: 'error' })
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [
    persona,
    user.id,
    user.displayName,
    user.username,
    user.linkedPlayer?.id,
    tournamentId,
    schedule,
    followedMatchIds,
    posts,
    managedTeamIds,
  ])

  const ready = state.kind === 'ready'
  const stats = ready ? state.stats : personaStatsPlaceholder(persona)
  const team = ready ? state.team : null
  const next =
    persona === 'student'
      ? nextFollowedMatch(schedule, followedMatchIds)
      : nextTeamMatch(schedule, team?.id)
  const home = Boolean(next && team && next.homeTeam?.id === team.id)
  const opponent = next ? (home ? next.awayTeam : next.homeTeam) : null
  const opponentLabel =
    opponent?.name ?? (next ? (home ? next.awayPlaceholder : next.homePlaceholder) : null) ?? '待定'
  const value = (count: number | undefined) => formatCount(count, ready && scheduleReady)
  const moreLabel =
    persona === 'reporter'
      ? '去录入比赛'
      : persona === 'student'
        ? '查看关注比赛'
        : persona === 'captain'
          ? '管理名单与阵容'
          : '查看完整数据'

  const open = () => {
    if (persona === 'reporter') {
      onOpenInformation()
      return
    }
    if (persona === 'student') {
      onOpenMatches()
      return
    }
    if (persona === 'captain' && managedTeamIds.length) {
      openCaptainManageChooser({
        teams: teams.filter((item) => managedTeamIds.includes(item.id)),
        tournamentId,
      })
      return
    }
    if (user.linkedPlayer) void openPlayer(user.linkedPlayer.id, tournamentId)
    else onOpenPosts()
  }

  return (
    <section className="profile-season profile-surface" aria-label={title}>
      <button
        data-profile-button=""
        className="profile-season__card"
        onClick={open}
        aria-label={title}
      >
        <div className="profile-season__heading">
          <h2>{title}</h2>
          <span>{seasonName}</span>
          <span className="profile-season__more">
            {moreLabel}
            <ProfileIcon name="arrow" />
          </span>
        </div>
        <div
          className={`profile-season__stats${stats.length > 3 ? ' profile-season__stats--four' : ''}`}
        >
          {stats.map(([label, count]) => (
            <div key={label}>
              <strong>{state.kind === 'error' ? '—' : value(count)}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="profile-season__next">
          {persona === 'captain' && ready ? (
            <div className="profile-season__roles">
              <span>名单 · {state.rosterLabel}</span>
              <span>阵容 · {state.lineupLabel}</span>
            </div>
          ) : null}
          {persona !== 'reporter' ? (
            <small>{persona === 'student' ? '下一场关注' : '下一场比赛'}</small>
          ) : null}
          {state.kind === 'error' ? (
            <p className="profile-season__note">数据暂不可用，点击打开对应入口。</p>
          ) : state.kind === 'loading' || !scheduleReady ? (
            <p className="profile-season__note">正在读取…</p>
          ) : persona === 'reporter' ? (
            <p className="profile-season__note">授权完赛中由你保存的报告场次、事件与更正。</p>
          ) : next ? (
            <div className="profile-season__match">
              <span className="profile-season__opponent">
                {opponent ? (
                  <TeamCrest team={opponent} size="small" />
                ) : (
                  <i aria-hidden="true">?</i>
                )}
                <strong>{opponentLabel}</strong>
                {team ? <em>{home ? '主场' : '客场'}</em> : <em>关注</em>}
              </span>
              {next.roundName || next.stageName ? (
                <span className="profile-season__meta">
                  <ProfileIcon name="trophy" />
                  {next.roundName || next.stageName}
                </span>
              ) : null}
              <span className="profile-season__meta">
                <ProfileIcon name="calendar" />
                {next.scheduledStartAt
                  ? `${formatDate(next.scheduledStartAt)} ${formatTime(next.scheduledStartAt)}`
                  : '时间待定'}
              </span>
              <span className="profile-season__meta">
                <ProfileIcon name="pin" />
                {next.venue?.name ?? '场地待定'}
              </span>
            </div>
          ) : (
            <p className="profile-season__note">
              {persona === 'student' ? '暂时没有待进行的关注比赛。' : '本赛季暂无待进行的比赛。'}
            </p>
          )}
        </div>
      </button>
    </section>
  )
}

function personaStatsPlaceholder(persona: SeasonPersona): Array<[string, number | undefined]> {
  if (persona === 'reporter')
    return [
      ['录入场次', undefined],
      ['录入事件', undefined],
      ['更正', undefined],
    ]
  if (persona === 'student')
    return [
      ['关注比赛', undefined],
      ['评论', undefined],
      ['点赞', undefined],
      ['动态', undefined],
    ]
  return [
    ['出场', undefined],
    ['进球', undefined],
    ['助攻', undefined],
  ]
}
