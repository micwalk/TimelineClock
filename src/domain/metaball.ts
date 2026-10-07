// A 2D metaball between two circles, as SVG path data: the gooey neck that joins a small blob
// to a bigger one as they near each other, and stretches and snaps as they part. Pure.
// After Hiroyuki Sato's metaball construction (two arcs bridged by cubic curves).

export interface Point { x: number; y: number }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const angle = (a: Point, b: Point) => Math.atan2(a.y - b.y, a.x - b.x)
const toward = (c: Point, a: number, r: number): Point => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) })
const pt = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`

/** How far apart (in radii of the second circle) the neck still holds before it snaps. */
export const NECK_REACH = 2.5

/**
 * The neck between circle 1 (`c1`, `r1`) and circle 2 (`c2`, `r2`): a closed path from circle 1
 * around the far side of circle 2 and back, to be drawn with both circles. Empty when they are
 * too far apart (the neck has snapped) or one is inside the other. `spread` (0..1) is how wide
 * the neck meets the circles; `handle` how round its sides are.
 */
export function metaballNeck(c1: Point, r1: number, c2: Point, r2: number, spread = 0.5, handle = 2.4): string {
  const d = dist(c1, c2)
  if (r1 <= 0 || r2 <= 0 || d > r1 + r2 * NECK_REACH || d <= Math.abs(r1 - r2)) return ''
  const u1 = d < r1 + r2 ? Math.acos(Math.max(-1, Math.min(1, (r1 * r1 + d * d - r2 * r2) / (2 * r1 * d)))) : 0
  const u2 = d < r1 + r2 ? Math.acos(Math.max(-1, Math.min(1, (r2 * r2 + d * d - r1 * r1) / (2 * r2 * d)))) : 0
  const between = angle(c2, c1)
  const maxSpread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)))
  const a1 = between + u1 + (maxSpread - u1) * spread
  const a2 = between - u1 - (maxSpread - u1) * spread
  const a3 = between + Math.PI - u2 - (Math.PI - u2 - maxSpread) * spread
  const a4 = between - Math.PI + u2 + (Math.PI - u2 - maxSpread) * spread
  const p1 = toward(c1, a1, r1)
  const p2 = toward(c1, a2, r1)
  const p3 = toward(c2, a3, r2)
  const p4 = toward(c2, a4, r2)
  const total = r1 + r2
  // Shorter handles as the circles near each other, so the neck fattens rather than loops.
  const k = Math.min(spread * handle, dist(p1, p3) / total) * Math.min(1, (d * 2) / total)
  const h1 = toward(p1, a1 - Math.PI / 2, r1 * k)
  const h2 = toward(p2, a2 + Math.PI / 2, r1 * k)
  const h3 = toward(p3, a3 + Math.PI / 2, r2 * k)
  const h4 = toward(p4, a4 - Math.PI / 2, r2 * k)
  return `M ${pt(p1)} C ${pt(h1)} ${pt(h3)} ${pt(p3)} A ${r2.toFixed(2)} ${r2.toFixed(2)} 0 ${d > r1 ? 1 : 0} 0 ${pt(p4)} C ${pt(h4)} ${pt(h2)} ${pt(p2)} Z`
}

/** A circle as path data. */
export function circlePath(c: Point, r: number): string {
  if (!(r > 0)) return ''
  return `M ${(c.x - r).toFixed(2)} ${c.y.toFixed(2)} a ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0 a ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0 Z`
}
