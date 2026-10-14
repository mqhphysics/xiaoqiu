import { useEffect, useState } from 'react'
import { TeamCrest } from '../../components/product-ui'
import { productRepository } from '../../features/product/product.repository'
import { formatDate, formatTime } from '../../features/product/product.format'
import { openPlayer } from '../../features/product/player-navigation'
import type { MatchSummary, PlayerStats, TeamSummary } from '../../features/product/product.types'
import { isPendingMatch } from './profile.logic'
import { ProfileIcon } from './profile-icons.h5'

interface MySeasonProps {
  linkedPlayerId: string | null
  tournamentId: string
  seasonName: string
  schedule: MatchSummary[]
  scheduleReady: boolean
}

type SeasonState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; stats: PlayerStats; team: TeamSummary | null }

/** Next pending fixture of the player's team, earliest kickoff first (TBD times last). */
export function nextTeamMatch(schedule: MatchSummary[], teamId: string | undefined) {
  if (!teamId) return null
  return (
    schedule
      .filter(
        (match) =>
          isPendingMatch(match) && (match.homeTeam?.id === teamId || match.awayTeam?.id === teamId),
      )
      .sort(
        (a, b) =>
          (a.scheduledStartAt ? Date.parse(a.scheduledStartAt) : Infinity) -
          (b.scheduledStartAt ? Date.parse(b.scheduledStartAt) : Infinity),
      )[0] ?? null
  )
}

export function MySeasonCard({
  linkedPlayerId,
  tournamentId,
  seasonName,
  schedule,
  scheduleReady,
}: MySeasonProps) {
  const [state, setState] = useState<SeasonState>({ kind: 'loading' })
  useEffect(() => {
    if (!linkedPlayerId) return
    let active = true
    setState({ kind: 'loading' })
    void productRepository
      .getPlayer(linkedPlayerId, tournamentId)
      .then((player) => {
        if (active) setState({ kind: 'ready', stats: player.stats, team: player.team })
      })
      .catch(() => {
        if (active) setState({ kind: 'error' })
      })
    return () => {
      active = false
    }
  }, [linkedPlayerId, tournamentId])

  const heading = (more: boolean) => (
    <div className="profile-season__heading">
      <h2>我的赛季</h2>
      <span>{seasonName}</span>
      {more ? (
        <span className="profile-season__more">
          查看完整数据
          <ProfileIcon name="arrow" />
        </span>
      ) : null}
    </div>
  )
  if (!linkedPlayerId)
    return (
      <section className="profile-season profile-surface" aria-label="我的赛季">
        {heading(false)}
        <div className="profile-season__empty">
          <ProfileIcon name="trophy" />
          <p>关联球员身份后，这里会显示你的出场、进球和下一场比赛。</p>
        </div>
      </section>
    )

  const open = () => void openPlayer(linkedPlayerId, tournamentId)
  const team = state.kind === 'ready' ? state.team : null
  const next = state.kind === 'ready' ? nextTeamMatch(schedule, team?.id) : null
  const home = next?.homeTeam?.id === team?.id
  const opponent = next ? (home ? next.awayTeam : next.homeTeam) : null
  const opponentLabel =
    opponent?.name ?? (next ? (home ? next.awayPlaceholder : next.homePlaceholder) : null) ?? '待定'
  const stats = state.kind === 'ready' ? state.stats : null
  const value = (n: number | undefined) => (stats ? String(n ?? 0) : '—')

  return (
    <section className="profile-season profile-surface" aria-label="我的赛季">
      <button
        data-profile-button=""
        className="profile-season__card"
        onClick={open}
        aria-label="查看我的完整球员数据"
      >
        {heading(true)}
        <div className="profile-season__stats">
          {(
            [
              ['出场', stats?.appearances],
              ['进球', stats?.goals],
              ['助攻', stats?.assists],
            ] as const
          ).map(([label, count]) => (
            <div key={label}>
              <strong>{value(count)}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="profile-season__next">
          <small>下一场比赛</small>
          {state.kind === 'error' ? (
            <p className="profile-season__note">赛季数据暂不可用，点击查看球员详情。</p>
          ) : state.kind === 'loading' || !scheduleReady ? (
            <p className="profile-season__note">正在读取…</p>
          ) : next ? (
            <div className="profile-season__match">
              <span className="profile-season__opponent">
                {opponent ? (
                  <TeamCrest team={opponent} size="small" />
                ) : (
                  <i aria-hidden="true">?</i>
                )}
                <strong>{opponentLabel}</strong>
                <em>{home ? '主场' : '客场'}</em>
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
            <p className="profile-season__note">本赛季暂无待进行的比赛。</p>
          )}
        </div>
      </button>
    </section>
  )
}
