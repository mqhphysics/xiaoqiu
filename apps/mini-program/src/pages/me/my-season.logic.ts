import type { IdentityBadgeKind } from '../../features/product/identity-badges'
import type { AuthRole, MatchSummary, PostSummary } from '../../features/product/product.types'
import { isPendingMatch } from './profile.logic.ts'

export type SeasonPersona = 'player' | 'captain' | 'reporter' | 'student'

export interface LineupPlanStatus {
  kind: string
  confirmedVersion: number | null
  hasUnconfirmedChanges: boolean
}

/** Prefer the displayed identity, then live roles, so 我的赛季 / 我的贡献 follow the account. */
export function seasonPersona(input: {
  displayedKind: IdentityBadgeKind | null
  linkedPlayerId: string | null
  roles: readonly AuthRole[] | readonly string[]
}): SeasonPersona {
  const roleNames = input.roles.map((role) => (typeof role === 'string' ? role : role.role))
  if (input.displayedKind === 'reporter') return 'reporter'
  if (input.displayedKind === 'captain') return 'captain'
  if (input.displayedKind === 'player' && input.linkedPlayerId) return 'player'
  if (roleNames.includes('TEAM_CAPTAIN')) return 'captain'
  if (roleNames.includes('MATCH_REPORTER')) return 'reporter'
  if (input.linkedPlayerId) return 'player'
  return 'student'
}

export function seasonCardTitle(persona: SeasonPersona) {
  return persona === 'reporter' || persona === 'student' ? '我的贡献' : '我的赛季'
}

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

export function nextFollowedMatch(schedule: MatchSummary[], followedIds: readonly string[]) {
  const allowed = new Set(followedIds)
  return (
    schedule
      .filter((match) => allowed.has(match.id) && isPendingMatch(match))
      .sort(
        (a, b) =>
          (a.scheduledStartAt ? Date.parse(a.scheduledStartAt) : Infinity) -
          (b.scheduledStartAt ? Date.parse(b.scheduledStartAt) : Infinity),
      )[0] ?? null
  )
}

export function isOwnReportAuthor(
  savedBy: string,
  user: { displayName: string; username: string },
) {
  const name = savedBy.trim()
  return name === user.displayName.trim() || name === user.username.trim()
}

export interface ReporterRevisionView {
  savedBy: string
  action?: string
  status: string
  reason?: string
  eventCount: number
}

export interface ReporterWorkspaceView {
  matchId: string
  confirmedReportVersion: number | null
  latest: ReporterRevisionView | null
  history: ReporterRevisionView[]
}

export function summarizeReporter(
  workspaces: readonly ReporterWorkspaceView[],
  user: { displayName: string; username: string },
) {
  let matches = 0
  let events = 0
  let corrections = 0
  for (const workspace of workspaces) {
    const mine = [workspace.latest, ...workspace.history].filter(
      (item): item is ReporterRevisionView =>
        Boolean(item && isOwnReportAuthor(item.savedBy, user)),
    )
    if (!mine.length) continue
    const latestOwn =
      workspace.latest && isOwnReportAuthor(workspace.latest.savedBy, user)
        ? workspace.latest
        : mine[0]
    if (latestOwn) {
      matches += 1
      events += latestOwn.eventCount
    }
    corrections += mine.filter(
      (item) =>
        item.action === 'CORRECT' ||
        (workspace.confirmedReportVersion != null &&
          item.status === 'DRAFT' &&
          Boolean(item.reason?.trim())),
    ).length
  }
  return { matches, events, corrections }
}

export function studentActivity(input: {
  followedMatchCount: number
  posts: readonly PostSummary[]
  userId: string
  comments: readonly { author: { id: string } }[]
}) {
  return {
    followed: input.followedMatchCount,
    comments: input.comments.filter((item) => item.author.id === input.userId).length,
    likes: input.posts.filter((post) => post.likedByMe).length,
    posts: input.posts.filter((post) => post.author.id === input.userId).length,
  }
}

export function rosterStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'SUBMITTED':
      return '审核中'
    case 'APPROVED':
      return '已通过 · 待锁定'
    case 'LOCKED':
      return '已锁定'
    case 'RETURNED':
      return '已退回'
    case 'DRAFT':
      return '草稿'
    default:
      return status ? status : '未开放'
  }
}

export function lineupStatusLabel(plans: readonly LineupPlanStatus[]) {
  if (!plans.length) return '尚未排阵'
  const matchPlans = plans.filter((plan) => plan.kind === 'MATCH_LINEUP')
  const relevant = matchPlans.length ? matchPlans : plans
  if (relevant.some((plan) => plan.hasUnconfirmedChanges)) return '有未确认改动'
  if (relevant.some((plan) => plan.confirmedVersion != null)) return '已确认'
  return '草稿'
}

export function formatCount(value: number | undefined, ready: boolean) {
  if (!ready) return '—'
  return String(value ?? 0)
}
