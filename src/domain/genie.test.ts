import { describe, expect, it } from 'vitest'
import { genieKeyframes, genieMs } from './genie.ts'

describe('genieKeyframes', () => {
  it('goes all the way into the box, small and gone', () => {
    const k = genieKeyframes(-200, 0, { w: 60, h: 28 }, { w: 18, h: 18 })
    expect(k[0]).toMatchObject({ offset: 0, opacity: 1 })
    expect(k[k.length - 1].transform).toContain('translate(-200.0px, 0.0px)')
    expect(k[k.length - 1].opacity).toBe(0)
    expect(k.map(f => f.offset)).toEqual([...k.map(f => f.offset)].sort((a, b) => a - b))
  })
  it('pinches across its path: thin top to bottom going sideways, side to side going up', () => {
    expect(genieKeyframes(-200, 10, { w: 60, h: 28 }, { w: 18, h: 18 })[1].transform).toContain('scale(0.85, 0.45)')
    expect(genieKeyframes(5, -200, { w: 60, h: 28 }, { w: 18, h: 18 })[1].transform).toContain('scale(0.45, 0.85)')
  })
  it('takes a little longer the farther it goes, never past the charge', () => {
    expect(genieMs(0, 50)).toBeLessThan(genieMs(0, 300))
    expect(genieMs(2000, 0)).toBeLessThanOrEqual(480)
  })
})
