// Daylight saving time. Pure. Clock changes in a timezone: where they fall, what the zone is
// called on either side ("PDT", "PST"), and the computed "Clocks back 1h" instants the timeline
// shows at them. Every function takes an optional IANA zone ("America/Los_Angeles"); without one
// it uses the device's own, so a world clock (#9) can ask about any zone with the same code.
import type { InstantRecord } from './entities.ts'
import { isAtSun } from './sunEvents.ts'
import { HOUR, MINUTE } from './time.ts'

const partsFmt = new Map<string, Intl.DateTimeFormat>()
const zoneFmt = new Map<string, Intl.DateTimeFormat>()

/** Minutes ahead of UTC at `ts` in `timeZone` (the device's when omitted): -420 for PDT. */
export function utcOffsetMin(ts: number, timeZone?: string): number {
  if (!timeZone) return -new Date(ts).getTimezoneOffset()
  let f = partsFmt.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    partsFmt.set(timeZone, f)
  }
  const p: Record<string, number> = {}
  for (const part of f.formatToParts(ts)) if (part.type !== 'literal') p[part.type] = Number(part.value)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((wall - Math.floor(ts / 1000) * 1000) / MINUTE)
}

/** The zone's short name at `ts`: "PDT", "PST" (or "GMT+1" where the locale has no abbreviation). */
export function zoneAbbrev(ts: number, timeZone?: string): string {
  const key = timeZone ?? ''
  let f = zoneFmt.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: 'short' })
    zoneFmt.set(key, f)
  }
  return f.formatToParts(ts).find(p => p.type === 'timeZoneName')?.value ?? ''
}

export interface DstShift {
  /** The first moment on the new offset (the clock change). */
  ts: number
  /** Minutes ahead of UTC before and after. */
  before: number
  after: number
}

/** Offsets change at most every few months: checking every 6 hours finds every change. */
const SCAN_MS = 6 * HOUR

/** The clock changes in [from, to], in order. */
export function dstShifts(from: number, to: number, timeZone?: string): DstShift[] {
  const out: DstShift[] = []
  let a = from
  let off = utcOffsetMin(a, timeZone)
  for (let guard = 0; a < to && guard < 5000; guard++) {
    const b = Math.min(to, a + SCAN_MS)
    const next = utcOffsetMin(b, timeZone)
    if (next !== off) {
      // The change is between a and b: narrow it to the exact moment (about 25 steps).
      let lo = a
      let hi = b
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2)
        if (utcOffsetMin(mid, timeZone) === off) lo = mid
        else hi = mid
      }
      out.push({ ts: hi, before: off, after: next })
    }
    off = next
    a = b
  }
  return out
}

/** Whether a clock change is within `withinMs` of `ts` (either side). */
export function nearDstShift(ts: number, withinMs: number, timeZone?: string): boolean {
  return utcOffsetMin(ts - withinMs, timeZone) !== utcOffsetMin(ts + withinMs, timeZone)
}

/** Whether the clocks change exactly at `ts` (to the minute). */
export function isDstShiftAt(ts: number, timeZone?: string): boolean {
  return utcOffsetMin(ts - MINUTE, timeZone) !== utcOffsetMin(ts, timeZone)
}

/** "DST ends (🕰️back)" when the clocks go back, "DST begins (🕰️fwd)" when they go forward (the header names the zones). */
export function describeShift(s: DstShift): string {
  return s.after < s.before ? 'DST ends (🕰️back)' : 'DST begins (🕰️fwd)'
}

/** A computed clock change's id: "dst:<epoch ms>". */
export const dstVirtualId = (ts: number) => `dst:${ts}`

/** The time a computed clock change's id names, or null. */
export function parseDstVirtualId(id: string): number | null {
  const m = /^dst:(-?\d+)$/.exec(id)
  return m ? Number(m[1]) : null
}

/**
 * The clock changes between `from` and `to` as virtual instants (shown only, like sunsets; a
 * change to one stores it), except those already stored (same id).
 */
export function virtualDstShifts(instants: readonly InstantRecord[], from: number, to: number, timeZone?: string): InstantRecord[] {
  const ids = new Set(instants.map(i => i.id))
  return dstShifts(from, to, timeZone)
    .filter(s => !ids.has(dstVirtualId(s.ts)))
    .map(s => ({ id: dstVirtualId(s.ts), tsEpochMs: s.ts, label: describeShift(s), virtual: true as const }))
}

/**
 * Whether `inst` stands for a clock change: one computed here (its id says so, and a kept one keeps
 * that id) that still sits on a change. No field on the instant: the id is where it came from.
 */
export const isAtDstShift = (inst: Pick<InstantRecord, 'id' | 'tsEpochMs'>, timeZone?: string) =>
  parseDstVirtualId(inst.id) !== null && isDstShiftAt(inst.tsEpochMs, timeZone)

/** A time the world sets, not you: a sunrise or sunset, or a clock change. Never moved or deleted (hidden instead). */
export const isFixedTime = (inst: InstantRecord) => isAtSun(inst) || isAtDstShift(inst)

/** The same wall-clock time `days` calendar days from `ts` (a day across a clock change is 23 or 25 hours). */
export function addCalendarDays(ts: number, days: number): number {
  const d = new Date(ts)
  const h = d.getHours()
  const m = d.getMinutes()
  const s = d.getSeconds()
  const ms = d.getMilliseconds()
  d.setDate(d.getDate() + days)
  d.setHours(h, m, s, ms)
  return d.getTime()
}
