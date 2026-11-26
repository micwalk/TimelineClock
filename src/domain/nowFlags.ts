// Where the flags of saved span lanes go (vertical layout): each span that contains Now
// gets a box at the Now line, and other spans a label box at their middle (`prefer`),
// against their bar. Boxes from different lanes would overlap, so each takes the free spot
// nearest where it wants to be, inside its own span (its center never leaves the span). With
// `drop`, a box with no free spot there isn't placed: its span shows its bar only. Also places
// the horizontal lanes' chips along their tracks (components/timeline/laneChipLayout). Pure.

/** Extent across the time axis, px. Boxes whose extents don't meet never collide; omitted = full width. */
export interface CrossExtent { xlo?: number; xhi?: number }

export interface FlagItem extends CrossExtent {
  key: string
  /** Where this flag wants to sit along the time axis, px (default: Now). */
  prefer?: number
  /** The span's visible extent along the time axis, px (the box stays inside it). */
  lo: number
  hi: number
  /** Its length along the time axis, px (default: the `size` given to layoutNowFlags). */
  size?: number
}

export interface Interval extends CrossExtent { lo: number; hi: number }

const crossMeets = (a: CrossExtent, b: CrossExtent) =>
  (a.xlo ?? -Infinity) < (b.xhi ?? Infinity) && (b.xlo ?? -Infinity) < (a.xhi ?? Infinity)

/**
 * Centers along the time axis for flags of size `size` (or their own), most important item
 * first. Each goes as near where it wants to be (`prefer`, else `nowPos`) as it can without
 * overlapping a placed flag or a `blocker` (saved chips, lane chips) that it meets across the
 * axis, with `gap` between, its center inside its span; if there is no free spot it sits
 * there anyway (on top), or with `drop` it is left out of the result (its bar alone shows).
 */
export function layoutNowFlags(
  items: readonly FlagItem[], nowPos: number, size: number, gap: number, blockers: readonly Interval[] = [],
  opts: {
    escape?: boolean
    drop?: boolean
    /**
     * A box longer than its span may sit anywhere it still covers the whole span, keeping each
     * end of the span at least this far inside it, px (capped at a quarter of the box); absent,
     * it sits at the span's middle. A box shorter than its span always stays inside it.
     */
    cover?: number
  } = {},
): Record<string, number> {
  const taken: Interval[] = [...blockers]
  const out: Record<string, number> = {}
  for (const it of items) {
    const half = (it.size ?? size) / 2
    const inWay = taken.filter(t => crossMeets(t, it))
    const free = (c: number) => inWay.every(t => c + half + gap <= t.lo || c - half - gap >= t.hi)
    const inset = opts.cover === undefined ? Infinity : Math.min(opts.cover, half / 2)
    const inside = it.hi - it.lo >= 2 * half
    // Inside its span, or (a span shorter than the box) covering it.
    const min = inside ? it.lo + half : it.hi - half + inset
    const max = inside ? it.hi - half : it.lo + half - inset
    const clamp = (c: number) => (min > max ? (it.lo + it.hi) / 2 : Math.min(max, Math.max(min, c)))
    const want = it.prefer ?? nowPos
    const candidates = [want, ...inWay.flatMap(t => [t.lo - gap - half, t.hi + gap + half])].map(clamp)
    const nearest = (cs: number[]) => cs.filter(free).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0]
    // `escape`: a span too short to hold the box clear of the others lets it out, to the
    // nearest free spot past its ends, rather than stacking it on top.
    const raw = [want, ...inWay.flatMap(t => [t.lo - gap - half, t.hi + gap + half])]
    const best = nearest(candidates) ?? (opts.escape ? nearest(raw) : undefined)
    if (best === undefined && opts.drop) continue
    const c = best ?? clamp(want)
    out[it.key] = c
    taken.push({ lo: c - half, hi: c + half, xlo: it.xlo, xhi: it.xhi })
  }
  return out
}
