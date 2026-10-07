import { hasPublishedPositions, type MatchLineup } from './lineup.logic.ts'

type Player = MatchLineup['players'][number]
const positionDepth: Record<string, number> = {
  GOALKEEPER: 8,
  DEFENDER: 32,
  MIDFIELDER: 58,
  FORWARD: 82,
}

export function createLineupDisplay(starters: Player[]) {
  if (hasPublishedPositions(starters)) {
    return {
      source: 'PUBLISHED' as const,
      players: starters.map((player) => ({ player, point: player.pitchPosition! })),
    }
  }
  const groups = new Map<string, Player[]>()
  for (const player of starters) {
    const position = player.position ?? 'UNKNOWN'
    groups.set(position, [...(groups.get(position) ?? []), player])
  }
  return {
    source: 'DEFAULT' as const,
    players: starters.map((player) => {
      const group = groups.get(player.position ?? 'UNKNOWN')!
      return {
        player,
        // Presentation only: x is across the field, y is distance from our goal.
        // Keep every explicitly selected starter, including multiple goalkeeper profiles.
        point: {
          x: ((group.indexOf(player) + 1) * 100) / (group.length + 1),
          y: positionDepth[player.position ?? 'UNKNOWN'] ?? 70,
        },
      }
    }),
  }
}
