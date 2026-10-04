import type { MatchExperienceResponse } from '../product/product.types.ts'

export type MatchEvent = MatchExperienceResponse['events'][number]
export type MatchLineup = Omit<
  MatchExperienceResponse['lineups'][number],
  | 'players'
  | 'formation'
  | 'lineupSource'
  | 'appearanceRecorded'
  | 'confirmedVersion'
  | 'confirmedAt'
> & {
  formation?: string | null
  lineupSource?: string
  appearanceRecorded?: boolean
  confirmedVersion?: number | null
  confirmedAt?: string | null
  players: Array<
    Omit<
      MatchExperienceResponse['lineups'][number]['players'][number],
      'pitchPosition' | 'minutesPlayed'
    > & {
      pitchPosition?: { x: number; y: number } | null
      minutesPlayed: number | null
    }
  >
}

export interface PlayerMatchEvents {
  goals: string[]
  assists: string[]
  ownGoals: string[]
  yellowCards: string[]
  redCards: string[]
  on: string[]
  off: string[]
}

export function minuteLabel(event: Pick<MatchEvent, 'minute' | 'stoppageMinute'>): string {
  return `${event.minute}${event.stoppageMinute ? `+${event.stoppageMinute}` : ''}′`
}

export function orderedEvents(events: MatchEvent[]): MatchEvent[] {
  // Stable sorting preserves the API's sortOrder for simultaneous events.
  return [...events].sort(
    (left, right) =>
      left.minute - right.minute || (left.stoppageMinute ?? 0) - (right.stoppageMinute ?? 0),
  )
}

export function collectPlayerEvents(
  events: MatchEvent[],
  teamId: string,
): Map<string, PlayerMatchEvents> {
  const result = new Map<string, PlayerMatchEvents>()
  const get = (playerId: string) => {
    let item = result.get(playerId)
    if (!item) {
      item = {
        goals: [],
        assists: [],
        ownGoals: [],
        yellowCards: [],
        redCards: [],
        on: [],
        off: [],
      }
      result.set(playerId, item)
    }
    return item
  }
  for (const event of orderedEvents(events)) {
    if (event.team.id !== teamId) continue
    const minute = minuteLabel(event)
    if (event.player) {
      const player = get(event.player.id)
      switch (event.type) {
        case 'GOAL':
        case 'PENALTY_SCORED':
          player.goals.push(minute)
          break
        case 'OWN_GOAL':
          player.ownGoals.push(minute)
          break
        case 'YELLOW_CARD':
          player.yellowCards.push(minute)
          break
        case 'RED_CARD':
          player.redCards.push(minute)
          break
        case 'SUBSTITUTION':
          // A substitution is one paired event: player off, related player on.
          // Keep every transition: a substitute can enter and later leave.
          if (event.relatedPlayer) {
            player.off.push(minute)
            get(event.relatedPlayer.id).on.push(minute)
          }
          break
      }
    }
    if (event.type === 'GOAL' && event.relatedPlayer)
      get(event.relatedPlayer.id).assists.push(minute)
  }
  return result
}

export function playerEventDetails(events: PlayerMatchEvents | undefined): string[] {
  if (!events) return []
  const labels: Array<[keyof PlayerMatchEvents, string]> = [
    ['goals', '进球'],
    ['assists', '助攻'],
    ['ownGoals', '乌龙球'],
    ['on', '换上'],
    ['off', '换下'],
    ['yellowCards', '黄牌'],
    ['redCards', '红牌'],
  ]
  return labels.flatMap(([key, label]) =>
    events[key].length ? [`${label} ${events[key].join('、')}`] : [],
  )
}

export function lineupGroups(lineup: MatchLineup) {
  if (lineup.lineupSource === 'UNAVAILABLE') return { starters: [], substitutes: [] }
  // Only the explicit appearance/lineup flag defines a starter; a roster is not a lineup.
  return {
    starters: lineup.players.filter((player) => player.starter),
    substitutes: lineup.players.filter((player) => !player.starter),
  }
}

export function lineupHasAppearances(lineup: MatchLineup): boolean {
  return lineup.appearanceRecorded ?? lineup.lineupSource !== 'CONFIRMED_MATCH_LINEUP'
}

export function playerAppearanceLabel(
  player: MatchLineup['players'][number],
  recorded: boolean,
  events?: PlayerMatchEvents,
): string {
  if (!recorded) return '实际出场未录入'
  if (player.minutesPlayed !== null && player.minutesPlayed > 0)
    return `${player.minutesPlayed} 分钟`
  if (player.minutesPlayed === null || player.starter || events?.on.length) return '出场分钟未提供'
  return '未出场'
}

export function hasPublishedPositions(players: MatchLineup['players']): boolean {
  return (
    players.length > 0 &&
    players.every((player) => {
      const point = player.pitchPosition
      return (
        point != null &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= 100 &&
        point.y >= 0 &&
        point.y <= 100
      )
    })
  )
}
