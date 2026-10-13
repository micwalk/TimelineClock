// Repeating alarm series (TLC-2): a group whose members are made from a rule. Pure.
//
// A series keeps a rule (a wall-clock time and which days), a template of alarms, and the dates
// it runs over. Its occurrences are ordinary instants (seriesId + occurrence date), made 14 days
// ahead (planOccurrences; the Android app gets their alarms that far ahead), so bells, snoozes,
// the Android app's alarms, the Agenda and navigation all work on them unchanged, and the future
// never fills up. Further ahead they are only computed, for the timeline (virtualOccurrences).
// Occurrences that pass stay as history. A rule change updates the untouched ones ahead in place
// (refreshOccurrence). Editing one occurrence edits that instant (it is marked seriesEdited, so
// rule changes leave it alone); "apply to all future" folds it back into the rule. Deleting one
// occurrence skips its date; deleting it and all later ones ends the series.
//
// Wall-clock time: "07:00" stays 7:00 local across DST and timezone changes (a time a DST jump
// skips lands where Date puts it, an hour later).
import type { InstantRecord } from './entities.ts'
import { DAY } from './time.ts'

/** Which days a series runs on: days of the week (0 = Sunday), or every N days from its first date. */
export type Repeat = { kind: 'weekly'; days: number[] } | { kind: 'interval'; every: number }

export interface SeriesRecord {
  id: string
  /** Groups to come (TLC-9: hand-picked sets, TLC-6: sunrise and sunset) share this record shape. */
  kind: 'series'
  label: string
  /** Local wall-clock time, "HH:MM". */
  time: string
  repeat: Repeat
  /** The alarms every occurrence gets: how long before it each rings (0 = at it). */
  alarms: number[]
  /** First date ("YYYY-MM-DD", local). */
  from: string
  /** Last date, inclusive (the series was ended there). */
  until?: string
  /** Dates whose occurrence was deleted on its own. */
  skips?: string[]
  /** Paused: no new occurrences are made, and those ahead are removed. */
  paused?: boolean
}

export type GroupRecord = SeriesRecord

const randomId = () => Math.random().toString(36).slice(2, 11)
export const newGroupId = () => `g_${randomId()}`

// ---------------------------------------------------------------------------
// Dates and times (local)

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A time's local date, "YYYY-MM-DD". */
export function dateKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const parseKey = (key: string): [number, number, number] => key.split('-').map(Number) as [number, number, number]

/** The date after `key`. */
export function nextDateKey(key: string): string {
  const [y, m, d] = parseKey(key)
  return dateKey(new Date(y, m - 1, d + 1, 12).getTime())
}

/** Whole days from `a` to `b` (calendar days, DST-proof). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parseKey(a)
  const [by, bm, bd] = parseKey(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY)
}

/** A time's local wall-clock time, "HH:MM". */
export function clockKey(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** When a series' occurrence on `date` is. */
export function occurrenceTs(s: Pick<SeriesRecord, 'time'>, date: string): number {
  const [y, m, d] = parseKey(date)
  const [hh, mm] = s.time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).getTime()
}

/** Whether the series runs on `date` (inside its dates, not skipped, and on its days). */
export function occursOn(s: SeriesRecord, date: string): boolean {
  if (date < s.from || (s.until && date > s.until) || s.skips?.includes(date)) return false
  if (s.repeat.kind === 'interval') return daysBetween(s.from, date) % Math.max(1, s.repeat.every) === 0
  const [y, m, d] = parseKey(date)
  return s.repeat.days.includes(new Date(y, m - 1, d, 12).getDay())
}

/** The series' next occurrence after `now` (searching a little over a year), or null. */
export function nextOccurrence(s: SeriesRecord, now: number): { date: string; ts: number } | null {
  if (s.paused) return null
  let date = dateKey(now) < s.from ? s.from : dateKey(now)
  for (let k = 0; k < 400; k++, date = nextDateKey(date)) {
    if (s.until && date > s.until) return null
    if (!occursOn(s, date)) continue
    const ts = occurrenceTs(s, date)
    if (ts > now) return { date, ts }
  }
  return null
}

// ---------------------------------------------------------------------------
// Occurrences as instants

/** An occurrence: an instant made by a series. */
export const isOccurrence = (i: InstantRecord): i is InstantRecord & { seriesId: string; occurrence: string } => !!i.seriesId && !!i.occurrence

/** How far ahead occurrences are made (stored): as far as the Android app gets alarms ahead of time. */
export const OCCURRENCE_HORIZON_MS = 14 * DAY

/** Most occurrences computed for the timeline at once (a year of a daily series, zoomed right out). */
export const MAX_VIRTUAL_OCCURRENCES = 400

/** A computed occurrence's id: "v:<series>@<date>". */
export const virtualId = (seriesId: string, date: string) => `v:${seriesId}@${date}`

/** The series and date a computed occurrence's id names, or null. */
export function parseVirtualId(id: string): { seriesId: string; date: string } | null {
  const m = /^v:(.+)@(\d{4}-\d{2}-\d{2})$/.exec(id)
  return m ? { seriesId: m[1], date: m[2] } : null
}

/**
 * Occurrences between `from` and `to` that aren't stored (past the horizon), computed for the
 * timeline: for each running series, every date it runs on whose occurrence is still ahead of
 * `now` and has no instant yet. Shown only (`virtual`); never stored unless tapped.
 */
export function virtualOccurrences(groups: readonly GroupRecord[], instants: readonly InstantRecord[], now: number, from: number, to: number): InstantRecord[] {
  const have = new Set(instants.filter(isOccurrence).map(i => `${i.seriesId}@${i.occurrence}`))
  const out: InstantRecord[] = []
  const last = dateKey(to)
  for (const s of groups) {
    if (s.kind !== 'series' || s.paused) continue
    const first = dateKey(Math.max(from, now))
    for (let date = first < s.from ? s.from : first; date <= last && out.length < MAX_VIRTUAL_OCCURRENCES; date = nextDateKey(date)) {
      if (s.until && date > s.until) break
      if (have.has(`${s.id}@${date}`) || !occursOn(s, date)) continue
      const ts = occurrenceTs(s, date)
      if (ts <= now || ts < from || ts > to) continue
      const id = virtualId(s.id, date)
      out.push({
        id,
        tsEpochMs: ts,
        label: s.label,
        ...(s.alarms.length > 0 ? { alarms: s.alarms.map((offsetMs, k) => ({ id: `${id}#${k}`, offsetMs })) } : {}),
        seriesId: s.id,
        occurrence: date,
        virtual: true,
      })
    }
  }
  return out
}

/** A new occurrence instant for `date`, with the series' alarms. */
export function newOccurrence(s: SeriesRecord, date: string, ids: { instant: () => string; alarm: () => string }): InstantRecord {
  return {
    id: ids.instant(),
    tsEpochMs: occurrenceTs(s, date),
    label: s.label,
    favorite: false,
    ...(s.alarms.length > 0 ? { alarms: s.alarms.map(offsetMs => ({ id: ids.alarm(), offsetMs })) } : {}),
    seriesId: s.id,
    occurrence: date,
  }
}

/**
 * The occurrences to make: for each running series, every date it runs on from now (never
 * before: no back-filling the past) to `until`, that has no occurrence yet.
 */
export function planOccurrences(
  groups: readonly GroupRecord[],
  instants: readonly InstantRecord[],
  now: number,
  until: number,
  ids: { instant: () => string; alarm: () => string },
): InstantRecord[] {
  const have = new Set(instants.filter(isOccurrence).map(i => `${i.seriesId}@${i.occurrence}`))
  const out: InstantRecord[] = []
  const last = dateKey(until)
  for (const s of groups) {
    if (s.kind !== 'series' || s.paused) continue
    for (let date = dateKey(now) < s.from ? s.from : dateKey(now); date <= last; date = nextDateKey(date)) {
      if (s.until && date > s.until) break
      if (have.has(`${s.id}@${date}`) || !occursOn(s, date)) continue
      const ts = occurrenceTs(s, date)
      if (ts <= now || ts > until) continue
      out.push(newOccurrence(s, date, ids))
    }
  }
  return out
}

/**
 * The series' occurrences that a rule change remakes: those still ahead, never edited on their
 * own, and with no alarm answered yet (anything touched stays as it is).
 */
export function remakeable(s: SeriesRecord, instants: readonly InstantRecord[], now: number): InstantRecord[] {
  return instants.filter(i => i.seriesId === s.id && i.tsEpochMs > now && !i.seriesEdited && !i.alarms?.some(a => a.answered))
}

/**
 * An untouched occurrence after its series' rule changed: its new time, name and alarms (alarms
 * at an offset it already had keep their ids), or null when it should go (the series no longer
 * runs on its date, is paused, or its new time has already passed).
 */
export function refreshOccurrence(s: SeriesRecord, inst: InstantRecord, now: number, newAlarmId: () => string): InstantRecord | null {
  if (s.paused || !inst.occurrence || !occursOn(s, inst.occurrence)) return null
  const ts = occurrenceTs(s, inst.occurrence)
  if (ts <= now) return null
  const old = [...(inst.alarms ?? [])]
  const alarms = s.alarms.map(offsetMs => {
    const k = old.findIndex(a => a.offsetMs === offsetMs && !a.snoozeOf)
    const keep = k >= 0 ? old.splice(k, 1)[0] : null
    return { id: keep?.id ?? newAlarmId(), offsetMs }
  })
  const { alarms: _drop, ...rest } = inst
  void _drop
  return { ...rest, tsEpochMs: ts, label: s.label, ...(alarms.length > 0 ? { alarms } : {}) }
}

/** The rule parts an occurrence carries: its name, time of day and alarms (not its snoozes). */
export function ruleFromOccurrence(inst: InstantRecord): Pick<SeriesRecord, 'label' | 'time' | 'alarms'> {
  return {
    label: inst.label,
    time: clockKey(inst.tsEpochMs),
    alarms: (inst.alarms ?? []).filter(a => !a.snoozeOf).map(a => a.offsetMs).sort((a, b) => b - a),
  }
}

/** A new series that `inst` starts (it becomes the first occurrence). */
export function seriesFromInstant(inst: InstantRecord, repeat: Repeat, id = newGroupId()): SeriesRecord {
  return { id, kind: 'series', ...ruleFromOccurrence(inst), repeat, from: dateKey(inst.tsEpochMs) }
}

// ---------------------------------------------------------------------------
// Reading a rule

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS = [1, 2, 3, 4, 5]
export const WEEKENDS = [0, 6]
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && b.every(d => a.includes(d))

/** "Daily", "Weekdays", "Weekends", "Mon, Wed, Fri", "Every 3 days". */
export function describeRepeat(r: Repeat): string {
  if (r.kind === 'interval') return r.every <= 1 ? 'Daily' : `Every ${r.every} days`
  if (sameDays(r.days, EVERY_DAY)) return 'Daily'
  if (sameDays(r.days, WEEKDAYS)) return 'Weekdays'
  if (sameDays(r.days, WEEKENDS)) return 'Weekends'
  return [...r.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_NAMES[d]).join(', ')
}

/** The same, short, for tight spots: "Daily", "Wkdays", "Wkends", "MWF", "Every 3d". */
export function describeRepeatShort(r: Repeat): string {
  if (r.kind === 'interval') return r.every <= 1 ? 'Daily' : `Every ${r.every}d`
  if (sameDays(r.days, EVERY_DAY)) return 'Daily'
  if (sameDays(r.days, WEEKDAYS)) return 'Wkdays'
  if (sameDays(r.days, WEEKENDS)) return 'Wkends'
  const letters = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa']
  return [...r.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => letters[d]).join('')
}

// ---------------------------------------------------------------------------
// Storage

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
/** "HH:MM", 24-hour. */
export const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function sanitizeRepeat(raw: unknown): Repeat | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind === 'interval' && typeof r.every === 'number' && Number.isInteger(r.every) && r.every >= 1 && r.every <= 365) return { kind: 'interval', every: r.every }
  if (r.kind === 'weekly' && Array.isArray(r.days)) {
    const days = [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))]
    return days.length > 0 ? { kind: 'weekly', days } : null
  }
  return null
}

/** The well-formed groups in untrusted JSON (storage or an imported file). */
export function sanitizeGroups(data: unknown): GroupRecord[] {
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  return data.flatMap((x): GroupRecord[] => {
    if (!x || typeof x !== 'object') return []
    const r = x as Record<string, unknown>
    const repeat = sanitizeRepeat(r.repeat)
    if (r.kind !== 'series' || typeof r.id !== 'string' || seen.has(r.id) || !repeat) return []
    if (typeof r.time !== 'string' || !CLOCK_RE.test(r.time) || typeof r.from !== 'string' || !DATE_KEY.test(r.from)) return []
    seen.add(r.id)
    const alarms = Array.isArray(r.alarms) ? r.alarms.filter((a): a is number => typeof a === 'number' && Number.isFinite(a) && a >= 0) : []
    const skips = Array.isArray(r.skips) ? r.skips.filter((d): d is string => typeof d === 'string' && DATE_KEY.test(d)) : []
    return [{
      id: r.id,
      kind: 'series',
      label: typeof r.label === 'string' ? r.label : '',
      time: r.time,
      repeat,
      alarms,
      from: r.from,
      ...(typeof r.until === 'string' && DATE_KEY.test(r.until) ? { until: r.until } : {}),
      ...(skips.length > 0 ? { skips } : {}),
      ...(r.paused === true ? { paused: true } : {}),
    }]
  })
}
