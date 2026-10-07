// Chips keep out of the Cursor ＋'s way: one row (or column) of boxes along the time axis is
// pushed clear of a box that never moves, each pushing the next on when they would touch. Pure.

/** A box along the time axis, px. `at` is where its chip is centered (its side of the ＋). */
export interface PushBox { id: string; lo: number; hi: number; at: number }

/**
 * How far each box moves along the time axis (px; absent = not at all) so that none overlaps
 * `keep` (with `gap` between): boxes centered before keep's middle go before it, the rest
 * after, and a box pushed into its neighbour pushes that one on too.
 */
export function pushClear(boxes: readonly PushBox[], keep: { lo: number; hi: number }, gap: number): Record<string, number> {
  const out: Record<string, number> = {}
  const mid = (keep.lo + keep.hi) / 2
  let limit = keep.hi + gap
  for (const b of boxes.filter(x => x.at >= mid).sort((x, y) => x.lo - y.lo)) {
    if (b.lo >= limit) break
    const d = limit - b.lo
    out[b.id] = d
    limit = b.hi + d + gap
  }
  limit = keep.lo - gap
  for (const b of boxes.filter(x => x.at < mid).sort((x, y) => y.hi - x.hi)) {
    if (b.hi <= limit) break
    const d = limit - b.hi
    out[b.id] = d
    limit = b.lo + d - gap
  }
  return out
}
