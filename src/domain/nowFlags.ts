// Where the Now flags of saved span lanes go (vertical layout): each span that contains
// Now gets a box at the Now line, against its bar. Boxes from different lanes would
// overlap there, so each takes the free spot nearest Now inside its own span. Pure.

/** Extent across the time axis, px. Boxes whose extents don't meet never collide; omitted = full width. */
export interface CrossExtent { xlo?: number; xhi?: number }

export interface FlagItem extends CrossExtent {
  key: string
  /** The span's visible extent along the time axis, px (the box stays inside it). */
  lo: number
  hi: number
}

export interface Interval extends CrossExtent { lo: number; hi: number }

const crossMeets = (a: CrossExtent, b: CrossExtent) =>
  (a.xlo ?? -Infinity) < (b.xhi ?? Infinity) && (b.xlo ?? -Infinity) < (a.xhi ?? Infinity)

/**
 * Centers along the time axis for flags of size `size`, most important item first. Each
 * goes as near `nowPos` as it can without overlapping a placed flag or a `blocker` (saved
 * chips, lane chips) that it meets across the axis, with `gap` between; if there is no
 * free spot it sits at Now anyway (nothing disappears).
 */
export function layoutNowFlags(items: readonly FlagItem[], nowPos: number, size: number, gap: number, blockers: readonly Interval[] = []): Record<string, number> {
  const taken: Interval[] = [...blockers]
  const out: Record<string, number> = {}
  const half = size / 2
  for (const it of items) {
    const inWay = taken.filter(t => crossMeets(t, it))
    const free = (c: number) => inWay.every(t => c + half + gap <= t.lo || c - half - gap >= t.hi)
    const min = it.lo + half
    const max = it.hi - half
    const clamp = (c: number) => (min > max ? (it.lo + it.hi) / 2 : Math.min(max, Math.max(min, c)))
    const candidates = [nowPos, ...inWay.flatMap(t => [t.lo - gap - half, t.hi + gap + half])].map(clamp)
    const best = candidates.filter(free).sort((a, b) => Math.abs(a - nowPos) - Math.abs(b - nowPos))[0]
    const c = best ?? clamp(nowPos)
    out[it.key] = c
    taken.push({ lo: c - half, hi: c + half, xlo: it.xlo, xhi: it.xhi })
  }
  return out
}
