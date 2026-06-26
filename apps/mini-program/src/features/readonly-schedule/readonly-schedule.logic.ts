import type {
  MatchStatus,
  ReadonlyMatch,
  ScheduleDateGroup,
  ScheduleStageGroup,
} from './readonly-schedule.types'

export function sortMatchesByStartAt(matches: ReadonlyMatch[]): ReadonlyMatch[] {
  return [...matches].sort((left, right) => {
    const timeDiff = Date.parse(left.scheduledStartAt) - Date.parse(right.scheduledStartAt)
    if (timeDiff !== 0) return timeDiff
    return left.id.localeCompare(right.id)
  })
}

export function groupMatchesByDateAndStage(matches: ReadonlyMatch[]): ScheduleDateGroup[] {
  const sorted = sortMatchesByStartAt(matches)
  const groups: ScheduleDateGroup[] = []

  for (const match of sorted) {
    const dateKey = match.scheduledStartAt.slice(0, 10)
    let dateGroup = groups.find((group) => group.dateKey === dateKey)
    if (!dateGroup) {
      dateGroup = {
        dateKey,
        dateLabel: formatDateLabel(match.scheduledStartAt),
        stages: [],
      }
      groups.push(dateGroup)
    }

    let stageGroup: ScheduleStageGroup | undefined = dateGroup.stages.find(
      (group) => group.stageName === match.stageName,
    )
    if (!stageGroup) {
      stageGroup = { stageName: match.stageName, matches: [] }
      dateGroup.stages.push(stageGroup)
    }

    stageGroup.matches.push(match)
  }

  return groups
}

export function getMatchStatusText(status: MatchStatus): string {
  switch (status) {
    case 'DRAFT':
      return '草稿'
    case 'SCHEDULED':
      return '未开始'
    case 'LIVE':
      return '进行中'
    case 'POSTPONED':
      return '已延期'
    case 'CANCELLED':
      return '已取消'
    case 'FINISHED':
      return '已结束'
  }
}

export function getMatchStatusTone(status: MatchStatus): 'normal' | 'muted' | 'danger' | 'done' {
  switch (status) {
    case 'DRAFT':
      return 'muted'
    case 'LIVE':
      return 'normal'
    case 'POSTPONED':
      return 'muted'
    case 'CANCELLED':
      return 'danger'
    case 'FINISHED':
      return 'done'
    case 'SCHEDULED':
      return 'muted'
  }
}

export function formatMatchTime(value: string): string {
  const date = new Date(value)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatDateLabel(value: string): string {
  const date = new Date(value)
  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}
