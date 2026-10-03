import { describe, expect, it } from 'vitest'
import { GEOMETRY, geometryStyle, lanesTop } from './geometry.ts'

describe('timeline geometry', () => {
  it('exposes every value as a px custom property', () => {
    expect(geometryStyle).toMatchObject({ '--tl-axis': `${GEOMETRY.axis}px` })
    expect(Object.keys(geometryStyle)).toHaveLength(Object.keys(GEOMETRY).length)
    for (const value of Object.values(geometryStyle)) expect(value).toMatch(/^\d+(\.\d+)?px$/)
  })

  it('starts lanes below the chip rows actually used', () => {
    expect(lanesTop(1)).toBe(GEOMETRY.chipTop + GEOMETRY.chipRow + 14)
    expect(lanesTop(3)).toBe(GEOMETRY.chipTop + 3 * GEOMETRY.chipRow + 14)
  })

  it('never reserves less than one row', () => {
    expect(lanesTop(0)).toBe(lanesTop(1))
  })
})
