// The time entry field: digits typed into one hh:mm:ss box, filling from the right.
// Up to four digits mean hours and minutes ("930" → 09:30, "13" → 13 minutes); five or
// six add seconds ("93015" → 09:30:15). A clock time starts with the hour instead: one or
// two digits are the hour ("9" → 9:00, "17" → 17:00; "93" → 9:30, as 93 isn't an hour).
// Pure; the field is components/timeline/TimeEntryPopover.
import { HOUR, MINUTE, SECOND } from './time.ts'

export const MAX_TIME_DIGITS = 6

export interface TimeParts { h: number; m: number; s: number }

/** The six display digits ("hhmmss") and which of them were typed (the rest are zero padding). */
export interface DigitDisplay { chars: string; typed: boolean[] }

/** Keeps digits only, at most six. */
export const cleanDigits = (text: string) => text.replace(/\D/g, '').slice(0, MAX_TIME_DIGITS)

/** 'duration' fills from the right ("13" is 13 minutes); 'clock' starts with the hour ("9" is 9:00). */
export type DigitMode = 'duration' | 'clock'

export function digitDisplay(digits: string, mode: DigitMode = 'duration'): DigitDisplay {
  const d = cleanDigits(digits)
  if (mode === 'clock' && d.length > 0 && d.length <= 2) {
    // The hour: "9" → 09, "17" → 17; two digits that can't be an hour are the hour and the
    // minutes' first digit ("93" → 09:30).
    const hour = d.length === 1 || Number(d) <= 23
    const chars = hour ? `${d.padStart(2, '0')}0000` : `0${d}000`
    const typed = hour ? [d.length === 2, true, false, false, false, false] : [false, true, true, false, false, false]
    return { chars, typed }
  }
  const width = d.length <= 4 ? 4 : 6
  const filled = d.padStart(width, '0')
  const chars = width === 4 ? `${filled}00` : filled
  const typed = Array.from({ length: 6 }, (_, i) => i < width && i >= width - d.length)
  return { chars, typed }
}

export function digitsToParts(digits: string, mode: DigitMode = 'duration'): TimeParts {
  const { chars } = digitDisplay(digits, mode)
  return { h: Number(chars.slice(0, 2)), m: Number(chars.slice(2, 4)), s: Number(chars.slice(4, 6)) }
}

/** Display of a value that hasn't been typed over yet (the field's starting value). */
export function partsDisplay(p: TimeParts): DigitDisplay {
  const pad = (n: number) => Math.min(99, Math.max(0, Math.floor(n))).toString().padStart(2, '0')
  return { chars: `${pad(p.h)}${pad(p.m)}${pad(p.s)}`, typed: Array(6).fill(true) }
}

/** A duration's parts (hours capped at 99). */
export function msToParts(ms: number): TimeParts {
  const abs = Math.min(Math.abs(ms), 99 * HOUR + 59 * MINUTE + 59 * SECOND)
  return { h: Math.floor(abs / HOUR), m: Math.floor((abs % HOUR) / MINUTE), s: Math.floor((abs % MINUTE) / SECOND) }
}

/** A typed duration in ms. Minutes and seconds over 59 carry ("90" minutes is 1h 30m). */
export const partsToMs = (p: TimeParts) => p.h * HOUR + p.m * MINUTE + p.s * SECOND

/**
 * A typed clock time as 24-hour parts, or null if it isn't one. Hours 1–12 use the AM/PM
 * toggle; 0 and 13–23 are read as 24-hour times (so "1730" works without the toggle).
 */
export function clockFromParts(p: TimeParts, pm: boolean): TimeParts | null {
  if (p.m > 59 || p.s > 59 || p.h > 23) return null
  const h = p.h === 0 || p.h > 12 ? p.h : (p.h % 12) + (pm ? 12 : 0)
  return { h, m: p.m, s: p.s }
}
