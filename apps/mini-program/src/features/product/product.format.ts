import type { MatchStatus } from './product.types'

export function formatDate(value: string | null): string {
  if (!value) return '时间待定'
  return new Date(value).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
}
export function formatLongDate(value: string | null): string {
  if (!value) return '时间待定'
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

export function formatTime(value: string | null): string {
  if (!value) return '--:--'
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatRelativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime()
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function matchStatusLabel(status: MatchStatus): string {
  const labels: Record<MatchStatus, string> = {
    DRAFT: '草稿',
    SCHEDULED: '未开始',
    CHECK_IN: '签到中',
    LIVE: '进行中',
    FINISHED: '已结束',
    CONFIRMED: '已确认',
    POSTPONED: '已延期',
    CANCELLED: '已取消',
    ABANDONED: '已中止',
  }
  return labels[status]
}

export function matchStatusTone(status: MatchStatus): string {
  if (status === 'LIVE') return 'live'
  if (status === 'FINISHED' || status === 'CONFIRMED') return 'finished'
  if (status === 'POSTPONED' || status === 'CANCELLED' || status === 'ABANDONED') {
    return 'warning'
  }
  return 'upcoming'
}

export function positionLabel(position: string | null): string {
  const labels: Record<string, string> = {
    GOALKEEPER: '门将',
    DEFENDER: '后卫',
    MIDFIELDER: '中场',
    FORWARD: '前锋',
  }
  return position ? labels[position] ?? position : '位置待定'
}

export function footLabel(foot: string | null): string {
  const labels: Record<string, string> = { LEFT: '左脚', RIGHT: '右脚', BOTH: '双脚' }
  return foot ? labels[foot] ?? foot : '未填写'
}

export function verificationLabel(level: string): string {
  const labels: Record<string, string> = {
    UNVERIFIED: '普通用户',
    STUDENT_VERIFIED: '已认证学生',
    PLAYER_CONFIRMED: '认证球员',
    STAFF_VERIFIED: '赛事工作人员',
  }
  return labels[level] ?? level
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    STUDENT: '学生',
    PLAYER: '球员',
    TEAM_CAPTAIN: '球队队长',
    MATCH_REPORTER: '比赛信息员',
    TOURNAMENT_ADMIN: '赛事管理员',
    ORGANIZATION_ADMIN: '组织管理员',
  }
  return labels[role] ?? role
}

export function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    GOAL: '进球',
    OWN_GOAL: '乌龙球',
    YELLOW_CARD: '黄牌',
    RED_CARD: '红牌',
    SUBSTITUTION: '换人',
    PENALTY_SCORED: '点球命中',
    PENALTY_MISSED: '点球未进',
  }
  return labels[type] ?? type
}
