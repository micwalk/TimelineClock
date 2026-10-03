import { describe, expect, it } from 'vitest'
import { releaseVelocity, shouldGlide, stepGlide } from './glide.ts'

const opts = { windowMs: 100, stillMs: 50 }

describe('releaseVelocity', () => {
  it('measures a steady drag', () => {
    const samples = [0, 16, 32, 48, 64].map(t => ({ t, pos: t * 0.5 }))
    expect(releaseVelocity(samples, 70, opts)).toBeCloseTo(0.5)
  })

  it('fits through jitter instead of trusting the last two samples', () => {
    // 1 px/ms with the final sample jittered back by 6px.
    const samples = [{ t: 0, pos: 0 }, { t: 16, pos: 16 }, { t: 32, pos: 32 }, { t: 48, pos: 48 }, { t: 64, pos: 58 }]
    const v = releaseVelocity(samples, 64, opts)
    expect(v).toBeGreaterThan(0.85)
    expect(v).toBeLessThan(1)
  })

  it('ignores samples older than the window', () => {
    const samples = [{ t: 0, pos: 1000 }, { t: 200, pos: 0 }, { t: 216, pos: 8 }, { t: 232, pos: 16 }]
    expect(releaseVelocity(samples, 232, opts)).toBeCloseTo(0.5)
  })

  it('is zero when the pointer stopped before release', () => {
    const samples = [{ t: 0, pos: 0 }, { t: 50, pos: 25 }]
    expect(releaseVelocity(samples, 101, opts)).toBe(0)
  })

  it('is zero without two samples in the window', () => {
    expect(releaseVelocity([{ t: 0, pos: 0 }], 0, opts)).toBe(0)
    expect(releaseVelocity([{ t: 0, pos: 0 }, { t: 150, pos: 10 }], 150, opts)).toBe(0)
  })
})

describe('shouldGlide', () => {
  it('needs the minimum speed in either direction', () => {
    expect(shouldGlide(-0.5, 0.3)).toBe(true)
    expect(shouldGlide(0.3, 0.3)).toBe(true)
    expect(shouldGlide(0.1, 0.3)).toBe(false)
  })
})

describe('stepGlide', () => {
  it('decays exponentially and moves by the integral of the velocity', () => {
    const r = stepGlide(1, 100, 100, 8)
    expect(r.v).toBeCloseTo(Math.exp(-1))
    expect(r.dPos).toBeCloseTo(100 * (1 - Math.exp(-1)))
  })

  it('clamps to the maximum speed, keeping the sign', () => {
    const r = stepGlide(-10, 100, 100, 2)
    expect(r.v).toBeCloseTo(-2 * Math.exp(-1))
    expect(r.dPos).toBeCloseTo(-200 * (1 - Math.exp(-1)))
  })

  it('is frame-rate independent', () => {
    const one = stepGlide(1, 32, 325, 8)
    const a = stepGlide(1, 16, 325, 8)
    const b = stepGlide(a.v, 16, 325, 8)
    expect(b.v).toBeCloseTo(one.v)
    expect(a.dPos + b.dPos).toBeCloseTo(one.dPos)
  })
})
