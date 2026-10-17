import { describe, expect, it } from 'vitest'
import {
  SUN_GROUP, UNNAMED_GROUP, defaultDisplay, describeDisplay, displayFade, displayGroupOf, displayLevel, gatherHere, hideHere,
  sanitizeGroupDisplay, setThreshold, showChipsHere, zoomPosition,
} from './displayGroups.ts'
import { DAY, HOUR } from './time.ts'

describe('displayLevel', () => {
  it('chips up to `full`, gathered up to `mini`, hidden past it', () => {
    const d = { full: 'day', mini: 'week' } as const
    expect(displayLevel(d, 6 * HOUR)).toBe('full')
    expect(displayLevel(d, DAY)).toBe('full')
    expect(displayLevel(d, 3 * DAY)).toBe('mini')
    expect(displayLevel(d, 10 * DAY)).toBe('hidden')
    expect(displayLevel({ full: 'always', mini: 'always' }, 30 * DAY)).toBe('full')
  })
  it('fades out over the last stretch before hidden, and never when never hidden', () => {
    const d = { full: 'day', mini: 'week' } as const
    expect(displayFade(d, 3 * DAY)).toBe(1)
    expect(displayFade(d, 6 * DAY)).toBeGreaterThan(0)
    expect(displayFade(d, 6 * DAY)).toBeLessThan(1)
    expect(displayFade(d, 7 * DAY)).toBe(0)
    expect(displayFade(defaultDisplay(UNNAMED_GROUP), 30 * DAY)).toBe(1)
  })
})

describe('defaults', () => {
  it('repeats as before, the sun gone past a week, unnamed gathered past a day and never hidden', () => {
    expect(defaultDisplay('g_abc')).toEqual({ full: 'always', mini: 'always' })
    expect(defaultDisplay(SUN_GROUP)).toEqual({ full: 'week', mini: 'week' })
    expect(defaultDisplay(UNNAMED_GROUP)).toEqual({ full: 'day', mini: 'always' })
  })
})

describe('displayGroupOf', () => {
  const base = { id: 'a', tsEpochMs: 0, label: '' }
  it('a series first, then computed sun times, then unnamed (not starred or at the sun)', () => {
    expect(displayGroupOf({ ...base, seriesId: 'g1' })).toBe('g1')
    expect(displayGroupOf({ ...base, label: 'Sunset', virtual: true, sun: { event: 'sunset', lat: 0, lon: 0 } })).toBe(SUN_GROUP)
    expect(displayGroupOf(base)).toBe(UNNAMED_GROUP)
    expect(displayGroupOf({ ...base, favorite: true })).toBeNull()
    expect(displayGroupOf({ ...base, label: 'Rice' })).toBeNull()
  })
})

describe('setting thresholds from where you are', () => {
  it('places the zoom on the ladder (log between stops)', () => {
    expect(zoomPosition(HOUR)).toBe(0)
    expect(zoomPosition(DAY)).toBe(2)
    expect(zoomPosition(2 * DAY)).toBeGreaterThan(2)
    expect(zoomPosition(2 * DAY)).toBeLessThan(3)
    expect(zoomPosition(30 * DAY)).toBe(5)
    expect(zoomPosition(91 * DAY)).toBe(6)
    expect(zoomPosition(365 * DAY)).toBe(7)
    expect(displayLevel({ full: 'week', mini: 'year' }, 200 * DAY)).toBe('mini')
    expect(displayLevel({ full: 'week', mini: 'quarter' }, 200 * DAY)).toBe('hidden')
  })
  it('chips here: full reaches this zoom, and mini with it', () => {
    expect(showChipsHere({ full: 'hour', mini: 'day' }, 2 * DAY)).toEqual({ full: '3d', mini: '3d' })
  })
  it('gathered here: chips only closer in, hidden only further out', () => {
    expect(gatherHere({ full: 'always', mini: 'always' }, 2 * DAY)).toEqual({ full: 'day', mini: 'always' })
    expect(gatherHere({ full: 'hour', mini: 'day' }, 2 * DAY)).toEqual({ full: 'hour', mini: '3d' })
  })
  it('hidden here and further out', () => {
    expect(hideHere({ full: 'always', mini: 'always' }, 10 * DAY)).toEqual({ full: 'week', mini: 'week' })
    expect(hideHere({ full: 'day', mini: 'always' }, 10 * DAY)).toEqual({ full: 'day', mini: 'week' })
  })
  it('a threshold dragged past the other pushes it', () => {
    expect(setThreshold({ full: 'day', mini: 'week' }, 'full', 'month')).toEqual({ full: 'month', mini: 'month' })
    expect(setThreshold({ full: 'day', mini: 'week' }, 'mini', 'hour')).toEqual({ full: 'hour', mini: 'hour' })
  })
})

it('describeDisplay reads plainly', () => {
  expect(describeDisplay({ full: 'day', mini: 'always' })).toBe('Chips up to a day, gathered beyond, never hidden')
  expect(describeDisplay({ full: 'day', mini: 'week' })).toBe('Chips up to a day, gathered up to a week, hidden beyond')
  expect(describeDisplay({ full: 'day', mini: 'day' })).toBe('Chips up to a day, hidden beyond')
})

it('sanitizeGroupDisplay drops junk and puts full before mini', () => {
  expect(sanitizeGroupDisplay({ a: { full: 'day', mini: 'week' }, b: { full: 'soon', mini: 'week' }, c: { full: 'week', mini: 'day' }, d: 3 }))
    .toEqual({ a: { full: 'day', mini: 'week' }, c: { full: 'day', mini: 'day' } })
})
