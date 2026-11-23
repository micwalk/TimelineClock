import { describe, expect, it } from 'vitest'
import { CHARGE_SCALE, doneBoxAt, inflow, moteAt, springTo1 } from './doneBurst.ts'

const timing = { chargeS: 0.6, popS: 1 }

describe('doneBoxAt', () => {
  it('charges: the glow and fill grow, the box shrinks and greens', () => {
    const a = doneBoxAt(0.05, timing)!
    const b = doneBoxAt(0.55, timing)!
    expect(b.glow).toBeGreaterThan(a.glow)
    expect(b.fill).toBeGreaterThan(a.fill)
    expect(b.green).toBeGreaterThan(a.green)
    expect(b.scale).toBeLessThan(a.scale)
    expect(b.check).toBe(0)
    expect(doneBoxAt(0.5999, timing)!.fill).toBeGreaterThan(0.99)
    expect(doneBoxAt(0.5999, timing)!.scale).toBeCloseTo(CHARGE_SCALE, 2)
  })
  it('pops: fully green, the fill becomes a ✓ that overshoots past the box and springs back', () => {
    const pop = doneBoxAt(0.6, timing)!
    expect(pop.green).toBe(1)
    let peak = 0
    for (let t = 0.6; t < 1.2; t += 0.005) peak = Math.max(peak, doneBoxAt(t, timing)!.check)
    expect(peak).toBeGreaterThan(1.6)
    expect(doneBoxAt(0.6 + 0.2, timing)!.fill).toBe(0)
    expect(doneBoxAt(0.6 + 0.65, timing)!.check).toBeCloseTo(1, 1)
    expect(doneBoxAt(0.6 + 0.65, timing)!.scale).toBeCloseTo(1, 1)
  })
  it('fades out at the end and is gone after it', () => {
    expect(doneBoxAt(1.55, timing)!.alpha).toBeLessThan(0.2)
    expect(doneBoxAt(1.6, timing)).toBeNull()
    expect(doneBoxAt(-0.01, timing)).toBeNull()
  })
  it('with no charge, starts at the pop at full size', () => {
    const b = doneBoxAt(0, { chargeS: 0, popS: 1 })!
    expect(b.scale).toBe(1)
    expect(b.green).toBe(1)
  })
})

describe('springTo1', () => {
  it('starts where it is told and settles at 1', () => {
    expect(springTo1(0.2, 35, 18, 0.4, 0)).toBe(0.2)
    expect(springTo1(0.2, 35, 18, 0.4, 2)).toBeCloseTo(1, 3)
  })
})

describe('motes', () => {
  it('rush in from outside onto the border by the end of the charge, brighter as they near it', () => {
    const motes = inflow(30, 5)
    expect(inflow(30, 5)).toEqual(motes)
    for (const m of motes) {
      expect(m.to).toBeLessThanOrEqual(1)
      const mid = (m.from + m.to) / 2
      const a = moteAt(m, m.from + 0.001, 10, 50)!
      const b = moteAt(m, m.to - 0.001, 10, 50)!
      expect(Math.hypot(a.x, a.y)).toBeGreaterThan(Math.hypot(b.x, b.y))
      expect(Math.hypot(b.x, b.y)).toBeLessThan(11)
      expect(b.alpha).toBeGreaterThan(moteAt(m, mid, 10, 50)!.alpha)
      expect(moteAt(m, m.to, 10, 50)).toBeNull()
    }
  })
})
