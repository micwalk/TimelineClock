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
