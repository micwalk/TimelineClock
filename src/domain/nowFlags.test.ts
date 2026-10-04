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
})
