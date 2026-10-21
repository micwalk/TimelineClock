import { describe, expect, it } from 'vitest'
import {
  SUN_GROUP, defaultVisibility, describeVisibility, markFade, recurringGroupOf, sanitizeGroupVisibility,
  sanitizeVisibility, setThreshold, stageAt, valueAtPosition, valuePosition, zoomPosition,
} from './displayGroups.ts'
import { DAY, HOUR } from './time.ts'

describe('stageAt', () => {
  it('Label up to `label`, Mark up to `mark`, Hidden past it', () => {
    const v = { label: 'day', mark: 'week' } as const
    expect(stageAt(v, 6 * HOUR)).toBe('label')
    expect(stageAt(v, DAY)).toBe('label')
    expect(stageAt(v, 3 * DAY)).toBe('mark')
    expect(stageAt(v, 10 * DAY)).toBe('hidden')
    expect(stageAt({ label: 'always', mark: 'always' }, 30 * DAY)).toBe('label')
    expect(stageAt({ label: 'week', mark: 'year' }, 200 * DAY)).toBe('mark')
    expect(stageAt({ label: 'week', mark: 'quarter' }, 200 * DAY)).toBe('hidden')
  })
  it('a mark fades out over the last stretch before Hidden, never when never Hidden', () => {
    const v = { label: 'day', mark: 'week' } as const
    expect(markFade(v, 3 * DAY)).toBe(1)
    expect(markFade(v, 6 * DAY)).toBeGreaterThan(0)
    expect(markFade(v, 6 * DAY)).toBeLessThan(1)
    expect(markFade(v, 7 * DAY)).toBe(0)
    expect(markFade({ label: 'day', mark: 'always' }, 30 * DAY)).toBe(1)
  })
})

it('defaults: repeats and the sun Label to 3 days; Marks to 10 years (the sun to a week)', () => {
  expect(defaultVisibility('g_abc')).toEqual({ label: '3d', mark: 'decade' })
  expect(defaultVisibility(SUN_GROUP)).toEqual({ label: '3d', mark: 'week' })
})

it('an old Unnamed group setting is dropped', () => {
  expect(sanitizeGroupVisibility({ unnamed: { label: 'day', mark: 'decade' }, sun: { label: 'week', mark: 'year' } })).toEqual({ sun: { label: 'week', mark: 'year' } })
})

it('recurringGroupOf: a series or the computed sun, never a one-off (named or not)', () => {
  expect(recurringGroupOf({ id: 'a', tsEpochMs: 0, label: '', seriesId: 'g1' })).toBe('g1')
  expect(recurringGroupOf({ id: 'a', tsEpochMs: 0, label: 'Sunset', virtual: true, sun: { event: 'sunset', lat: 0, lon: 0 } })).toBe(SUN_GROUP)
  expect(recurringGroupOf({ id: 'a', tsEpochMs: 0, label: '' })).toBeNull()
  expect(recurringGroupOf({ id: 'a', tsEpochMs: 0, label: 'Tea' })).toBeNull()
})

describe('the strip', () => {
  it('places zooms on the ladder (log between stops)', () => {
    expect(zoomPosition(HOUR)).toBe(0)
    expect(zoomPosition(DAY)).toBe(2)
    expect(zoomPosition(30 * DAY)).toBe(5)
    expect(zoomPosition(365 * DAY)).toBe(7)
  })
  it('a handle dragged past the other pushes it', () => {
    expect(setThreshold({ label: 'day', mark: 'week' }, 'label', 'month')).toEqual({ label: 'month', mark: 'month' })
    expect(setThreshold({ label: 'day', mark: 'week' }, 'mark', 'hour')).toEqual({ label: 'hour', mark: 'hour' })
  })
  it('snapping off: a spot between stops is a time on the log scale; past half the last gap, ∞', () => {
    expect(valueAtPosition(2, true)).toBe('day')
    expect(valueAtPosition(2.5, false)).toBe(Math.round(DAY * Math.sqrt(3)))
    expect(valueAtPosition(2.5, true)).toBe('3d')
    expect(valueAtPosition(9.7, false)).toBe('always')
    expect(valuePosition(Math.round(DAY * Math.sqrt(3)))).toBeCloseTo(2.5, 5)
  })
})

it('describeVisibility reads the same for instants and groups: Label, Mark, Hidden', () => {
  expect(describeVisibility({ label: 'day', mark: 'always' })).toBe('Label up to a day, Mark beyond, never Hidden')
  expect(describeVisibility({ label: 'day', mark: 'week' })).toBe('Label up to a day, Mark up to a week, Hidden beyond')
  expect(describeVisibility({ label: 'day', mark: 'day' })).toBe('Label up to a day, Hidden beyond')
  expect(describeVisibility({ label: 'always', mark: 'always' })).toBe('Label at any zoom')
  expect(describeVisibility({ label: 2 * DAY + 3 * HOUR, mark: 'always' })).toBe('Label up to 2d 3h, Mark beyond, never Hidden')
  expect(describeVisibility({ label: DAY, mark: 'always' })).toBe('Label up to a day, Mark beyond, never Hidden')
})

it('sanitizing drops junk, puts label before mark, and reads the old { full, mini }', () => {
  expect(sanitizeGroupVisibility({ a: { label: 'day', mark: 'week' }, b: { label: 'soon', mark: 'week' }, c: { label: 'week', mark: 'day' }, d: 3 }))
    .toEqual({ a: { label: 'day', mark: 'week' }, c: { label: 'day', mark: 'day' } })
  expect(sanitizeVisibility({ full: 'day', mini: 'always' })).toEqual({ label: 'day', mark: 'always' })
  expect(sanitizeVisibility({ label: 5000, mark: 'day' })).toEqual({ label: 5000, mark: 'day' })
})
