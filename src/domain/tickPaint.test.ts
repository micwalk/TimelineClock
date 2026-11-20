import { describe, expect, it } from 'vitest'
import { tickLabelBox, tickLineBox } from './tickPaint.ts'

describe('tickLineBox', () => {
  it('crosses the axis, 1px wide', () => {
    expect(tickLineBox('horizontal', 100, 150, 6)).toEqual({ x: 99.5, y: 144, w: 1, h: 12 })
    expect(tickLineBox('vertical', 100, 140, 6)).toEqual({ x: 134, y: 99.5, w: 12, h: 1 })
  })
})

describe('tickLabelBox', () => {
  it('horizontal: centered above the line, 7px clear of its end', () => {
    // 40px of text, 12px font: a 48 × 16 pill whose bottom is at 150 - 6 - 7.
    expect(tickLabelBox('horizontal', 100, 150, 6, 40, 12)).toEqual({ x: 76, y: 121, w: 48, h: 16 })
  })

  it('vertical: left of the line, its right edge 7px clear, centered on it', () => {
    expect(tickLabelBox('vertical', 100, 140, 6, 40, 12)).toEqual({ x: 79, y: 92, w: 48, h: 16 })
  })
})
