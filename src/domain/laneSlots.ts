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
