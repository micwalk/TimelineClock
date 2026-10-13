// The Alarm button's picker (TLC-3). Pure: reading a typed time, which day it lands on, and
// recently set alarms. Everything it makes is ordinary instants or a series (store/actions setAlarm).
//
// AM/PM mistakes (TLC-7): "7" alone is ambiguous on a 12-hour reading, so the picker takes the
// sooner of 7:00 AM and 7:00 PM, shows which it took ("Tue 7:00 AM · in 7h 34m") and offers the
// other; typing "7p", "7am" or "19" settles it.
import type { Repeat } from './series.ts'
import { CLOCK_RE, sanitizeRepeat } from './series.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

export interface AlarmTime {
  h: number
  m: number
  /** Typed with the time ("7p", "7:30am"); null when not. */
  meridiem: 'am' | 'pm' | null
}

/** A typed alarm time: "7", "730", "7:30", "1730", "7p", "7:30 am". Null when it isn't one. */
export function parseAlarmTime(text: string): AlarmTime | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  const meridiem = /p/.test(t) ? 'pm' : /a/.test(t) ? 'am' : null
  const body = t.replace(/[apm.\s]/g, '')
  let h: number
  let m: number
  if (body.includes(':')) {
    const [a, b, ...rest] = body.split(':')
    if (rest.length > 0 || !/^\d{1,2}$/.test(a) || !/^\d{2}$/.test(b)) return null
    h = Number(a)
    m = Number(b)
  } else {
    if (!/^\d{1,4}$/.test(body)) return null
    h = Number(body.length <= 2 ? body : body.slice(0, -2))
    m = body.length <= 2 ? 0 : Number(body.slice(-2))
  }
  if (m > 59 || h > 23 || (meridiem && (h < 1 || h > 12))) return null
  return { h, m, meridiem }
}

/** A time that could be AM or PM: 1–12 with no AM/PM typed. */
export const isAmbiguous = (t: AlarmTime) => t.meridiem === null && t.h >= 1 && t.h <= 12

/** The hour (0–23): AM/PM as typed, else `pm` for an ambiguous one, else as typed (24-hour). */
export function hour24(t: AlarmTime, pm: boolean): number {
  const usePm = t.meridiem ? t.meridiem === 'pm' : isAmbiguous(t) ? pm : null
  if (usePm === null) return t.h
  return (t.h % 12) + (usePm ? 12 : 0)
}

/** The next time the clock reads h:m after `now`: today, or tomorrow. */
export function nextAt(h24: number, m: number, now: number): number {
  const d = new Date(now)
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h24, m).getTime()
  if (today > now) return today
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, h24, m).getTime()
  return t
}

/** For an ambiguous time, whether PM comes sooner than AM. */
export function soonerIsPm(t: AlarmTime, now: number): boolean {
  return nextAt(hour24(t, true), t.m, now) < nextAt(hour24(t, false), t.m, now)
}

/** "HH:MM" for a 24-hour hour and minute. */
export const clockText = (h24: number, m: number) => `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`

/** Warnings the picker offers (how long before the alarm). */
export const WARN_CHOICES_MS = [5, 15, 30, 60].map(m => m * MINUTE)

/** "+5m", "+1h". */
export const warnText = (ms: number) => (ms >= HOUR ? `${ms / HOUR}h` : `${ms / MINUTE}m`)

// ---------------------------------------------------------------------------
// Recently set alarms: one tap sets the same again.

export interface RecentAlarm {
  /** "HH:MM", 24-hour. */
  time: string
  /** null: once. */
  repeat: Repeat | null
  /** Warnings before it, ms. */
  warnings: number[]
  label: string
}

export const MAX_RECENT_ALARMS = 3

const sameRecent = (a: RecentAlarm, b: RecentAlarm) =>
  a.time === b.time && a.label === b.label && JSON.stringify(a.repeat) === JSON.stringify(b.repeat) && JSON.stringify(a.warnings) === JSON.stringify(b.warnings)

export function pushRecentAlarm(list: readonly RecentAlarm[], a: RecentAlarm): RecentAlarm[] {
  return [a, ...list.filter(x => !sameRecent(x, a))].slice(0, MAX_RECENT_ALARMS)
}

export function sanitizeRecentAlarms(raw: unknown): RecentAlarm[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x): RecentAlarm[] => {
    if (!x || typeof x !== 'object') return []
    const r = x as Record<string, unknown>
    if (typeof r.time !== 'string' || !CLOCK_RE.test(r.time)) return []
    const repeat = r.repeat === null ? null : sanitizeRepeat(r.repeat)
    if (repeat === null && r.repeat !== null) return []
    const warnings = Array.isArray(r.warnings) ? r.warnings.filter((w): w is number => typeof w === 'number' && w > 0 && w < DAY) : []
    return [{ time: r.time, repeat, warnings, label: typeof r.label === 'string' ? r.label : '' }]
  }).slice(0, MAX_RECENT_ALARMS)
}
