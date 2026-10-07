// What the cursor is on, or about to land on: an instant, or Now. Pure. The one definition of
// "near enough": the live capture (the tag gliding onto the line, the ＋ flowing into the chip,
// the cursor tag merging into Now's), a release's landing, and a typed time or step landing on
// an exact hit all ask it.
//
// While a drag is held, a target within the landing radius (where a slow release lands)
// captures the cursor, so the timeline can show the landing before it happens. At rest only an
// exact hit captures. Hysteresis keeps the capture from flickering at the edge of the radius.

export interface CaptureCandidate { id: string; ts: number; hidden?: boolean }

/** Now's id among capture targets. */
export const NOW_TARGET = '__now__'

export interface CaptureInput {
  instants: readonly CaptureCandidate[]
  /** Now's time, when Now can be landed on too (it is then a candidate, id NOW_TARGET). */
  now?: number
  /** The cursor's time (the view center). */
  center: number
  pxPerMs: number
  /** Capture within this many px of the cursor. */
  radiusPx: number
  /** The instant captured last time: it stays captured up to radiusPx + releasePx. */
  prevId?: string | null
  releasePx?: number
}

/** The captured target's id (an instant's, or NOW_TARGET), or null. Hidden instants never capture (they aren't drawn). */
export function findCapture(o: CaptureInput): string | null {
  const reach = (id: string) => o.radiusPx + (id === o.prevId ? (o.releasePx ?? 0) : 0)
  const found: { best: { id: string; d: number } | null } = { best: null }
  const consider = (id: string, ts: number) => {
    const d = Math.abs(ts - o.center) * o.pxPerMs
    if (d > reach(id)) return
    // The nearest wins; the one already captured wins a tie, then an instant over Now (one
    // dropped at Now is what you're after).
    const b = found.best
    if (!b || d < b.d || (d === b.d && (id === o.prevId || (b.id === NOW_TARGET && b.id !== o.prevId)))) found.best = { id, d }
  }
  if (o.now !== undefined) consider(NOW_TARGET, o.now)
  for (const i of o.instants) if (!i.hidden) consider(i.id, i.ts)
  return found.best?.id ?? null
}

