// Which instant the cursor is about to land on. Pure.
//
// While a drag is held, an instant within the landing radius (the one a slow release would snap
// onto) captures the cursor, so the timeline can show the landing before it happens. At rest
// only an exact hit captures (the cursor sitting right on an instant, as after dropping one).
// Hysteresis keeps the capture from flickering at the edge of the radius.

export interface CaptureCandidate { id: string; ts: number; hidden?: boolean }

export interface CaptureInput {
  instants: readonly CaptureCandidate[]
  /** The cursor's time (the view center). */
  center: number
  pxPerMs: number
  /** Capture within this many px of the cursor. */
  radiusPx: number
  /** The instant captured last time: it stays captured up to radiusPx + releasePx. */
  prevId?: string | null
  releasePx?: number
}

/** The captured instant's id, or null. Hidden instants never capture (they aren't drawn). */
export function findCapture(o: CaptureInput): string | null {
  const reach = (id: string) => o.radiusPx + (id === o.prevId ? (o.releasePx ?? 0) : 0)
  let best: { id: string; d: number } | null = null
  for (const i of o.instants) {
    if (i.hidden) continue
    const d = Math.abs(i.ts - o.center) * o.pxPerMs
    if (d > reach(i.id)) continue
    // The nearest wins; the one already captured wins a tie.
    if (!best || d < best.d || (d === best.d && i.id === o.prevId)) best = { id: i.id, d }
  }
  return best?.id ?? null
}

/** A box in timeline px: `lo`–`hi` along the time axis, `xlo`–`xhi` across it. */
export interface Box { lo: number; hi: number; xlo: number; xhi: number }

const gapBetween = (a: Box, b: Box) =>
  Math.max(0, a.lo - b.hi, b.lo - a.hi) + Math.max(0, a.xlo - b.xhi, b.xlo - a.xhi)

/**
 * The box that overlaps `target` (the Cursor tag's ＋), nearest along the time axis first: the
 * ＋ can't sit on a chip, so it flows into the chip it would cover. The one overlapping last
 * time holds until it is `releasePx` clear (no flicker at the edge).
 */
export function findBoxOverlap(boxes: readonly (Box & { id: string })[], target: Box, prevId?: string | null, releasePx = 0): string | null {
  const mid = (b: Box) => (b.lo + b.hi) / 2
  let best: { id: string; d: number } | null = null
  for (const b of boxes) {
    const gap = gapBetween(b, target)
    if (gap > (b.id === prevId ? releasePx : 0)) continue
    const d = Math.abs(mid(b) - mid(target))
    if (!best || d < best.d || (d === best.d && b.id === prevId)) best = { id: b.id, d }
  }
  return best?.id ?? null
}
