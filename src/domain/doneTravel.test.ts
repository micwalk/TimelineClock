import { describe, expect, it } from 'vitest'
import { TRAVEL_MAX_MS, TRAVEL_MIN_MS, WIND_UP, travelKeyframes, travelMs } from './doneTravel.ts'

describe('a todo travelling to Now', () => {
  it('takes longer the farther it goes, within bounds', () => {
    expect(travelMs(0)).toBe(TRAVEL_MIN_MS)
    expect(travelMs(400)).toBeGreaterThan(travelMs(200))
    expect(travelMs(100000)).toBe(TRAVEL_MAX_MS)
  })

  it('winds up away from Now, then lands exactly on it', () => {
    const k = travelKeyframes(300, 0)
    expect(k[0].offset).toBe(0)
    expect(k[1].offset).toBe(WIND_UP)
    expect(k[1].transform).toMatch(/^translate\(-18\.0px, -?0\.0px\)/) // pulled back, capped
    expect(k.at(-1)!.transform).toBe('translate(300.0px, 0.0px) scale(1)')
    // Up the screen in vertical: pulled down first, stretched along its way.
    const v = travelKeyframes(0, -100)
    expect(v[1].transform).toMatch(/^translate\(-?0\.0px, 6\.0px\)/)
    expect(v[2].transform).toContain('scale(0.94, 1.12)')
  })
})
