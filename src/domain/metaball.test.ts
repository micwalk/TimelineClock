import { describe, expect, it } from 'vitest'
import { NECK_REACH, circlePath, metaballNeck } from './metaball.ts'

const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('metaballNeck', () => {
  it('joins two nearby circles with a closed path between them', () => {
    const d = metaballNeck({ x: 0, y: 0 }, 10, { x: 25, y: 0 }, 8)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    // Every point stays within the two circles' reach.
    for (const v of nums(d)) expect(Math.abs(v)).toBeLessThan(50)
  })

  it('snaps (no neck) once the circles are too far apart', () => {
    expect(metaballNeck({ x: 0, y: 0 }, 10, { x: 10 + 8 * NECK_REACH + 1, y: 0 }, 8)).toBe('')
  })

  it('has no neck when one circle is inside the other', () => {
    expect(metaballNeck({ x: 0, y: 0 }, 3, { x: 1, y: 0 }, 10)).toBe('')
  })

  it('is symmetric about the line between the centers', () => {
    const d = nums(metaballNeck({ x: 0, y: 0 }, 10, { x: 24, y: 0 }, 10))
    // p1 (first point) mirrors p2 (last point before Z) across the x axis.
    const [p1x, p1y] = d
    const [p2x, p2y] = d.slice(-2)
    expect(p1x).toBeCloseTo(p2x, 1)
    expect(p1y).toBeCloseTo(-p2y, 1)
  })
})

describe('circlePath', () => {
  it('draws a circle as two arcs, or nothing for a zero radius', () => {
    expect(circlePath({ x: 5, y: 5 }, 2)).toBe('M 3.00 5.00 a 2.00 2.00 0 1 0 4.00 0 a 2.00 2.00 0 1 0 -4.00 0 Z')
    expect(circlePath({ x: 5, y: 5 }, 0)).toBe('')
  })
})
