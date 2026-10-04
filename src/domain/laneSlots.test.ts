import { describe, expect, it } from 'vitest'
import { nestSlots, stableSlots } from './laneSlots.ts'

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

describe('nestSlots', () => {
  it('moves a span that contains others outward, swapping with what it contains', () => {
    // Laps 1–3 placed first (slots 0–2); the whole run arrives last at slot 3.
    const slots = { l1: 0, l2: 1, l3: 2, run: 3 }
    const ranges = { l1: { lo: 0, hi: 10 }, l2: { lo: 10, hi: 20 }, l3: { lo: 20, hi: 30 }, run: { lo: 0, hi: 30 } }
    const out = nestSlots(slots, ranges)
    expect(out.run).toBe(0)
    expect(new Set(Object.values(out))).toEqual(new Set([0, 1, 2, 3]))
  })

  it('leaves lanes that do not nest alone', () => {
    const slots = { a: 1, b: 0 }
    expect(nestSlots(slots, { a: { lo: 0, hi: 10 }, b: { lo: 5, hi: 20 } })).toEqual(slots)
  })

  it('keeps an already-nested order and ignores lanes without a range', () => {
    const slots = { run: 0, lap: 1, cursor: 2 }
    expect(nestSlots(slots, { run: { lo: 0, hi: 30 }, lap: { lo: 0, hi: 10 }, cursor: undefined })).toEqual(slots)
  })
})
