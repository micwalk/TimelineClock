import { describe, expect, it } from 'vitest'
import { CURSOR_DAY, CURSOR_MONTH, CURSOR_YEAR, calendarDays, calendarMonths, cursorClock, cursorCoarseDate, cursorOffset, cursorUnit } from './cursorPrecision.ts'
import { DAY, HOUR, MINUTE, SECOND } from './time.ts'

const at = (y: number, mo: number, d: number, h = 0, m = 0, s = 0) => new Date(y, mo - 1, d, h, m, s).getTime()

describe('the step the zoom can tell', () => {
  it('is the finest step that spans the pixels asked for', () => {
    expect(cursorUnit(100, 4)).toBe(SECOND) // 0.4 s across 4 px
    expect(cursorUnit(1000, 4)).toBe(5 * SECOND)
    expect(cursorUnit(15_000, 4)).toBe(MINUTE) // a pixel is 15 s: seconds are false precision
    expect(cursorUnit(60_000, 4)).toBe(5 * MINUTE)
    expect(cursorUnit(200_000, 4)).toBe(15 * MINUTE)
    expect(cursorUnit(10 * MINUTE, 4)).toBe(HOUR)
    expect(cursorUnit(HOUR, 4)).toBe(CURSOR_DAY)
    expect(cursorUnit(DAY, 4)).toBe(CURSOR_MONTH)
    expect(cursorUnit(30 * DAY, 4)).toBe(CURSOR_YEAR)
  })
})

describe('the cursor’s clock', () => {
  const ts = at(2026, 11, 25, 15, 41, 37)
  it('rounds to the step, and leaves days to the date line', () => {
    expect(cursorClock(ts, SECOND)).toBe('3:41:37p')
    expect(cursorClock(ts, 15 * SECOND)).toBe('3:41:30p')
    expect(cursorClock(ts, MINUTE)).toBe('3:42p')
    expect(cursorClock(ts, 15 * MINUTE)).toBe('3:45p')
    expect(cursorClock(ts, HOUR)).toBe('4p')
    expect(cursorClock(ts, CURSOR_DAY)).toBe('')
  })
  it('says only the month or the year further out', () => {
    expect(cursorCoarseDate(at(2026, 11, 25), CURSOR_MONTH)).toBe(new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(at(2026, 12, 1)))
    expect(cursorCoarseDate(at(2026, 3, 2), CURSOR_YEAR)).toBe('2026')
    expect(cursorCoarseDate(at(2026, 3, 2), CURSOR_DAY)).toBeNull()
  })
})

describe('calendar counts', () => {
  it('counts days by midnights crossed, from where it is measured', () => {
    // Mon 10p to Thu midnight: 50 hours, three days.
    expect(calendarDays(at(2026, 11, 23, 22), at(2026, 11, 26, 0))).toBe(3)
    // Mon 1a to Wed 3a: 50 hours, two days.
    expect(calendarDays(at(2026, 11, 23, 1), at(2026, 11, 25, 3))).toBe(2)
  })
  it('counts months by the calendar', () => {
    expect(calendarMonths(at(2026, 1, 31), at(2026, 3, 1))).toEqual({ months: 1, days: 1 })
    expect(calendarMonths(at(2026, 11, 25), at(2029, 5, 10))).toEqual({ months: 29, days: 15 })
  })
})

describe('the cursor’s offsets', () => {
  const now = at(2026, 11, 23, 22)
  it('at second precision read as before', () => {
    expect(cursorOffset(now, now + HOUR + 5 * MINUTE + 30 * SECOND, SECOND)).toBe('+01:05:30')
    expect(cursorOffset(now, now - 40 * SECOND, SECOND)).toBe('-00:40')
  })
  it('drop what the zoom can’t tell', () => {
    expect(cursorOffset(now, now + HOUR + 5 * MINUTE + 30 * SECOND, MINUTE)).toBe('+1h 6m')
    expect(cursorOffset(now, now + HOUR + 5 * MINUTE, 15 * MINUTE)).toBe('+1h')
    expect(cursorOffset(now, now - 25 * MINUTE, 5 * MINUTE)).toBe('-25m')
    expect(cursorOffset(now, now + 50 * HOUR + 20 * MINUTE, HOUR)).toBe('+2d 2h')
    expect(cursorOffset(now, now + 50 * HOUR + 20 * MINUTE, MINUTE)).toBe('+2d 2h')
    expect(cursorOffset(now, now + 20 * SECOND, MINUTE)).toBe('')
  })
  it('count days and more by the calendar', () => {
    expect(cursorOffset(now, now + 50 * HOUR, CURSOR_DAY)).toBe('+3d')
    expect(cursorOffset(now, now - 50 * HOUR, CURSOR_DAY)).toBe('-2d')
    expect(cursorOffset(now, at(2029, 5, 10, 9), CURSOR_DAY)).toBe('+2y 5mo')
    expect(cursorOffset(now, at(2027, 2, 10), CURSOR_DAY)).toBe('+2mo 18d')
    expect(cursorOffset(now, at(2027, 2, 10), CURSOR_MONTH)).toBe('+3mo')
    expect(cursorOffset(now, at(2029, 5, 10), CURSOR_YEAR)).toBe('+2y')
    expect(cursorOffset(now, at(2040, 1, 1), CURSOR_MONTH)).toBe('+13y')
  })
})
