import { describe, expect, it } from 'vitest'
import { stableSlots } from './laneSlots.ts'

describe('stableSlots', () => {
  it('numbers new lanes in order', () => {
    expect(stableSlots({}, ['a', 'b', 'c'])).toEqual({ a: 0, b: 1, c: 2 })
  })

  it('keeps lanes in their slots when a more important one arrives', () => {
    // 'x' comes first in priority order but takes the free slot; a and b don't move.
    expect(stableSlots({ a: 0, b: 1 }, ['x', 'a', 'b'])).toEqual({ x: 2, a: 0, b: 1 })
  })

  it('leaves a gap when a lane leaves, and fills it with the next newcomer', () => {
    const afterLeave = stableSlots({ a: 0, b: 1, c: 2 }, ['a', 'c'])
    expect(afterLeave).toEqual({ a: 0, c: 2 })
    expect(stableSlots(afterLeave, ['a', 'c', 'd'])).toEqual({ a: 0, c: 2, d: 1 })
  })

  it('starts over once every lane is gone', () => {
    expect(stableSlots(stableSlots({ a: 3 }, []), ['b'])).toEqual({ b: 0 })
  })
})
