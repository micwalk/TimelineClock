import { describe, expect, it } from 'vitest'
import { HOUR, MINUTE, SECOND } from './time.ts'
import { cleanDigits, clockFromParts, digitDisplay, digitsToParts, msToParts, partsDisplay, partsToMs } from './timeDigits.ts'

describe('digit entry', () => {
  it('fills hours and minutes from the right for up to four digits', () => {
    expect(digitsToParts('')).toEqual({ h: 0, m: 0, s: 0 })
    expect(digitsToParts('5')).toEqual({ h: 0, m: 5, s: 0 })
    expect(digitsToParts('13')).toEqual({ h: 0, m: 13, s: 0 })
    expect(digitsToParts('930')).toEqual({ h: 9, m: 30, s: 0 })
    expect(digitsToParts('1245')).toEqual({ h: 12, m: 45, s: 0 })
  })

  it('adds seconds from the fifth digit', () => {
    expect(digitsToParts('93015')).toEqual({ h: 9, m: 30, s: 15 })
    expect(digitsToParts('123456')).toEqual({ h: 12, m: 34, s: 56 })
  })

  it('marks which digits were typed', () => {
    expect(digitDisplay('13')).toEqual({ chars: '001300', typed: [false, false, true, true, false, false] })
    expect(digitDisplay('93015')).toEqual({ chars: '093015', typed: [false, true, true, true, true, true] })
    expect(partsDisplay({ h: 1, m: 2, s: 3 }).chars).toBe('010203')
  })

  it('keeps digits only, at most six', () => {
    expect(cleanDigits('1a2:3 4567')).toBe('123456')
  })
})

describe('durations', () => {
  it('converts both ways, carrying minutes over 59', () => {
    expect(partsToMs({ h: 1, m: 30, s: 5 })).toBe(HOUR + 30 * MINUTE + 5 * SECOND)
    expect(partsToMs(digitsToParts('90'))).toBe(90 * MINUTE)
    expect(msToParts(-(HOUR + 2 * MINUTE + 3 * SECOND))).toEqual({ h: 1, m: 2, s: 3 })
    expect(msToParts(500 * HOUR)).toEqual({ h: 99, m: 59, s: 59 })
  })
})

describe('clock times', () => {
  it('uses AM/PM for 1–12 and reads 0 and 13–23 as 24-hour', () => {
    expect(clockFromParts({ h: 9, m: 30, s: 0 }, false)).toEqual({ h: 9, m: 30, s: 0 })
    expect(clockFromParts({ h: 9, m: 30, s: 0 }, true)).toEqual({ h: 21, m: 30, s: 0 })
    expect(clockFromParts({ h: 12, m: 0, s: 0 }, false)).toEqual({ h: 0, m: 0, s: 0 })
    expect(clockFromParts({ h: 12, m: 0, s: 0 }, true)).toEqual({ h: 12, m: 0, s: 0 })
    expect(clockFromParts({ h: 17, m: 30, s: 0 }, false)).toEqual({ h: 17, m: 30, s: 0 })
    expect(clockFromParts({ h: 0, m: 15, s: 0 }, true)).toEqual({ h: 0, m: 15, s: 0 })
  })

  it('rejects impossible times', () => {
    expect(clockFromParts({ h: 9, m: 75, s: 0 }, false)).toBeNull()
    expect(clockFromParts({ h: 24, m: 0, s: 0 }, false)).toBeNull()
  })
})
