import { describe, expect, it } from 'vitest'
import type { TrackLabel } from './labelGroups.ts'
import { groupTrackLabels } from './labelGroups.ts'

const label = (key: string, want: number, extra: Partial<TrackLabel> = {}): TrackLabel => ({ key, track: 0, want, size: 80, ...extra })
const opts = { gap: 6, groupSize: 70 }

describe('groupTrackLabels', () => {
  it('shows labels that have room where they want to be', () => {
    const r = groupTrackLabels([label('a', 0), label('b', 200)], opts)
    expect(r).toEqual({ shown: { a: 0, b: 200 }, groups: [] })
  })

  it('folds labels that would touch into one group at their mean spot', () => {
    const laps = [0, 10, 20, 30].map((x, k) => label(`lap${k}`, x))
    const r = groupTrackLabels([...laps, label('far', 500)], opts)
    expect(r.shown).toEqual({ far: 500 })
    expect(r.groups).toEqual([{ key: 'group:lap0', track: 0, members: ['lap0', 'lap1', 'lap2', 'lap3'], center: 15 }])
  })

  it('takes a neighbour into the group when the group reaches it', () => {
    // a and b touch; c (at 150) clears b, but their group (150 wide at 30) reaches it: all three fold.
    const r = groupTrackLabels([label('a', 0), label('b', 60), label('c', 150)], { gap: 6, groupSize: 150 })
    expect(r.groups.map(g => g.members)).toEqual([['a', 'b', 'c']])
  })

  it('keeps tracks apart: labels on different tracks never fold together', () => {
    const r = groupTrackLabels([label('a', 0), label('b', 0, { track: 1 })], opts)
    expect(r).toEqual({ shown: { a: 0, b: 0 }, groups: [] })
  })

  it('always shows a pinned label where it wants to be; the others move off it', () => {
    const r = groupTrackLabels([label('sel', 0, { pinned: true, size: 200 }), label('a', 30)], opts)
    expect(r.shown.sel).toBe(0)
    // Off to the nearer side: right of the pinned box (0 + 100 + 6 + 40).
    expect(r.shown.a).toBe(146)
  })

  it('folds what crowds beside a pinned label', () => {
    const r = groupTrackLabels([label('sel', 0, { pinned: true, size: 200 }), label('a', 120), label('b', 130)], opts)
    expect(r.shown.sel).toBe(0)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].members).toEqual(['a', 'b'])
    expect(r.groups[0].center - 35).toBeGreaterThanOrEqual(106)
  })
})
