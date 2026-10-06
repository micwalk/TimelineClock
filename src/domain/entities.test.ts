import { describe, expect, it } from 'vitest'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { NOW_SENTINEL, syncFavorites } from './entities.ts'

const inst = (id: string, extra: Partial<InstantRecord> = {}): InstantRecord => ({ id, tsEpochMs: 0, label: '', ...extra })
const toNow = (id: string, startInstantId: string, visible = true): SpanRecord =>
  ({ id, startInstantId, endInstantId: NOW_SENTINEL, label: '', visible, endIsNow: true })
const between = (id: string, a: string, b: string): SpanRecord => ({ id, startInstantId: a, endInstantId: b, label: '', visible: true })

describe('syncFavorites', () => {
  it('leaves data that follows the rule alone', () => {
    const instants = [inst('a', { favorite: true }), inst('b')]
    const spans = [toNow('n', 'a'), between('s', 'a', 'b')]
    const out = syncFavorites(instants, spans)
    expect(out.instants).toBe(instants)
    expect(out.spans).toBe(spans)
  })

  it('drops a span to Now left hidden by an unfavorite, and shows a favorite’s hidden one', () => {
    const out = syncFavorites([inst('a'), inst('b', { favorite: true })], [toNow('na', 'a', false), toNow('nb', 'b', false)])
    expect(out.spans).toEqual([toNow('nb', 'b', true)])
  })

  it('unfavorites an instant an alarm favorited without a span; gives other favorites theirs', () => {
    const out = syncFavorites([inst('alarm', { favorite: true, alarm: true }), inst('fav', { favorite: true })], [])
    expect(out.instants.find(i => i.id === 'alarm')?.favorite).toBe(false)
    expect(out.spans).toHaveLength(1)
    expect(out.spans[0]).toMatchObject({ startInstantId: 'fav', endIsNow: true, visible: true })
  })

  it('keeps one span to Now per favorite', () => {
    const out = syncFavorites([inst('a', { favorite: true })], [toNow('n1', 'a'), toNow('n2', 'a')])
    expect(out.spans.map(s => s.id)).toEqual(['n1'])
  })
})
