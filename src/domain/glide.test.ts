import { describe, expect, it } from 'vitest'
import { releaseVelocity, shouldGlide, stepGlide } from './glide.ts'

describe('glide', () => {
  const o = { windowMs: 100, stillMs: 50 }
  it('computes velocity', () => {
    expect(releaseVelocity([{ t: 0, pos: 0 }, { t: 50, pos: 25 }], 55, o)).toBeCloseTo(0.5)
  })
  it('zero when still', () => {
    expect(releaseVelocity([{ t: 0, pos: 0 }, { t: 50, pos: 25 }], 200, o)).toBe(0)
  })
  it('shouldGlide', () => {
    expect(shouldGlide(-0.5, 0.3)).toBe(true)
    expect(shouldGlide(0.1, 0.3)).toBe(false)
  })
  it('stepGlide decays and clamps', () => {
    const r = stepGlide(10, 100, 100, 2)
    expect(r.v).toBeCloseTo(2 * Math.exp(-1))
    expect(r.dPos).toBeCloseTo(200 * (1 - Math.exp(-1)))
  })
})
