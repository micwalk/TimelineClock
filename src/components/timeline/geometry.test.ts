import { describe, expect, it } from 'vitest'
import { GEOMETRY, GEOMETRY_VERTICAL, geometryStyle, geometryStyleFor, lanesTop } from './geometry.ts'

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

  it('has a vertical set, written as px custom properties', () => {
    const style = geometryStyleFor('vertical')
    expect(style).toMatchObject({ '--tl-axis': '84px', '--tl-tag-arrow': '14px', '--tl-chip-start': '96px', '--tl-lane-gap': '18px', '--tl-tag-slot-v': '64px' })
    expect(Object.keys(style)).toHaveLength(Object.keys(GEOMETRY_VERTICAL).length)
    expect(geometryStyleFor('horizontal')).toBe(geometryStyle)
  })
})
