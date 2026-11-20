// A long list that renders only the rows near what is on screen (the Agenda's lists): which
// rows to mount, and how tall the spacers that stand in for the rest are. Rows sit in a column
// with a gap between them; a row's slot is its height plus the gap after it. Pure.

/** How far past the visible part of the list rows stay mounted, in viewport heights, each way. */
export const LIST_OVERSCAN_VIEWPORTS = 1

export interface ListWindow {
  /** The first mounted row. */
  start: number
  /** One past the last mounted row. */
  end: number
  /** What the rows before `start` take up (their slots), px. */
  before: number
  /** What the rows from `end` on take up, px. */
  after: number
}

/** Where row `index` starts, px from the first row's top. */
export function offsetOf(slots: readonly number[], index: number): number {
  let y = 0
  for (let i = 0; i < index && i < slots.length; i++) y += slots[i]
  return y
}

/**
 * The rows to mount for a viewport `viewTop`..`viewTop + viewHeight` (px from the first row's
 * top), with `overscan` px more each way. Nothing laid out yet (a zero height): every row.
 */
export function listWindow(slots: readonly number[], viewTop: number, viewHeight: number, overscan = viewHeight * LIST_OVERSCAN_VIEWPORTS): ListWindow {
  const n = slots.length
  if (!(viewHeight > 0)) return { start: 0, end: n, before: 0, after: 0 }
  const lo = viewTop - overscan
  const hi = viewTop + viewHeight + overscan
  let y = 0
  let start = 0
  while (start < n && y + slots[start] <= lo) y += slots[start++]
  const before = y
  let end = start
  while (end < n && y < hi) y += slots[end++]
  let after = 0
  for (let i = end; i < n; i++) after += slots[i]
  return { start, end, before, after }
}

/**
 * Where to scroll so row `index` shows whole, the least distance from `viewTop` (as
 * scrollIntoView's 'nearest'); null when it already does. `margin` px are kept clear around it.
 */
export function scrollToShow(slots: readonly number[], index: number, viewTop: number, viewHeight: number, margin = 0): number | null {
  if (index < 0 || index >= slots.length) return null
  const top = offsetOf(slots, index)
  const bottom = top + slots[index]
  if (top - margin < viewTop) return Math.max(0, top - margin)
  if (bottom + margin > viewTop + viewHeight) return Math.max(0, bottom + margin - viewHeight)
  return null
}
