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

const overlaps = (a: SlotRange, b: SlotRange) => a.lo < b.hi && b.lo < a.hi

/**
 * Packs lanes into slots: lanes whose time ranges don't overlap may share a slot (a
 * stopwatch's laps run along one track), touching ends allowed. Like stableSlots, a lane
 * keeps its slot from `prev` while it still fits there; others join the track of a lane they
 * continue (touching ends), else take the lowest slot they fit in, in the order given. A lane
 * without a range (an end at the cursor) gets a slot to itself.
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
  const put = (k: string, slot: number, r: SlotRange) => {
    out[k] = slot
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), r])
  }
  for (const k of keys) {
    const s = prev[k]
    const r = ranges[k] ?? everything
    if (s !== undefined && fits(s, r)) put(k, s, r)
  }
  for (const k of keys) {
    if (out[k] !== undefined) continue
    const r = ranges[k] ?? everything
    // A lane that continues another (a new lap from the last one) joins its track.
    const next = [...bySlot].find(([slot, rs]) => rs.some(o => o.hi === r.lo || o.lo === r.hi) && fits(slot, r))
    let s = 0
    while (!fits(s, r)) s++
    put(k, next ? next[0] : s, r)
  }
  return out
}

/**
 * nestSlots for packed slots: a lane that contains another sits further out. Whole slots
 * trade places (so lanes sharing a slot stay apart); everything else keeps its slot.
 */
export function nestPackedSlots(slots: Readonly<Record<string, number>>, ranges: Readonly<Record<string, SlotRange | undefined>>): Record<string, number> {
  const out = { ...slots }
  const keys = Object.keys(out)
  const contains = (a: SlotRange, b: SlotRange) => a.lo <= b.lo && a.hi >= b.hi && a.hi - a.lo > b.hi - b.lo
  for (let pass = 0, changed = true; changed && pass < keys.length * keys.length; pass++) {
    changed = false
    for (const a of keys) {
      for (const b of keys) {
        const ra = ranges[a], rb = ranges[b]
        if (a === b || !ra || !rb || !contains(ra, rb) || out[a] < out[b]) continue
        const sa = out[a], sb = out[b]
        for (const k of keys) out[k] = out[k] === sa ? sb : out[k] === sb ? sa : out[k]
        changed = true
      }
    }
  }
  return out
}
