import { describe, expect, it } from 'vitest'
import type { RhythmMember } from './rhythm.ts'
import { planRhythm } from './rhythm.ts'

const DAY = 86_400_000
const now = 10 * DAY
/** One occurrence a day, `px` apart on screen. */
const daily = (seriesId: string, n: number, px: number, keep: number[] = []): RhythmMember[] =>
  Array.from({ length: n }, (_, k) => ({ id: `${seriesId}${k}`, seriesId, pos: k * px, ts: (8 + k) * DAY, keep: keep.includes(k) }))

describe('planRhythm', () => {
  it('collapses a crowded series into ticks and one summary at the next occurrence', () => {
    const plan = planRhythm(daily('g', 6, 20), { now, gapPx: () => 56 })
    expect(Object.keys(plan.collapsed)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4', 'g5'])
    expect(plan.summaries).toEqual([{ seriesId: 'g', anchorId: 'g2', anchorTs: 10 * DAY, count: 6, nextTs: 11 * DAY }])
  })

  it('leaves a series with room for its chips, or too few on screen, alone', () => {
    expect(planRhythm(daily('g', 6, 80), { now, gapPx: () => 56 }).summaries).toEqual([])
    expect(planRhythm(daily('g', 2, 5), { now, gapPx: () => 56 }).summaries).toEqual([])
  })

  it('keeps exceptions as chips, and anchors on the latest when none is ahead', () => {
    const plan = planRhythm(daily('g', 4, 10, [1]), { now: 100 * DAY, gapPx: () => 56 })
    expect(plan.collapsed).toEqual({ g0: 'g', g2: 'g', g3: 'g' })
    expect(plan.summaries[0]).toMatchObject({ anchorId: 'g3', count: 3, nextTs: null })
  })

  it('sits on screen: at the first occurrence ahead that is on screen', () => {
    const plan = planRhythm(daily('g', 10, 20), { now, gapPx: () => 56, view: { lo: 90, hi: 400 } })
    expect(plan.summaries[0].anchorId).toBe('g5') // g2 (the next ahead) is off screen at 40px
  })

  it('keeps summaries apart along time when it can', () => {
    const a = daily('a', 6, 20)
    const b = daily('b', 6, 20).map(m => ({ ...m, pos: m.pos + 5, ts: m.ts + 1000 }))
    const plan = planRhythm([...a, ...b], { now, gapPx: () => 56, spacing: 34 })
    expect(plan.summaries.map(s => s.anchorId)).toEqual(['a2', 'b4']) // b2 is only 5px from a2; b3 25px
  })

  it('needs at least two to fold besides the exceptions', () => {
    expect(planRhythm(daily('g', 3, 10, [0, 1]), { now, gapPx: () => 56 }).summaries).toEqual([])
  })
})
