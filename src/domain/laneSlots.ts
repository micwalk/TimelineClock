// Stable lane slots: a lane that is already on screen keeps its slot when others come and
// go, so nothing you're looking at jumps. New lanes take the lowest free slot, in the
// order given (most important first). Pure.

/** Slot per key: kept from `prev` when the key is still present, else the lowest free slot. */
export function stableSlots(prev: Readonly<Record<string, number>>, keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  const used = new Set<number>()
  for (const k of keys) {
    const s = prev[k]
    if (s !== undefined && !used.has(s)) { out[k] = s; used.add(s) }
  }
  let next = 0
  for (const k of keys) {
    if (out[k] !== undefined) continue
    while (used.has(next)) next++
    out[k] = next
    used.add(next)
  }
  return out
}

/** A lane's time range, for nesting. */
export interface SlotRange { lo: number; hi: number }

/**
 * Spans that contain others sit further out (lower slot = nearer the right edge in
 * vertical, the bottom in horizontal): whenever a lane strictly contains another but has
 * the higher slot, the two swap. Everything else keeps its slot. Lanes without a range
 * (e.g. an end at the cursor) are left alone.
 */
export function nestSlots(slots: Readonly<Record<string, number>>, ranges: Readonly<Record<string, SlotRange | undefined>>): Record<string, number> {
  const out = { ...slots }
  const keys = Object.keys(out)
  const contains = (a: SlotRange, b: SlotRange) => a.lo <= b.lo && a.hi >= b.hi && a.hi - a.lo > b.hi - b.lo
  // Each swap moves a container strictly outward, so this ends; the cap is a guard.
  for (let pass = 0, changed = true; changed && pass < keys.length * keys.length; pass++) {
    changed = false
    for (const a of keys) {
      for (const b of keys) {
        const ra = ranges[a], rb = ranges[b]
        if (a === b || !ra || !rb || !contains(ra, rb) || out[a] < out[b]) continue
        ;[out[a], out[b]] = [out[b], out[a]]
        changed = true
      }
    }
  }
  return out
}
