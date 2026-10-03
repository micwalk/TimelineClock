// Pure helpers for moving focus between instants and through focus history.

export type NavTarget =
  | { kind: 'now'; ts: number }
  | { kind: 'cursor'; ts: number }
  | { kind: 'saved'; id: string; ts: number }

/**
 * Next/previous navigable item strictly after/before `anchorTs`.
 * `items` need not be sorted.
 */
export function findAdjacent(items: NavTarget[], anchorTs: number, direction: 1 | -1): NavTarget | null {
  let best: NavTarget | null = null
  for (const it of items) {
    if (direction > 0 ? it.ts <= anchorTs : it.ts >= anchorTs) continue
    if (!best || (direction > 0 ? it.ts < best.ts : it.ts > best.ts)) best = it
  }
  return best
}

export interface FocusHistory {
  focusHistory: string[]
  focusHistoryIndex: number
}

const MAX_HISTORY = 20

export function pushFocusHistory(h: FocusHistory, id: string): FocusHistory {
  if (h.focusHistory[h.focusHistory.length - 1] === id) {
    return { ...h, focusHistoryIndex: h.focusHistory.length - 1 }
  }
  const next = [...h.focusHistory, id].slice(-MAX_HISTORY)
  return { focusHistory: next, focusHistoryIndex: next.length - 1 }
}

/** Index to move to, or null if out of range. */
export function stepFocusHistory(h: FocusHistory, delta: -1 | 1): number | null {
  const i = h.focusHistoryIndex + delta
  return i >= 0 && i < h.focusHistory.length ? i : null
}
