// Repeats, zoomed out (TLC-5, step 1). Pure.
//
// A repeating series zoomed out far enough that its occurrences crowd (closer together on screen
// than a chip needs) stops drawing a chip and a full line for each: its occurrences become a
// rhythm of short ticks on the axis, and one summary chip ("⟳ Wake up · Weekdays 9:00a · next in
// 3d 8h") stands for them, at the next one. Exceptions keep their own chips: an occurrence edited
// on its own, ringing, or being worked with (selected, focused, named, moved).

export interface RhythmMember {
  id: string
  seriesId: string
  /** Main-axis position, px. */
  pos: number
  ts: number
  /** An exception: keeps its own chip. */
  keep: boolean
}

export interface SeriesSummary {
  seriesId: string
  /** The occurrence the summary chip sits at: the first still ahead, else the latest; on screen when any is. */
  anchorId: string
  anchorTs: number
  /** Occurrences it stands for on screen. */
  count: number
  /** The occurrence after the anchor (a tap zooms in to tell them apart), or null. */
  nextTs: number | null
}

export interface RhythmPlan {
  /** Occurrence id → its series: drawn as a tick, no chip. */
  collapsed: Record<string, string>
  summaries: SeriesSummary[]
}

/** Fewest occurrences on screen before a series collapses (two chips are never clutter). */
export const RHYTHM_MIN = 3

/**
 * Which series collapse into a rhythm: those with at least RHYTHM_MIN occurrences on screen
 * whose closest two are less than `gapPx(series)` apart. Their occurrences that aren't
 * exceptions collapse (at least two, or nothing does).
 */
export function planRhythm(
  members: readonly RhythmMember[],
  o: { now: number; gapPx: (seriesId: string) => number; /** The screen, px: the summary sits on it when it can. */ view?: { lo: number; hi: number } },
): RhythmPlan {
  const bySeries = new Map<string, RhythmMember[]>()
  for (const m of members) {
    const list = bySeries.get(m.seriesId)
    if (list) list.push(m)
    else bySeries.set(m.seriesId, [m])
  }
  const collapsed: Record<string, string> = {}
  const summaries: SeriesSummary[] = []
  for (const [seriesId, list] of [...bySeries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (list.length < RHYTHM_MIN) continue
    const sorted = [...list].sort((a, b) => a.ts - b.ts)
    let minGap = Infinity
    for (let k = 1; k < sorted.length; k++) minGap = Math.min(minGap, Math.abs(sorted[k].pos - sorted[k - 1].pos))
    if (minGap >= o.gapPx(seriesId)) continue
    const folded = sorted.filter(m => !m.keep)
    if (folded.length < 2) continue
    for (const m of folded) collapsed[m.id] = seriesId
    const onScreen = o.view ? folded.filter(m => m.pos >= o.view!.lo && m.pos <= o.view!.hi) : folded
    const pool = onScreen.length > 0 ? onScreen : folded
    // The first still ahead; with none ahead, the latest (the nearest to Now).
    const anchor = pool.find(m => m.ts >= o.now) ?? pool[pool.length - 1]
    const after = folded[folded.indexOf(anchor) + 1]
    summaries.push({ seriesId, anchorId: anchor.id, anchorTs: anchor.ts, count: folded.length, nextTs: after?.ts ?? null })
  }
  return { collapsed, summaries }
}

/** A series summary's layout id (it shares the chips' layout). */
export const seriesItemId = (seriesId: string) => `series:${seriesId}`
