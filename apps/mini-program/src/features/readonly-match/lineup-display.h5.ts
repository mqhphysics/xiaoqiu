import { hasPublishedPositions, type MatchLineup } from './lineup.logic.ts'

type Player = MatchLineup['players'][number]
export type PitchLane = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD'

const laneDepth: Record<PitchLane, number> = {
  GOALKEEPER: 8,
  DEFENDER: 32,
  MIDFIELDER: 58,
  FORWARD: 82,
}

function isLane(value: string | null | undefined): value is PitchLane {
  return (
    value === 'GOALKEEPER' || value === 'DEFENDER' || value === 'MIDFIELDER' || value === 'FORWARD'
  )
}

/** At most one starter occupies the goalkeeper lane; extra GK profiles shift to defence. */
export function pitchLaneFor(player: Player, keeperId: string | null): PitchLane {
  if (player.position === 'GOALKEEPER') return player.id === keeperId ? 'GOALKEEPER' : 'DEFENDER'
  return isLane(player.position) ? player.position : 'MIDFIELDER'
}

export function designateGoalkeeper(starters: Player[]): string | null {
  const keepers = starters.filter((player) => player.position === 'GOALKEEPER')
  return keepers[0]?.id ?? null
}

export function createLineupDisplay(starters: Player[]) {
  if (hasPublishedPositions(starters)) {
    const keeperId = designateGoalkeeper(starters)
    return {
      source: 'PUBLISHED' as const,
      keeperId,
      players: starters.map((player) => ({
        player,
        lane: pitchLaneFor(player, keeperId),
        point: player.pitchPosition!,
      })),
    }
  }
  const keeperId = designateGoalkeeper(starters)
  const groups = new Map<PitchLane, Player[]>([
    ['GOALKEEPER', []],
    ['DEFENDER', []],
    ['MIDFIELDER', []],
    ['FORWARD', []],
  ])
  for (const player of starters) groups.get(pitchLaneFor(player, keeperId))!.push(player)
  return {
    source: 'DEFAULT' as const,
    keeperId,
    players: starters.map((player) => {
      const lane = pitchLaneFor(player, keeperId)
      const group = groups.get(lane)!
      return {
        player,
        lane,
        point: {
          x: ((group.indexOf(player) + 1) * 100) / (group.length + 1),
          y: laneDepth[lane],
        },
      }
    }),
  }
}
