export const MATCH_BULLETIN_CODES = [
  'GC26-A-R1-01',
  'GC26-A-R2-01',
  'GC26-B-R1-02',
  'GC26-SF-01',
] as const

export function hasMatchBulletin(matchCode: string): boolean {
  return (MATCH_BULLETIN_CODES as readonly string[]).includes(matchCode)
}

const GOAL_TYPES = new Set(['GOAL', 'PENALTY_SCORED', 'OWN_GOAL'])

export function isGoalEventType(type: string): boolean {
  return GOAL_TYPES.has(type)
}

export function celebrationIndex(eventId: string, count: number): number {
  if (count <= 0) return 0
  let hash = 0
  for (let index = 0; index < eventId.length; index += 1)
    hash = (hash + eventId.charCodeAt(index) * (index + 3)) % count
  return hash
}
