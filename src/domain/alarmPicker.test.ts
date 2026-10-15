import { describe, expect, it } from 'vitest'
import { DEFAULT_RING_DEFAULTS, parseWarningList, sanitizeRingDefaults, hour24, isAmbiguous, nextAt, parseAlarmTime, parseWarning, pickerOffsets, pushRecentAlarm, sanitizeRecentAlarms, soonerIsPm, warnText } from './alarmPicker.ts'
import { HOUR, MINUTE } from './time.ts'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()

describe('parseAlarmTime', () => {
  it('reads hours, h:mm, hmm and 24-hour times, with or without AM/PM', () => {
    expect(parseAlarmTime('7')).toEqual({ h: 7, m: 0, meridiem: null })
    expect(parseAlarmTime('730')).toEqual({ h: 7, m: 30, meridiem: null })
    expect(parseAlarmTime('7:30')).toEqual({ h: 7, m: 30, meridiem: null })
    expect(parseAlarmTime('1730')).toEqual({ h: 17, m: 30, meridiem: null })
    expect(parseAlarmTime('7p')).toEqual({ h: 7, m: 0, meridiem: 'pm' })
    expect(parseAlarmTime('7:30 am')).toEqual({ h: 7, m: 30, meridiem: 'am' })
  })
  it('refuses what isn’t a time', () => {
    for (const bad of ['', 'soon', '25', '7:75', '17p', '12345', '7:3']) expect(parseAlarmTime(bad)).toBeNull()
  })
})

describe('AM or PM', () => {
  it('only 1-12 without AM/PM is ambiguous; it takes the sooner one', () => {
    expect(isAmbiguous(parseAlarmTime('7')!)).toBe(true)
    expect(isAmbiguous(parseAlarmTime('19')!)).toBe(false)
    expect(isAmbiguous(parseAlarmTime('7a')!)).toBe(false)
    // At 10pm, 7 means 7 AM tomorrow; at 9am, 7 PM today.
    expect(soonerIsPm(parseAlarmTime('7')!, at(12, 22))).toBe(false)
    expect(soonerIsPm(parseAlarmTime('7')!, at(12, 9))).toBe(true)
  })
  it('turns into a 24-hour hour', () => {
    expect(hour24(parseAlarmTime('7')!, true)).toBe(19)
    expect(hour24(parseAlarmTime('12a')!, false)).toBe(0)
    expect(hour24(parseAlarmTime('12p')!, false)).toBe(12)
    expect(hour24(parseAlarmTime('17')!, false)).toBe(17)
  })
  it('lands on the next time the clock reads it', () => {
    expect(nextAt(7, 0, at(12, 22))).toBe(at(13, 7))
    expect(nextAt(23, 0, at(12, 22))).toBe(at(12, 23))
  })
})

describe('recent alarms', () => {
  const wake = { time: '07:00', repeat: { kind: 'weekly' as const, days: [1, 2, 3, 4, 5] }, warnings: [15 * MINUTE], label: 'Wake up' }
  it('keep the latest first, without repeats, at most three', () => {
    let list = pushRecentAlarm([], wake)
    list = pushRecentAlarm(list, { ...wake, time: '06:00' })
    list = pushRecentAlarm(list, wake)
    expect(list.map(a => a.time)).toEqual(['07:00', '06:00'])
    for (const t of ['01:00', '02:00', '03:00']) list = pushRecentAlarm(list, { ...wake, time: t })
    expect(list).toHaveLength(3)
  })
  it('keep well-formed ones from storage', () => {
    expect(sanitizeRecentAlarms([wake, { ...wake, repeat: null }, { ...wake, time: '7' }, { ...wake, repeat: { kind: 'weekly', days: [] } }, 'x']))
      .toEqual([wake, { ...wake, repeat: null }])
  })
})

describe('rings', () => {
  it('reads a typed warning length, under a day', () => {
    expect(parseWarning('20')).toBe(20 * MINUTE)
    expect(parseWarning('1h30')).toBe(90 * MINUTE)
    expect(parseWarning('25h')).toBeNull()
    expect(parseWarning('soon')).toBeNull()
    expect(warnText(90 * MINUTE)).toBe('1h 30m')
  })

  it('warnings latest first, then the time itself unless left out', () => {
    expect(pickerOffsets([5 * MINUTE, HOUR, 5 * MINUTE], true)).toEqual([HOUR, 5 * MINUTE, 0])
    expect(pickerOffsets([5 * MINUTE], false)).toEqual([5 * MINUTE])
    expect(pickerOffsets([], false)).toEqual([])
  })

  it('a recent alarm remembers being warnings only', () => {
    const r = { time: '07:00', repeat: null, warnings: [5 * MINUTE], label: '', onTime: false as const }
    expect(sanitizeRecentAlarms([r])).toEqual([r])
    expect(sanitizeRecentAlarms([{ ...r, warnings: [] }])[0].onTime).toBeUndefined()
  })
})

describe('ring defaults (Settings)', () => {
  it('reads the offered warnings and keeps a new alarm ringing somehow', () => {
    expect(parseWarningList('5m, 15, 1h30')).toEqual([5 * MINUTE, 15 * MINUTE, 90 * MINUTE])
    expect(parseWarningList('5m, soon')).toBeNull()
    expect(sanitizeRingDefaults(null)).toEqual(DEFAULT_RING_DEFAULTS)
    expect(sanitizeRingDefaults({ choices: [], onTime: false, warnings: [] }).onTime).toBe(true)
    expect(sanitizeRingDefaults({ choices: [HOUR], onTime: false, warnings: [HOUR] })).toEqual({ choices: [HOUR], onTime: false, warnings: [HOUR] })
  })
})
