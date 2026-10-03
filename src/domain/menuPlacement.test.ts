import { describe, expect, it } from 'vitest'
import { placeMenu } from './menuPlacement.ts'

const vp = { width: 400, height: 800 }
const trig = (top: number, left = 100) => ({ left, top, right: left + 100, bottom: top + 40 })

describe('placeMenu', () => {
  it('opens below when it fits', () => {
    expect(placeMenu(trig(100), { width: 170, height: 300 }, vp)).toEqual({ side: 'below', maxHeight: 300, shiftX: 0 })
  })
  it('opens above when there is no room below', () => {
    const p = placeMenu(trig(720), { width: 170, height: 300 }, vp)
    expect(p.side).toBe('above')
    expect(p.maxHeight).toBe(300)
  })
  it('uses the larger side and caps height when both are tight', () => {
    const p = placeMenu(trig(300), { width: 170, height: 900 }, vp)
    // below: 800-340-16 = 444, above: 300-16 = 284
    expect(p).toMatchObject({ side: 'below', maxHeight: 444 })
    const q = placeMenu(trig(500), { width: 170, height: 900 }, vp)
    // below: 800-540-16 = 244, above: 484
    expect(q).toMatchObject({ side: 'above', maxHeight: 484 })
  })
  it('shifts left at the right edge and right at the left edge', () => {
    expect(placeMenu(trig(100, 300), { width: 170, height: 100 }, vp).shiftX).toBe(400 - 8 - 170 - 300)
    expect(placeMenu(trig(100, -20), { width: 170, height: 100 }, vp).shiftX).toBe(28)
  })
})
