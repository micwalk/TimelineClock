import { describe, expect, it } from 'vitest'
import { MARK_FACTOR, MIN_MARK_MS, autoReach, instantVisibility, longestSpans, reachVisibility } from './reach.ts'
import { stageAt } from './displayGroups.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

const now = 1_000_000_000_000

describe('autoReach', () => {
  it('4x how far ahead it was made, at least 3 days', () => {
    const r = (lead: number) => autoReach({ tsEpochMs: now + lead, createdAt: now }, { now, countdown: false, longestSpanMs: 0 })
    expect(r(30 * MINUTE)).toBe(3 * DAY)
    expect(r(DAY)).toBe(4 * DAY)
    expect(r(3 * DAY)).toBe(12 * DAY)
    // Made before creation times were kept.
    expect(autoReach({ tsEpochMs: now }, { now, countdown: false, longestSpanMs: 0 })).toBe(3 * DAY)
  })
  it('a countdown reaches 8x its distance from Now; a span 8x its length', () => {
    expect(autoReach({ tsEpochMs: now + 70 * DAY }, { now, countdown: true, longestSpanMs: 0 })).toBe(560 * DAY)
    expect(autoReach({ tsEpochMs: now }, { now, countdown: false, longestSpanMs: 4 * 365 * DAY })).toBe(32 * 365 * DAY)
  })
})

it('a reach gives a Label out to it, a Mark out to 8x and at least 10 years, then Hidden', () => {
  const v = reachVisibility(3 * DAY)
  expect(stageAt(v, 6 * HOUR)).toBe('label')
  expect(stageAt(v, 10 * DAY)).toBe('mark')
  expect(stageAt(v, 9 * 365 * DAY)).toBe('mark')
  expect(stageAt(v, MIN_MARK_MS + 1)).toBe('hidden')
  expect(reachVisibility(10 * 365 * DAY).mark).toBe(MARK_FACTOR * 10 * 365 * DAY)
})

it('a repeat\'s occurrence is always its series\', even with a visibility of its own', () => {
  const group = { label: 'day', mark: 'week' } as const
  expect(instantVisibility({ id: 'a', tsEpochMs: now, label: 'Wake', seriesId: 'g1', visibility: { label: 'always', mark: 'always' } }, { now, countdown: false, longestSpanMs: 0, group })).toBe(group)
})

it('instantVisibility: its own, else its group, else its reach', () => {
  const o = { now, countdown: false, longestSpanMs: 0 }
  const own = { label: 'year', mark: 'always' } as const
  const group = { label: 'day', mark: 'always' } as const
  expect(instantVisibility({ id: 'a', tsEpochMs: now, label: '', visibility: own }, { ...o, group })).toBe(own)
  expect(instantVisibility({ id: 'a', tsEpochMs: now, label: '' }, { ...o, group })).toBe(group)
  expect(instantVisibility({ id: 'a', tsEpochMs: now, label: 'Tea' }, { ...o, group: null })).toEqual(reachVisibility(3 * DAY))
})

it('longestSpans takes each instant\'s longest span, not spans to Now', () => {
  const ts: Record<string, number> = { a: 0, b: DAY, c: 3 * DAY }
  const m = longestSpans([
    { startInstantId: 'a', endInstantId: 'b' },
    { startInstantId: 'a', endInstantId: 'c' },
    { startInstantId: 'b', endInstantId: '__NOW__', endIsNow: true },
  ], id => ts[id])
  expect(m.get('a')).toBe(3 * DAY)
  expect(m.get('b')).toBe(DAY)
  expect(m.get('c')).toBe(3 * DAY)
})
