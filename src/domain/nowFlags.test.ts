import { describe, expect, it } from 'vitest'
import { layoutNowFlags } from './nowFlags.ts'

describe('layoutNowFlags', () => {
  it('puts a lone flag at Now', () => {
    expect(layoutNowFlags([{ key: 'a', lo: 0, hi: 1000 }], 400, 26, 4)).toEqual({ a: 400 })
  })

  it('stacks flags next to each other instead of overlapping', () => {
    const r = layoutNowFlags([{ key: 'a', lo: 0, hi: 1000 }, { key: 'b', lo: 0, hi: 1000 }, { key: 'c', lo: 0, hi: 1000 }], 400, 26, 4)
    expect(r.a).toBe(400)
    expect([r.b, r.c].sort((x, y) => x - y)).toEqual([370, 430])
  })

  it('keeps each flag inside its own span', () => {
    // b's span ends just after Now: its flag can only go above (earlier).
    const r = layoutNowFlags([{ key: 'a', lo: 0, hi: 1000 }, { key: 'b', lo: 300, hi: 410 }], 400, 26, 4)
    expect(r.a).toBe(400)
    expect(r.b).toBe(370)
  })

  it('avoids blockers (span chips already on screen)', () => {
    expect(layoutNowFlags([{ key: 'a', lo: 0, hi: 1000 }], 400, 26, 4, [{ lo: 390, hi: 418 }]).a).toBe(373)
  })

  it('sits at Now when there is no free spot', () => {
    const r = layoutNowFlags([{ key: 'a', lo: 390, hi: 412 }, { key: 'b', lo: 390, hi: 412 }], 400, 26, 4)
    expect(r.b).toBe(401)
  })
  it('ignores blockers it does not meet across the axis', () => {
    // A chip left of the flag (x 0–100) doesn't push a flag at x 150–300; one under it does.
    expect(layoutNowFlags([{ key: 'a', lo: 0, hi: 1000, xlo: 150, xhi: 300 }], 400, 26, 4, [{ lo: 390, hi: 418, xlo: 0, xhi: 100 }]).a).toBe(400)
    expect(layoutNowFlags([{ key: 'a', lo: 0, hi: 1000, xlo: 150, xhi: 300 }], 400, 26, 4, [{ lo: 390, hi: 418, xlo: 0, xhi: 200 }]).a).toBe(373)
  })
  it('puts a flag where it prefers, else near there', () => {
    expect(layoutNowFlags([{ key: 'a', lo: 0, hi: 1000, prefer: 700 }], 400, 26, 4).a).toBe(700)
    const r = layoutNowFlags([{ key: 'a', lo: 0, hi: 1000 }, { key: 'b', lo: 300, hi: 500, prefer: 400 }], 400, 26, 4)
    expect(r.a).toBe(400)
    expect(Math.abs(r.b - 400)).toBe(30)
  })
  it('with escape, a box whose span is too short to clear the others goes just past its span instead of on top', () => {
    // A chip block covers most of a short span (300–420); the flag can't fit inside it.
    const blocker = [{ lo: 310, hi: 414 }]
    const stuck = layoutNowFlags([{ key: 'a', lo: 300, hi: 420, prefer: 360 }], 0, 26, 4, blocker)
    expect(stuck.a).toBe(360) // on top: nothing better inside the span
    const out = layoutNowFlags([{ key: 'a', lo: 300, hi: 420, prefer: 360 }], 0, 26, 4, blocker, { escape: true })
    expect(out.a).toBe(293) // just above the blocker: 310 - 4 - 13
  })
})
