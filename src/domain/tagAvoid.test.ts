import { describe, expect, it } from 'vitest'
import { LIFT_CREST, LIFT_RAMP, TAG_GAP, cursorLift, cursorPush, smoothMax } from './tagAvoid.ts'

const now = { main: 120, cross: 50 }
const cursor = { main: 130, cross: 52 }
const touch = (now.main + cursor.main) / 2 + TAG_GAP // 131

describe('cursorLift (horizontal)', () => {
  it('is zero far from Now and clear of Now’s box wherever the boxes would overlap', () => {
    expect(cursorLift(touch + LIFT_RAMP + 1, now, cursor)).toBe(0)
    expect(cursorLift(-(touch + LIFT_RAMP + 50), now, cursor)).toBe(0)
    for (const d of [0, 20, 60, 100, touch]) expect(cursorLift(d, now, cursor)).toBeGreaterThanOrEqual(now.cross + TAG_GAP)
  })

  it('crests over Now’s line and is symmetric', () => {
    expect(cursorLift(0, now, cursor)).toBeCloseTo(now.cross + TAG_GAP + LIFT_CREST)
    expect(cursorLift(-40, now, cursor)).toBeCloseTo(cursorLift(40, now, cursor))
  })

  it('moves smoothly with the pan: no step anywhere', () => {
    let prev = cursorLift(-300, now, cursor)
    for (let d = -300; d <= 300; d += 0.5) {
      const y = cursorLift(d, now, cursor)
      expect(Math.abs(y - prev)).toBeLessThan(1.2)
      prev = y
    }
  })
})

describe('cursorPush (vertical)', () => {
  const clear = (now.main + cursor.main) / 2 + TAG_GAP
  it('is zero far away and keeps the boxes apart as they meet, away from Now', () => {
    expect(cursorPush(clear + 30, now, cursor)).toBe(0)
    expect(cursorPush(40, now, cursor)).toBeGreaterThanOrEqual(clear - 40)
    expect(cursorPush(-40, now, cursor)).toBeLessThanOrEqual(-(clear - 40))
  })

  it('is continuous except where the cursor crosses Now’s line', () => {
    let prev = cursorPush(300, now, cursor)
    for (let d = 300; d > 0; d -= 0.5) {
      const y = cursorPush(d, now, cursor)
      expect(Math.abs(y - prev)).toBeLessThan(0.6)
      prev = y
    }
    expect(Math.sign(cursorPush(0.5, now, cursor))).toBe(1)
    expect(Math.sign(cursorPush(-0.5, now, cursor))).toBe(-1)
  })
})

describe('smoothMax', () => {
  it('is max far apart and rounded close', () => {
    expect(smoothMax(0, 30, 10)).toBe(30)
    expect(smoothMax(0, -30, 10)).toBe(0)
    expect(smoothMax(0, 0, 10)).toBeCloseTo(2.5)
  })
})
