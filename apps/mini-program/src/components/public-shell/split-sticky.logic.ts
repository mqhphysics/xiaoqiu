/** Desktop split columns that should keep the shorter side in view. */
export const SPLIT_SCROLL_SELECTORS = [
  '.schedule-layout',
  '.th-columns',
  '.data-desktop__competition-panels',
  '.data-desktop__player-panels',
  '.tournament-columns',
  '.player-detail-grid',
] as const

export const SPLIT_SCROLL_SELECTOR = SPLIT_SCROLL_SELECTORS.join(',')

/** Ignore sub-pixel differences when deciding which column is shorter. */
export const STICKY_HEIGHT_EPSILON = 8

/** Gap between the sticky header (or overlay edge) and the pinned column. */
export const STICKY_EDGE_GAP = 12

/**
 * Count tracks in a computed `grid-template-columns` value.
 * `minmax()` and other functions contain spaces, so the string cannot be split on whitespace.
 */
export function countGridColumns(template: string): number {
  const value = template.trim()
  if (value === '' || value === 'none') return 1
  let depth = 0
  let count = 0
  let inToken = false
  for (const char of value) {
    if (char === '(') {
      depth += 1
      inToken = true
      continue
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (char === ' ' && depth === 0) {
      if (inToken) count += 1
      inToken = false
      continue
    }
    if (char !== ' ') inToken = true
  }
  if (inToken) count += 1
  return Math.max(count, 1)
}

/** Offset from the top of the scrollport. Overlay scrollers have no page header. */
export function stickyOffset(headerHeight: number, inOverlay: boolean): number {
  if (inOverlay) return STICKY_EDGE_GAP
  const header = Number.isFinite(headerHeight) ? Math.max(0, headerHeight) : 0
  return Math.round(header) + STICKY_EDGE_GAP
}

/** Vertical room left for a pinned column after the offset and a bottom gap. */
export function availableStickyHeight(viewportHeight: number, offset: number): number {
  if (!Number.isFinite(viewportHeight) || !Number.isFinite(offset)) return 0
  return viewportHeight - offset - STICKY_EDGE_GAP
}

/**
 * Indexes of columns that should stick.
 * Only a column that is shorter than its sibling and fully fits the viewport is pinned,
 * so a taller column keeps scrolling with the page and a too-tall side column is not clipped.
 */
export function chooseStickyIndexes(
  heights: number[],
  availableHeight: number,
  columnCount: number,
): number[] {
  if (columnCount < 2 || availableHeight <= 0) return []
  const measurable = heights.flatMap((height, index) =>
    Number.isFinite(height) && height > 1 ? [{ height, index }] : [],
  )
  if (measurable.length < 2) return []
  let min = measurable[0]!.height
  let max = min
  for (const item of measurable) {
    if (item.height < min) min = item.height
    if (item.height > max) max = item.height
  }
  if (max - min < STICKY_HEIGHT_EPSILON) return []
  return measurable.flatMap((item) =>
    item.height <= min + 0.5 && item.height <= availableHeight + 0.5 ? [item.index] : [],
  )
}
