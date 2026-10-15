// The Alarm button's picker (TLC-3). Pure: reading a typed time, which day it lands on, and
// recently set alarms. Everything it makes is ordinary instants or a series (store/actions setAlarm).
//
// AM/PM mistakes (TLC-7): "7" alone is ambiguous on a 12-hour reading, so the picker takes the
// sooner of 7:00 AM and 7:00 PM, shows which it took ("Tue 7:00 AM · in 7h 34m") and offers the
// other; typing "7p", "7am" or "19" settles it.
import type { Repeat } from './series.ts'
import { CLOCK_RE, sanitizeRepeat } from './series.ts'
import { formatTimerLength, parseTimerInput } from './quickCreate.ts'
import { DAY, MINUTE } from './time.ts'

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

/** Warnings the picker offers (how long before the alarm), unless Settings say otherwise. */
export const WARN_CHOICES_MS = [5, 15, 30, 60].map(m => m * MINUTE)

/** Settings > Alarms: the warnings the picker offers, and what a new alarm starts with. */
export interface AlarmRingDefaults {
  /** Warning lengths offered as chips, ms. */
  choices: number[]
  /** Rings at the time itself to start with. */
  onTime: boolean
  /** Warnings picked to start with, ms (offered too). */
  warnings: number[]
}

export const DEFAULT_RING_DEFAULTS: AlarmRingDefaults = { choices: WARN_CHOICES_MS, onTime: true, warnings: [] }

const warningList = (raw: unknown): number[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((w): w is number => typeof w === 'number' && w > 0 && w < DAY))].sort((a, b) => a - b).slice(0, 8) : []

export function sanitizeRingDefaults(raw: unknown): AlarmRingDefaults {
  if (!raw || typeof raw !== 'object') return DEFAULT_RING_DEFAULTS
  const r = raw as Record<string, unknown>
  const warnings = warningList(r.warnings)
  // Starting with no ring at all would make every new alarm need fixing: then it rings on time.
  return { choices: Array.isArray(r.choices) ? warningList(r.choices) : WARN_CHOICES_MS, onTime: r.onTime !== false || warnings.length === 0, warnings }
}

/** "5m, 15m, 1h 30m" read back as lengths (each like a typed warning); null when any part isn't one. */
export function parseWarningList(text: string): number[] | null {
  const parts = text.split(',').map(p => p.trim()).filter(Boolean)
  const out = parts.map(parseWarning)
  return out.every((w): w is number => w !== null) ? warningList(out) : null
}

/** "5m", "1h", "1h 30m". */
export const warnText = (ms: number) => formatTimerLength(ms)

/** A typed warning length ("20", "20m", "1h30", "1:30"), under a day; null when it isn't one. */
export function parseWarning(text: string): number | null {
  const ms = parseTimerInput(text)
  return ms !== null && ms < DAY ? ms : null
}

/** The alarms an alarm set from the picker gets: its warnings (latest first), then the one at its time unless left out. */
export const pickerOffsets = (warnings: readonly number[], onTime: boolean) =>
  [...new Set(warnings.filter(w => w > 0))].sort((a, b) => b - a).concat(onTime ? [0] : [])

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
  /** False: only the warnings ring, not the time itself. */
  onTime?: false
}

export const MAX_RECENT_ALARMS = 3

const sameRecent = (a: RecentAlarm, b: RecentAlarm) =>
  a.time === b.time && a.label === b.label && !a.onTime === !b.onTime && JSON.stringify(a.repeat) === JSON.stringify(b.repeat) && JSON.stringify(a.warnings) === JSON.stringify(b.warnings)

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
    const onTime = r.onTime === false && warnings.length > 0 ? { onTime: false as const } : {}
    return [{ time: r.time, repeat, warnings, label: typeof r.label === 'string' ? r.label : '', ...onTime }]
  }).slice(0, MAX_RECENT_ALARMS)
}
