/** How many group tables to show before the in-module ranking scroll. */
export const LEADER_PREVIEW_COUNT = 6

/** Expanded multi-group standings use two columns; a single group or the narrow collapsed panel stays one column. */
export function groupTableColumns(groupCount: number, expanded: boolean): 1 | 2 {
  return expanded && groupCount > 1 ? 2 : 1
}

export function visibleLeaderRows<T>(rows: readonly T[], scrollOpen: boolean): T[] {
  if (scrollOpen || rows.length <= LEADER_PREVIEW_COUNT) return [...rows]
  return rows.slice(0, LEADER_PREVIEW_COUNT)
}

export function leaderScrollAvailable(rowCount: number): boolean {
  return rowCount > LEADER_PREVIEW_COUNT
}
