import { chipName, showsSeconds } from './format.ts'
import { describe, expect, it } from 'vitest'
import {
  atClockTimeOnDay, durationShowsMillis, formatClock12h, formatDateRange, formatDurationCoarse, formatDurationForInput, formatDurationHMS,
  formatRelativeCoarse, formatSignedDuration, parseDurationInput, to24h,
} from './format.ts'
import { DAY, HOUR, MINUTE, SECOND } from './time.ts'

const at = (h: number, m: number, s: number) => new Date(2026, 9, 2, h, m, s).getTime()

describe('formatClock12h', () => {
  it('formats morning, noon, afternoon and midnight', () => {
    expect(formatClock12h(at(9, 5, 7))).toBe('09:05:07 AM')
    expect(formatClock12h(at(12, 0, 0))).toBe('12:00:00 PM')
    expect(formatClock12h(at(16, 30, 59))).toBe('04:30:59 PM')
    expect(formatClock12h(at(0, 1, 2))).toBe('12:01:02 AM')
  })
})

describe('formatDurationHMS', () => {
  it('shows milliseconds under a minute', () => {
    expect(formatDurationHMS(5 * SECOND + 42)).toBe('00:05.042')
    expect(durationShowsMillis(59 * SECOND)).toBe(true)
    expect(durationShowsMillis(-59 * SECOND)).toBe(true)
    expect(durationShowsMillis(MINUTE)).toBe(false)
  })
  it('drops to mm:ss, hh:mm:ss and days as it grows', () => {
    expect(formatDurationHMS(3 * MINUTE + 4 * SECOND)).toBe('03:04')
    expect(formatDurationHMS(2 * HOUR + 3 * MINUTE)).toBe('02:03:00')
    expect(formatDurationHMS(DAY + HOUR)).toBe('1 day, 01:00:00')
    expect(formatDurationHMS(3 * DAY)).toBe('3 days, 00:00:00')
  })
  it('treats negative input as zero', () => {
    expect(formatDurationHMS(-5000)).toBe('00:00.000')
  })
})

describe('signed and coarse durations', () => {
  it('prefixes a sign', () => {
    expect(formatSignedDuration(-90 * SECOND)).toBe('-01:30')
    expect(formatSignedDuration(90 * SECOND)).toBe('+01:30')
  })
  it('never shows milliseconds in coarse format', () => {
    expect(formatDurationCoarse(5_500)).toBe('00:05')
    expect(formatRelativeCoarse(-2 * HOUR)).toBe('-02:00:00')
    expect(formatRelativeCoarse(DAY + 5 * SECOND)).toBe('+1 day, 00:00:05')
  })
})

describe('duration entry', () => {
  it('round-trips through the input format', () => {
    const ms = -(26 * HOUR + 3 * MINUTE + 9 * SECOND)
    expect(formatDurationForInput(ms)).toBe('-26:03:09')
    expect(parseDurationInput('-26:03:09')).toBe(ms)
    expect(parseDurationInput('+01:00:00')).toBe(HOUR)
  })
  it('accepts hours above 23 and rejects bad input', () => {
    expect(parseDurationInput('99:59:59')).toBe(99 * HOUR + 59 * MINUTE + 59 * SECOND)
    expect(() => parseDurationInput('1:00')).toThrow()
    expect(() => parseDurationInput('aa:00:00')).toThrow()
    expect(() => parseDurationInput('00:60:00')).toThrow()
  })
})

describe('formatDateRange', () => {
  const now = at(12, 0, 0)
  it('shows one day when the view is within a day', () => {
    expect(formatDateRange(at(9, 0, 0), at(15, 0, 0), now)).not.toContain('–')
  })
  it('shows a range across midnight and adds the year when it differs', () => {
    expect(formatDateRange(at(20, 0, 0), at(20, 0, 0) + 8 * HOUR, now)).toContain('–')
    const lastYear = new Date(2025, 5, 1).getTime()
    expect(formatDateRange(lastYear, lastYear + HOUR, now)).toContain('2025')
  })
})

describe('clock entry', () => {
  it('converts 12h to 24h', () => {
    expect(to24h(12, false)).toBe(0)
    expect(to24h(12, true)).toBe(12)
    expect(to24h(7, true)).toBe(19)
    expect(to24h(7, false)).toBe(7)
  })
  it('keeps the calendar day of the reference time', () => {
    const ref = at(23, 0, 0)
    expect(atClockTimeOnDay(ref, 6, 30, 0)).toBe(at(6, 30, 0))
  })
})

describe('chipName/showsSeconds', () => {
  it('formats', () => {
    expect(chipName('Snooze 2: Test Alarm')).toBe('Test Alarm ?2')
    expect(chipName('Snooze 2: Snooze 1: X')).toBe('X ?2')
    expect(chipName('Plain')).toBe('Plain')
    expect(chipName('')).toBe('?')
    expect(showsSeconds(1000, 5000)).toBe(true)
    expect(showsSeconds(60000, 5000)).toBe(false)
  })
})

