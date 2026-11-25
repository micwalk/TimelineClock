// The cursor says no more than the zoom can tell (owner 2026-11-25). Pure.
//
// The cursor is a point picked by a finger or a pan, so it is only as precise as a few pixels:
// zoomed out so a pixel is minutes, "3:41:27p" and "Now +2 days, 01:13:09" are false precision.
// Its time and its offsets are shown to the finest unit that spans `unitPx` pixels at the
// current zoom (the `cursorUnitPx` tunable), on a ladder: 1s, 5s, 15s, 1m, 5m, 15m, 1h, days,
// months, years; an instant it is about to land on keeps its exact time.
//
// Lengths of days and more follow the calendar, as people count them, from the two ends (which
// the cursor always has: Now or the selected instant, and itself): Mon 10p to Thu midnight is 50
// hours but "3d" (three midnights crossed), and month and year counts are calendar months
// ("+2y 5mo" for about 900 days). Under day precision a length is elapsed time ("+2d 2h").
import { formatClockCompact, formatDurationHMS } from './format.ts'
import { DAY, HOUR, MINUTE, SECOND } from './time.ts'

/** How finely the cursor speaks, in ms: a step of the ladder below (`MONTH_MS`, `YEAR_MS` for months and years). */
export type CursorUnit = number

const MONTH_MS = 30.4375 * DAY
const YEAR_MS = 365.25 * DAY
/** The steps, finest first: 1s, 5s, 15s, 1m, 5m, 15m, 1h, then days, months, years. */
const LADDER: readonly number[] = [SECOND, 5 * SECOND, 15 * SECOND, MINUTE, 5 * MINUTE, 15 * MINUTE, HOUR, DAY, MONTH_MS, YEAR_MS]
export const CURSOR_DAY = DAY
export const CURSOR_MONTH = MONTH_MS
export const CURSOR_YEAR = YEAR_MS

/** The finest step that spans at least `unitPx` pixels at `msPerPx`. */
export function cursorUnit(msPerPx: number, unitPx: number): CursorUnit {
  const need = msPerPx * unitPx
  return LADDER.find(ms => ms >= need) ?? YEAR_MS
}

/** `ts` rounded to the nearest `step` within its hour (local time; whole hours from local midnight). */
function roundTo(ts: number, step: number): number {
  const d = new Date(ts)
  const base = step >= HOUR ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime()
  return base + Math.round((ts - base) / step) * step
}

/** The cursor's clock: "3:41:35p", "3:45p", "4p"; "" once hours aren't told apart (the date line says the day). */
export function cursorClock(ts: number, unit: CursorUnit): string {
  if (unit < MINUTE) return formatClockCompact(roundTo(ts, unit), true)
  if (unit < HOUR) return formatClockCompact(roundTo(ts, unit), false)
  if (unit < DAY) return formatClockCompact(roundTo(ts, HOUR), false).replace(':00', '')
  return ''
}

const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' })

/** The cursor's date line at month or year precision ("Nov 2026", "2026"); null: the usual day label. */
export function cursorCoarseDate(ts: number, unit: CursorUnit): string | null {
  if (unit === MONTH_MS) {
    // Nearest month: past the 15th reads as the next.
    const d = new Date(ts)
    return monthYearFmt.format(new Date(d.getFullYear(), d.getMonth() + (d.getDate() > 15 ? 1 : 0), 1))
  }
  if (unit >= YEAR_MS) {
    const d = new Date(ts)
    return yearFmt.format(new Date(d.getFullYear() + (d.getMonth() >= 6 ? 1 : 0), 0, 1))
  }
  return null
}

/** Local midnight of `ts`'s day. */
const dayStart = (ts: number) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }

/** Midnights crossed from `a` to `b` (b ≥ a): calendar days, whatever the hours. */
export function calendarDays(a: number, b: number): number {
  // Rounded: a day across a clock change is 23 or 25 hours.
  return Math.round((dayStart(b) - dayStart(a)) / DAY)
}

/** Whole calendar months from `a` to `b` (b ≥ a), and the days left after them. */
export function calendarMonths(a: number, b: number): { months: number; days: number } {
  const da = new Date(a)
  const db = new Date(b)
  let months = (db.getFullYear() - da.getFullYear()) * 12 + db.getMonth() - da.getMonth()
  const landed = (m: number) => new Date(da.getFullYear(), da.getMonth() + m, Math.min(da.getDate(), daysIn(da.getFullYear(), da.getMonth() + m))).getTime()
  if (months > 0 && landed(months) > dayStart(b)) months--
  return { months, days: calendarDays(landed(months), b) }
}

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

/** Elapsed time rounded to `step`, in its two largest units down to the step's unit: "2h 5m", "2d 2h", "45s"; "" when it rounds to nothing. */
function elapsed(ms: number, step: number): string {
  const t = Math.round(ms / step) * step
  if (t === 0) return ''
  const parts: [number, string][] = [[Math.floor(t / DAY), 'd'], [Math.floor((t % DAY) / HOUR), 'h'], [Math.floor((t % HOUR) / MINUTE), 'm'], [Math.floor((t % MINUTE) / SECOND), 's']]
  const finest = step < MINUTE ? 3 : step < HOUR ? 2 : 1
  let first = parts.findIndex(([n]) => n > 0)
  if (first < 0 || first > finest) first = finest
  const shown = [parts[first], ...(first < finest && parts[first + 1][0] > 0 ? [parts[first + 1]] : [])]
  return shown.map(([n, u]) => `${n}${u}`).join(' ')
}

/**
 * How far the cursor is from `from` (Now, the selected instant), signed, to `unit`; "" when it
 * rounds to nothing (it is there, at this zoom). At second precision as the tag always read
 * ("+01:05:30", "-2 days, 03:00:00"); minutes and hours elapsed ("+1h 5m", "+2d 2h"); days and
 * coarser by the calendar ("+3d", "+5mo 12d", "+2y 5mo", "+12y").
 */
export function cursorOffset(from: number, to: number, unit: CursorUnit): string {
  const sign = to >= from ? '+' : '-'
  const [a, b] = to >= from ? [from, to] : [to, from]
  const ms = b - a
  if (unit < MINUTE) {
    const t = Math.round(ms / unit) * unit
    if (t === 0) return ''
    return `${sign}${ms >= 2 * DAY ? elapsed(ms, HOUR) : formatDurationHMS(t)}`
  }
  if (unit < DAY) {
    // Past two days, minutes stop mattering.
    const text = elapsed(ms, ms >= 2 * DAY ? Math.max(unit, HOUR) : unit)
    return text ? `${sign}${text}` : ''
  }
  // Days and coarser: count the calendar from the earlier end.
  const days = calendarDays(a, b)
  if (unit < MONTH_MS && days < 60) return days === 0 ? '' : `${sign}${days}d`
  const { months, days: rest } = calendarMonths(a, b)
  const y = Math.floor(months / 12)
  const mo = months % 12
  if (unit >= YEAR_MS || y >= 10) {
    const years = Math.round((months + rest / 30) / 12)
    return years === 0 ? '' : `${sign}${years}y`
  }
  if (y > 0) {
    const mos = unit >= MONTH_MS ? Math.round(mo + rest / 30) : mo
    return mos === 0 ? `${sign}${y}y` : mos === 12 ? `${sign}${y + 1}y` : `${sign}${y}y ${mos}mo`
  }
  if (unit >= MONTH_MS) {
    const mos = Math.round(months + rest / 30)
    return mos === 0 ? '' : `${sign}${mos}mo`
  }
  return rest ? `${sign}${months}mo ${rest}d` : `${sign}${months}mo`
}

/** Whether a unit is finer than days (the clock line still shows). */
export const showsClock = (unit: CursorUnit) => unit < DAY
