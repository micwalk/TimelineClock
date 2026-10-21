import { describe, expect, it } from 'vitest'
import { atClockTimeOnDay, chipName, durationStep, formatChipTime, formatClock12h, formatClockCompact, formatDateRange, formatDayLabel, formatDuration, formatDurationCoarse, formatDurationForInput, formatDurationHMS, formatDurationShort, formatLiveSpan, formatMonthDay, formatRelativeCoarse, formatRelativeShort, formatSignedDuration, parseDurationInput, showsSeconds, to24h, truncateText } from './format.ts'
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
  it('shows seconds only under a minute, never milliseconds', () => {
    expect(formatDurationHMS(5 * SECOND + 42)).toBe('00:05')
    expect(formatDurationHMS(10 * SECOND)).toBe('00:10')
    expect(formatDurationHMS(59 * SECOND + 999)).toBe('00:59')
  })
  it('drops to mm:ss, hh:mm:ss and days as it grows', () => {
    expect(formatDurationHMS(3 * MINUTE + 4 * SECOND)).toBe('03:04')
    expect(formatDurationHMS(2 * HOUR + 3 * MINUTE)).toBe('02:03:00')
    expect(formatDurationHMS(DAY + HOUR)).toBe('1 day, 01:00:00')
    expect(formatDurationHMS(3 * DAY)).toBe('3 days, 00:00:00')
  })
  it('treats negative input as zero', () => {
    expect(formatDurationHMS(-5000)).toBe('00:00')
  })
})

describe('signed and coarse durations', () => {
  it('prefixes a sign', () => {
    expect(formatSignedDuration(-90 * SECOND)).toBe('-01:30')
    expect(formatSignedDuration(90 * SECOND)).toBe('+01:30')
    expect(formatSignedDuration(10 * SECOND + 400)).toBe('+00:10')
    expect(formatSignedDuration(-10 * SECOND)).toBe('-00:10')
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

describe('chipName', () => {
  it('shortens snoozes to "Base ⟲N"', () => {
    expect(chipName('Snooze 2: Test Alarm')).toBe('Test Alarm ⟲2')
    expect(chipName('Snooze 2: Snooze 1: Wake up')).toBe('Wake up ⟲2')
  })
  it('leaves other labels alone and names empty ones like displayName', () => {
    expect(chipName('Take Meds')).toBe('Take Meds')
    expect(chipName('')).toBe('?')
    expect(chipName('Snooze 1: ')).toBe('? ⟲1')
  })
})

describe('showsSeconds', () => {
  it('shows seconds only when the finest tick is under the threshold', () => {
    expect(showsSeconds(15 * SECOND, MINUTE)).toBe(true)
    expect(showsSeconds(MINUTE, MINUTE)).toBe(false)
    expect(showsSeconds(5 * MINUTE, MINUTE)).toBe(false)
  })
})

describe('formatClockCompact', () => {
  it('drops leading zeros and shortens am/pm', () => {
    expect(formatClockCompact(new Date(2026, 0, 5, 18, 0, 0).getTime(), false)).toBe('6:00p')
    expect(formatClockCompact(new Date(2026, 0, 5, 9, 7, 0).getTime(), false)).toBe('9:07a')
  })
  it('shows seconds on request', () => {
    expect(formatClockCompact(new Date(2026, 0, 5, 18, 4, 13).getTime(), true)).toBe('6:04:13p')
  })
  it('handles midnight and noon', () => {
    expect(formatClockCompact(new Date(2026, 0, 5, 0, 5, 0).getTime(), false)).toBe('12:05a')
    expect(formatClockCompact(new Date(2026, 0, 5, 12, 0, 0).getTime(), false)).toBe('12:00p')
  })
})

describe('formatRelativeShort', () => {
  it('says now within a second', () => {
    expect(formatRelativeShort(0)).toBe('now')
    expect(formatRelativeShort(999)).toBe('now')
    expect(formatRelativeShort(-999)).toBe('now')
  })
  it('uses the largest useful units', () => {
    expect(formatRelativeShort(-45 * SECOND)).toBe('45s ago')
    expect(formatRelativeShort(6 * MINUTE + 30 * SECOND)).toBe('in 6m')
    expect(formatRelativeShort(-(2 * HOUR + 5 * MINUTE))).toBe('2h 5m ago')
    expect(formatRelativeShort(2 * HOUR)).toBe('in 2h')
    expect(formatRelativeShort(-(3 * DAY + 4 * HOUR))).toBe('3d 4h ago')
    expect(formatRelativeShort(3 * DAY)).toBe('in 3d')
  })
})

describe('formatDurationShort', () => {
  it('uses the two largest units, floored', () => {
    expect(formatDurationShort(0)).toBe('0s')
    expect(formatDurationShort(45 * SECOND + 900)).toBe('45s')
    expect(formatDurationShort(26 * MINUTE + 13 * SECOND)).toBe('26m')
    expect(formatDurationShort(HOUR + 5 * MINUTE + 30 * SECOND)).toBe('1h 5m')
    expect(formatDurationShort(2 * HOUR)).toBe('2h')
    expect(formatDurationShort(2 * DAY + 3 * HOUR + 59 * MINUTE)).toBe('2d 3h')
    expect(formatDurationShort(3 * DAY)).toBe('3d')
  })
  it('ignores the sign', () => {
    expect(formatDurationShort(-10 * MINUTE)).toBe('10m')
  })
})

describe('truncateText', () => {
  it('keeps short text and cuts long text with an ellipsis within the limit', () => {
    expect(truncateText('Cooking', 8)).toBe('Cooking')
    expect(truncateText('Making dinner', 8)).toBe('Making…')
    expect(truncateText('Making dinner', 8).length).toBeLessThanOrEqual(8)
  })
})

describe('formatLiveSpan', () => {
  const T = 26 * MINUTE + 13 * SECOND + 457
  it('is coarse zoomed out, for an hour or more', () => {
    expect(formatLiveSpan(HOUR + 5 * MINUTE + 3 * SECOND, 10_000)).toBe('1h 5m')
  })
  it('never reads a span under an hour as bare minutes, nor one under a minute without ms', () => {
    expect(formatLiveSpan(T, 10_000)).toBe('26:13')
    expect(formatLiveSpan(4 * SECOND + 50, 10_000)).toBe('0:04.050')
  })
  it('shows seconds, then tenths, then ms as you zoom in', () => {
    expect(formatLiveSpan(T, 100)).toBe('26:13')
    expect(formatLiveSpan(T, 5)).toBe('26:13.4')
    expect(formatLiveSpan(T, 1)).toBe('26:13.457')
    expect(formatLiveSpan(HOUR + 5 * MINUTE + 3 * SECOND, 100)).toBe('1:05:03')
    expect(formatLiveSpan(4 * SECOND + 50, 1)).toBe('0:04.050')
  })
  it('picks the zoom\u2019s unit from px per unit', () => {
    const long = 3 * HOUR
    expect(durationStep(long, { msPerPx: 2000 })).toBe(MINUTE)
    expect(durationStep(long, { msPerPx: 1000 })).toBe(SECOND)
    expect(durationStep(long, { msPerPx: 4 })).toBe(100)
    expect(durationStep(long, { msPerPx: 3 })).toBe(1)
  })
})

describe('formatDuration', () => {
  it('shows an exact value (an alarm\u2019s offset) down to what it holds, not by its length', () => {
    expect(formatDuration(15 * MINUTE, { exact: true })).toBe('15m')
    expect(formatDuration(MINUTE + 30 * SECOND, { exact: true })).toBe('1:30')
    expect(formatDuration(MINUTE + 1500, { exact: true })).toBe('1:01.5')
    expect(formatDuration(MINUTE + 1234, { exact: true })).toBe('1:01.234')
  })
  it('lets the zoom go finer than an exact value needs', () => {
    expect(formatDuration(15 * MINUTE, { exact: true, msPerPx: 100 })).toBe('15:00')
    expect(formatDuration(15 * MINUTE, { exact: true, msPerPx: 1 })).toBe('15:00.000')
  })
  it('without a zoom, shows by length: ms under a minute, seconds under an hour', () => {
    expect(formatDuration(4321)).toBe('0:04.321')
    expect(formatDuration(12 * MINUTE + 3 * SECOND + 400)).toBe('12:03')
    expect(formatDuration(2 * HOUR + 3 * MINUTE)).toBe('2h 3m')
  })
})

describe('long times (zoomed out to months and years)', () => {
  it('lengths read in months and years from 60 days', () => {
    expect(formatDurationShort(45 * DAY + 3 * HOUR)).toBe('45d 3h')
    expect(formatDurationShort(200 * DAY)).toBe('6mo 17d')
    expect(formatDurationShort(400 * DAY)).toBe('1y 1mo')
    expect(formatDurationShort(3 * 365.25 * DAY)).toBe('3y')
    expect(formatDurationShort(80 * 365.25 * DAY)).toBe('80y')
    expect(formatRelativeShort(200 * DAY)).toBe('in 6mo 17d')
    expect(formatSignedDuration(5 * HOUR)).toBe('+05:00:00')
    expect(formatSignedDuration(-200 * DAY)).toBe('-6mo 17d')
  })
  it('chips say the date as the zoom widens, and the year far out or in another year', () => {
    const now = new Date(2026, 9, 19, 12).getTime()
    const t = new Date(2026, 9, 24, 7, 20).getTime()
    expect(formatChipTime(t, now, 6 * HOUR, false)).toBe('7:20a')
    expect(formatChipTime(t, now, 5 * DAY, false)).toBe(`${formatMonthDay(t, now)} 7:20a`)
    expect(formatChipTime(t, now, 90 * DAY, false)).toBe(formatMonthDay(t, now))
    expect(formatChipTime(t, now, 365 * DAY, false)).toBe(formatMonthDay(t, now, true))
    expect(formatMonthDay(t, now, true)).toMatch(/2026/)
    expect(formatMonthDay(new Date(2027, 3, 3).getTime(), now)).toMatch(/2027/)
    expect(formatDayLabel(t, now)).not.toMatch(/2026/)
    expect(formatDayLabel(t, now, true)).toMatch(/2026/)
  })
})
