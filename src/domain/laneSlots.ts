// Stable lane slots: a lane that is already on screen keeps its slot when others come and
// go, so nothing you're looking at jumps. New lanes take the lowest free slot, in the
// order given (most important first). Saved lanes are packed: spans that don't overlap in
// time share a slot. Pure.

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

const overlaps = (a: SlotRange, b: SlotRange) => a.lo < b.hi && b.lo < a.hi
/** Strictly contains: covers it and is longer. */
const contains = (a: SlotRange, b: SlotRange) => a.lo <= b.lo && a.hi >= b.hi && a.hi - a.lo > b.hi - b.lo

/**
 * Packs lanes into slots: lanes whose time ranges don't overlap may share a slot (a
 * stopwatch's laps run along one track), touching ends allowed. A span that contains others
 * sits further out (a lower slot: nearer the right edge in vertical, the axis in horizontal),
 * so a stopwatch's whole run is outside its laps.
 *
 * Like stableSlots, a lane keeps its slot from `prev` while it still fits there (and stays
 * outside what it contains); others join the track of a lane they continue (touching ends),
 * else take the lowest slot they fit in. A lane's containers are placed just before it, so one
 * pass settles it. A lane without a range (an end at the cursor) gets a slot to itself.
 */
export function packSlots(
  prev: Readonly<Record<string, number>>,
  keys: readonly string[],
  ranges: Readonly<Record<string, SlotRange | undefined>>,
): Record<string, number> {
  const out: Record<string, number> = {}
  const bySlot = new Map<number, SlotRange[]>()
  const everything: SlotRange = { lo: -Infinity, hi: Infinity }
  const fits = (slot: number, r: SlotRange) => (bySlot.get(slot) ?? []).every(o => !overlaps(o, r))
  // Lanes already on screen first, so they keep their slots; then newcomers, in the given order.
  const order = [...keys.filter(k => prev[k] !== undefined), ...keys.filter(k => prev[k] === undefined)]
  const busy = new Set<string>()
  const place = (k: string) => {
    if (out[k] !== undefined || busy.has(k)) return
    busy.add(k)
    const range = ranges[k]
    // Whatever contains this lane goes first (strict containment can't loop), and this lane
    // goes outside-in: below none of them.
    let min = 0
    if (range) {
      for (const c of order) {
        const rc = ranges[c]
        if (c === k || !rc || !contains(rc, range)) continue
        place(c)
        if (out[c] !== undefined) min = Math.max(min, out[c] + 1)
      }
    }
    const r = range ?? everything
    const ok = (slot: number) => slot >= min && fits(slot, r)
    let slot = prev[k]
    if (slot === undefined || !ok(slot)) {
      // A lane that continues another (a new lap from the last one) joins its track.
      const next = range && [...bySlot].find(([sl, rs]) => ok(sl) && rs.some(o => o.hi === r.lo || o.lo === r.hi))
      if (next) slot = next[0]
      else for (slot = min; !ok(slot); slot++);
    }
    out[k] = slot
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), r])
  }
  for (const k of order) place(k)
  return out
}
