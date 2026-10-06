import { describe, expect, it } from 'vitest'
import { omegaFor, springSettled, stepSpring } from './spring.ts'

describe('stepSpring', () => {
  it('moves toward the target without overshooting', () => {
    const omega = omegaFor(200)
    let s = { x: 0, v: 0 }
    let prev = 0
    for (let t = 0; t < 400; t += 16) {
      s = stepSpring(s, 100, 16, omega)
      expect(s.x).toBeGreaterThanOrEqual(prev)
      expect(s.x).toBeLessThanOrEqual(100)
      prev = s.x
    }
    expect(s.x).toBeGreaterThan(99.5)
  })

  it('covers about 95% of the way in the settle time', () => {
    const s = stepSpring({ x: 0, v: 0 }, 100, 200, omegaFor(200))
    expect(s.x).toBeGreaterThan(90)
    expect(s.x).toBeLessThan(99)
  })

  it('gives the same result for one long step as for many short ones', () => {
    const omega = omegaFor(150)
    let many = { x: 10, v: 0.3 }
    for (let k = 0; k < 10; k++) many = stepSpring(many, -40, 10, omega)
    const one = stepSpring({ x: 10, v: 0.3 }, -40, 100, omega)
    expect(one.x).toBeCloseTo(many.x, 6)
    expect(one.v).toBeCloseTo(many.v, 6)
  })

  it('keeps its velocity when the target moves mid-flight (no jolt)', () => {
    const omega = omegaFor(200)
    const s = stepSpring({ x: 0, v: 0 }, 100, 50, omega)
    const retargeted = stepSpring(s, 300, 0.001, omega)
    expect(retargeted.v).toBeCloseTo(s.v, 2)
  })

  it('ignores zero, negative or invalid steps', () => {
    const s = { x: 3, v: 1 }
    expect(stepSpring(s, 10, 0, 0.1)).toBe(s)
    expect(stepSpring(s, 10, -5, 0.1)).toBe(s)
    expect(stepSpring(s, 10, Number.NaN, 0.1)).toBe(s)
  })

  it('is settled only near the target and nearly still', () => {
    expect(springSettled({ x: 100.01, v: 0 }, 100)).toBe(true)
    expect(springSettled({ x: 100.01, v: 0.5 }, 100)).toBe(false)
    expect(springSettled({ x: 101, v: 0 }, 100)).toBe(false)
  })
})
