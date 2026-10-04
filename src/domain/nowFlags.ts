// Where the Now flags of saved span lanes go (vertical layout): each span that contains
// Now gets a box at the Now line, against its bar. Boxes from different lanes would
// overlap there, so each takes the free spot nearest Now inside its own span. Pure.

export interface FlagItem {
  key: string
  /** The span's visible extent along the time axis, px (the box stays inside it). */
  lo: number
  hi: number
}

export interface Interval { lo: number; hi: number }

/**
 * Centers along the time axis for flags of size `size`, most important item first. Each
 * goes as near `nowPos` as it can without overlapping a placed flag or a `blocker` (with
 * `gap` between); if there is no free spot it sits at Now anyway (nothing disappears).
 */
export function layoutNowFlags(items: readonly FlagItem[], nowPos: number, size: number, gap: number, blockers: readonly Interval[] = []): Record<string, number> {
  const taken: Interval[] = [...blockers]
  const out: Record<string, number> = {}
  const half = size / 2
  const free = (c: number) => taken.every(t => c + half + gap <= t.lo || c - half - gap >= t.hi)
  for (const it of items) {
    const min = it.lo + half
    const max = it.hi - half
    const clamp = (c: number) => (min > max ? (it.lo + it.hi) / 2 : Math.min(max, Math.max(min, c)))
    const candidates = [nowPos, ...taken.flatMap(t => [t.lo - gap - half, t.hi + gap + half])].map(clamp)
    const best = candidates.filter(free).sort((a, b) => Math.abs(a - nowPos) - Math.abs(b - nowPos))[0]
    const c = best ?? clamp(nowPos)
    out[it.key] = c
    taken.push({ lo: c - half, hi: c + half })
  }
  return out
}
