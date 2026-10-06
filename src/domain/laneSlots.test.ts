import { describe, expect, it } from 'vitest'
import { packSlots, stableSlots } from './laneSlots.ts'

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

describe('packSlots', () => {
  const r = (lo: number, hi: number) => ({ lo, hi })

  it('puts lanes that do not overlap in time on one track (touching ends allowed)', () => {
    const ranges = { l1: r(0, 10), l2: r(10, 20), l3: r(20, 30), other: r(5, 15) }
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

describe('packSlots nesting', () => {
  it('puts the whole run outside its laps, which share a track', () => {
    const ranges = { l1: { lo: 0, hi: 10 }, l2: { lo: 10, hi: 20 }, run: { lo: 0, hi: 20 } }
    expect(packSlots({}, ['l1', 'l2', 'run'], ranges)).toEqual({ run: 0, l1: 1, l2: 1 })
  })

  it('moves what a newcomer contains outward of it, keeping everything else', () => {
    const ranges = { a: { lo: 0, hi: 10 }, b: { lo: 20, hi: 30 }, run: { lo: 0, hi: 12 } }
    // a and b were on track 0; the run (containing a) arrives: it goes outside, a moves past it.
    expect(packSlots({ a: 0, b: 0 }, ['a', 'b', 'run'], ranges)).toEqual({ run: 0, a: 1, b: 0 })
  })

  it('leaves lanes that do not nest alone, and lanes without a range', () => {
    const slots = { a: 1, b: 0, cursor: 2 }
    expect(packSlots(slots, ['a', 'b', 'cursor'], { a: { lo: 0, hi: 10 }, b: { lo: 5, hi: 20 }, cursor: undefined })).toEqual(slots)
  })

  it('stays fast with many overlapping spans', () => {
    const keys = Array.from({ length: 300 }, (_, k) => `s${k}`)
    const ranges = Object.fromEntries(keys.map((k, i) => [k, { lo: (i * 37) % 500, hi: ((i * 37) % 500) + 20 + (i % 90) }]))
    const t = performance.now()
    const out = packSlots({}, keys, ranges)
    expect(performance.now() - t).toBeLessThan(200)
    // Nothing on a track overlaps, and every container is outside what it contains.
    for (const a of keys) for (const b of keys) {
      if (a === b) continue
      const ra = ranges[a], rb = ranges[b]
      if (out[a] === out[b]) expect(ra.lo < rb.hi && rb.lo < ra.hi).toBe(false)
      if (ra.lo <= rb.lo && ra.hi >= rb.hi && ra.hi - ra.lo > rb.hi - rb.lo) expect(out[a]).toBeLessThan(out[b])
    }
  })
})
