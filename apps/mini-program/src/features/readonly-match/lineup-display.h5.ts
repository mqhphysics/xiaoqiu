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
  // Default formation: one GK row + DF / MF / FW. Extra players labelled GOALKEEPER sit with the defenders.
  const keepers = starters
    .filter((player) => player.position === 'GOALKEEPER')
    .sort((a, b) => Number(a.shirtNumber ?? 99) - Number(b.shirtNumber ?? 99))
  const primaryKeeper = keepers[0]?.id
  const groups = new Map<string, Player[]>()
  for (const player of starters) {
    const position =
      player.position === 'GOALKEEPER' && player.id !== primaryKeeper
        ? 'DEFENDER'
        : (player.position ?? 'UNKNOWN')
    groups.set(position, [...(groups.get(position) ?? []), player])
  }
  return {
    source: 'DEFAULT' as const,
    players: starters.map((player) => {
      const row =
        player.position === 'GOALKEEPER' && player.id !== primaryKeeper
          ? 'DEFENDER'
          : (player.position ?? 'UNKNOWN')
      const group = groups.get(row)!
      return {
        player,
        // Presentation only: x is across the field, y is distance from our goal.
        point: {
          x: ((group.indexOf(player) + 1) * 100) / (group.length + 1),
          y: positionDepth[row] ?? 70,
        },
      }
    }),
  }
}
