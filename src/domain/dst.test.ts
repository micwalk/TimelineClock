import { describe, expect, it } from 'vitest'
import { LABELS } from '../config/labels.ts'
import { addCalendarDays, describeShift, dstShifts, dstVirtualId, isAtDstShift, isDstShiftAt, nearDstShift, parseDstVirtualId, utcOffsetMin, virtualDstShifts, zoneAbbrev } from './dst.ts'
import { formatContext } from './tickContext.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

// An explicit zone, so these hold wherever the tests run (Netlify builds in UTC).
const LA = 'America/Los_Angeles'
const FALL_BACK = Date.parse('2026-11-01T09:00:00Z') // 2:00 AM PDT becomes 1:00 AM PST
const SPRING_FORWARD = Date.parse('2026-03-08T10:00:00Z') // 2:00 AM PST becomes 3:00 AM PDT

describe('offsets and names', () => {
  it('reads the zone\'s offset and short name on either side of a change', () => {
    expect(utcOffsetMin(Date.parse('2026-07-01T12:00:00Z'), LA)).toBe(-420)
    expect(utcOffsetMin(Date.parse('2026-01-01T12:00:00Z'), LA)).toBe(-480)
    expect(zoneAbbrev(FALL_BACK - MINUTE, LA)).toBe('PDT')
    expect(zoneAbbrev(FALL_BACK, LA)).toBe('PST')
    expect(utcOffsetMin(Date.parse('2026-07-01T12:00:00Z'), 'UTC')).toBe(0)
  })
})

describe('dstShifts', () => {
  it('finds both changes in a year, to the minute', () => {
    const year = dstShifts(Date.parse('2026-01-01T00:00:00Z'), Date.parse('2027-01-01T00:00:00Z'), LA)
    expect(year).toEqual([
      { ts: SPRING_FORWARD, before: -480, after: -420 },
      { ts: FALL_BACK, before: -420, after: -480 },
    ])
    expect(dstShifts(Date.parse('2026-01-01T00:00:00Z'), Date.parse('2027-01-01T00:00:00Z'), 'UTC')).toEqual([])
  })
  it('says whether DST ends or begins', () => {
    expect(describeShift({ ts: FALL_BACK, before: -420, after: -480 })).toBe(LABELS.dstEnds)
    expect(describeShift({ ts: SPRING_FORWARD, before: -480, after: -420 })).toBe(LABELS.dstBegins)
  })
  it('knows when a change is near, or exactly now', () => {
    expect(nearDstShift(FALL_BACK - HOUR, 3 * HOUR, LA)).toBe(true)
    expect(nearDstShift(FALL_BACK - DAY, 3 * HOUR, LA)).toBe(false)
    expect(isDstShiftAt(FALL_BACK, LA)).toBe(true)
    expect(isDstShiftAt(FALL_BACK + HOUR, LA)).toBe(false)
  })
})

describe('the header names the zone around a change, so the hour that happens twice reads apart', () => {
  it('1 AM PDT, then 1 AM PST', () => {
    const now = FALL_BACK
    const first = formatContext(FALL_BACK - HOUR, 'hour', now, LA) // 1:00 AM PDT
    const second = formatContext(FALL_BACK, 'hour', now, LA) // 1:00 AM PST
    expect(first).toMatch(/1 AM PDT$/)
    expect(second).toMatch(/1 AM PST$/)
    expect(formatContext(FALL_BACK + 12 * HOUR, 'hour', now, LA)).not.toMatch(/PST/)
  })
})

describe('clock changes as virtual instants', () => {
  it('one per change, named, with an id that says what it is; a kept one leaves the computed one out', () => {
    const list = virtualDstShifts([], FALL_BACK - DAY, FALL_BACK + DAY, LA)
    expect(list).toEqual([{ id: dstVirtualId(FALL_BACK), tsEpochMs: FALL_BACK, label: LABELS.dstEnds, virtual: true }])
    expect(parseDstVirtualId(list[0].id)).toBe(FALL_BACK)
    expect(isAtDstShift(list[0], LA)).toBe(true)
    expect(isAtDstShift({ id: 'abc', tsEpochMs: FALL_BACK }, LA)).toBe(false)
    const kept = { ...list[0], virtual: undefined, label: 'Extra sleep' }
    expect(virtualDstShifts([kept], FALL_BACK - DAY, FALL_BACK + DAY, LA)).toEqual([])
  })
})

it('addCalendarDays keeps the clock time (a day across a change is 23 or 25 hours)', () => {
  const t = new Date(2026, 9, 31, 9, 30).getTime()
  const next = new Date(addCalendarDays(t, 1))
  expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([1, 9, 30])
  const back = new Date(addCalendarDays(t, -7))
  expect([back.getDate(), back.getHours()]).toEqual([24, 9])
})
