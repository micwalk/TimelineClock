import { describe, expect, it } from 'vitest'
import { nestPackedSlots, nestSlots, packSlots, stableSlots } from './laneSlots.ts'

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

describe('packSlots', () => {
  const r = (lo: number, hi: number) => ({ lo, hi })

  it('puts lanes that do not overlap in time on one track (touching ends allowed)', () => {
    const ranges = { l1: r(0, 10), l2: r(10, 20), l3: r(20, 30), other: r(5, 25) }
    expect(packSlots({}, ['l1', 'l2', 'l3', 'other'], ranges)).toEqual({ l1: 0, l2: 0, l3: 0, other: 1 })
  })

  it('keeps a lane in its slot while it still fits there', () => {
    const ranges = { a: r(0, 10), b: r(20, 30), c: r(5, 25) }
    // c was on track 0 before; a and b overlap it, so they take the next track.
    expect(packSlots({ c: 0 }, ['a', 'b', 'c'], ranges)).toEqual({ c: 0, a: 1, b: 1 })
  })

  it('puts a lane that continues another (a new lap) on its track, even with a lower one free', () => {
    const ranges = { l1: r(0, 10), l2: r(10, 20), l3: r(20, 30) }
    expect(packSlots({ l1: 1, l2: 1 }, ['l1', 'l2', 'l3'], ranges)).toEqual({ l1: 1, l2: 1, l3: 1 })
  })

  it('gives a lane without a range a track of its own', () => {
    expect(packSlots({}, ['a', 'cursor', 'b'], { a: r(0, 10), b: r(20, 30), cursor: undefined })).toEqual({ a: 0, cursor: 1, b: 0 })
  })
})

describe('nestPackedSlots', () => {
  it('moves the whole run outside its laps, which keep sharing a track', () => {
    const ranges = { l1: { lo: 0, hi: 10 }, l2: { lo: 10, hi: 20 }, run: { lo: 0, hi: 20 } }
    const packed = packSlots({}, ['l1', 'l2', 'run'], ranges)
    expect(packed).toEqual({ l1: 0, l2: 0, run: 1 })
    expect(nestPackedSlots(packed, ranges)).toEqual({ l1: 1, l2: 1, run: 0 })
  })
})
