// Pure formatting/parsing helpers for times and durations.
import { MARKS } from '../config/labels.ts'
import { DAY, HOUR, MINUTE, SECOND } from './time.ts'
import { displayName } from './entities.ts'
import { parseSnoozeLabel } from './alarms.ts'

const pad2 = (n: number) => n.toString().padStart(2, '0')

/** "hh:mm:ss AM" in local time. */
export function formatClock12h(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours()
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${pad2(displayHour)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${h >= 12 ? 'PM' : 'AM'}`
}

/** Compact local clock for chips and tags: "6:00p", or "6:04:13p" with seconds. */
export function formatClockCompact(ts: number, withSeconds: boolean): string {
  const d = new Date(ts)
  const h = d.getHours()
  const hour = h % 12 === 0 ? 12 : h % 12
  const seconds = withSeconds ? `:${pad2(d.getSeconds())}` : ''
  return `${hour}:${pad2(d.getMinutes())}${seconds}${h >= 12 ? 'p' : 'a'}`
}

/**
 * How long ago or until, for chips: "now", "45s ago", "in 6m", "2h 5m ago", "3d 4h ago".
 * `deltaMs` is the event's time minus now (negative = past). Units are floored.
 */
export function formatRelativeShort(deltaMs: number): string {
  const abs = Math.abs(deltaMs)
  if (abs < SECOND) return 'now'
  const text = formatDurationShort(abs)
  return deltaMs < 0 ? `${text} ago` : `in ${text}`
}

/** Average month and year, for lengths (a length has no calendar: "6mo" is about 182 days). */
const MONTH_MS = 30.4375 * DAY
const YEAR_MS = 365.25 * DAY

/**
 * A length in its two largest units, floored: "45s", "26m", "1h 5m", "2d 3h"; from 60 days months
 * ("6mo 12d") and from a year years ("1y 2mo", "12y"). For tight spots like live-lane chips.
 */
export function formatDurationShort(ms: number): string {
  const abs = Math.abs(ms)
  if (abs >= 10 * YEAR_MS) return `${Math.floor(abs / YEAR_MS)}y`
  if (abs >= YEAR_MS) {
    const y = Math.floor(abs / YEAR_MS)
    const mo = Math.floor((abs - y * YEAR_MS) / MONTH_MS)
    return mo ? `${y}y ${mo}mo` : `${y}y`
  }
  if (abs >= 60 * DAY) {
    const mo = Math.floor(abs / MONTH_MS)
    const d = Math.floor((abs - mo * MONTH_MS) / DAY)
    return d ? `${mo}mo ${d}d` : `${mo}mo`
  }
  if (abs < MINUTE) return `${Math.floor(abs / SECOND)}s`
  if (abs < HOUR) return `${Math.floor(abs / MINUTE)}m`
  if (abs < DAY) {
    const h = Math.floor(abs / HOUR)
    const m = Math.floor((abs % HOUR) / MINUTE)
    return m ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(abs / DAY)
  const h = Math.floor((abs % DAY) / HOUR)
  return h ? `${d}d ${h}h` : `${d}d`
}

/** Text cut to `max` characters with an ellipsis: "Cooking" stays, "Making dinner" becomes "Making…" at 8. */
export const truncateText = (text: string, max: number): string =>
  (text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text)

/**
 * Duration as "D days, hh:mm:ss", "hh:mm:ss", "mm:ss", or "00:ss" (under a minute). Never shows milliseconds.
 * Negative input is treated as zero; callers handle the sign.
 */
export function formatDurationHMS(ms: number): string {
  let rest = Math.max(0, Math.floor(ms))
  const days = Math.floor(rest / DAY); rest -= days * DAY
  const hours = Math.floor(rest / HOUR); rest -= hours * HOUR
  const minutes = Math.floor(rest / MINUTE); rest -= minutes * MINUTE
  const seconds = Math.floor(rest / SECOND); rest -= seconds * SECOND
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}, ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  if (hours > 0) return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  if (minutes > 0) return `${pad2(minutes)}:${pad2(seconds)}`
  return `00:${pad2(seconds)}`
}

/** "+01:05:30", "-2 days, 03:00:00"; from 2 days the short form ("+45d 3h", "-6mo 12d"): seconds stop mattering. */
export function formatSignedDuration(ms: number): string {
  const abs = Math.abs(ms)
  return `${ms >= 0 ? '+' : '-'}${abs >= 2 * DAY ? formatDurationShort(abs) : formatDurationHMS(abs)}`
}

/** Coarser duration used in lists: never shows milliseconds; from 60 days months and years ("6mo 12d"). */
export function formatDurationCoarse(ms: number): string {
  const abs = Math.abs(ms)
  if (abs >= 60 * DAY) return formatDurationShort(abs)
  const days = Math.floor(abs / DAY)
  const rest = abs - days * DAY
  const hours = Math.floor(rest / HOUR)
  const minutes = Math.floor((rest % HOUR) / MINUTE)
  const seconds = Math.floor((rest % MINUTE) / SECOND)
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}, ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  if (hours > 0) return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  return `${pad2(minutes)}:${pad2(seconds)}`
}

export function formatRelativeCoarse(ms: number): string {
  return `${ms >= 0 ? '+' : '-'}${formatDurationCoarse(ms)}`
}

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
})
export const formatDateTime = (ts: number) => dateTimeFmt.format(ts)

const shortDateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
export const formatShortDate = (ts: number) => shortDateFmt.format(ts)

const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' })
const monthDayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** Half a year or more on screen: dates say their year even this year. */
export const YEAR_ZOOM_MS = 180 * DAY

/** "Sat, Oct 24", with the year when it isn't `now`'s or `withYear` ("Sat, Apr 3, 2027"). */
export function formatDayLabel(ts: number, now: number, withYear = false): string {
  const other = new Date(ts).getFullYear() !== new Date(now).getFullYear()
  return formatShortDate(ts) + (other || withYear ? `, ${yearFmt.format(ts)}` : '')
}

/** "Oct 24", with the year when it isn't `now`'s or `withYear` ("Oct 24, 2027"). */
export function formatMonthDay(ts: number, now: number, withYear = false): string {
  const other = new Date(ts).getFullYear() !== new Date(now).getFullYear()
  return monthDayFmt.format(ts) + (other || withYear ? `, ${yearFmt.format(ts)}` : '')
}

/**
 * How a chip states its time at a zoom (`visibleMs` on screen): the time ("7:20a"); with the date
 * from 2 days on screen ("Oct 24 7:20a"); only the date from 2 months ("Oct 24"); the year when it
 * isn't this year's or from half a year on screen ("Oct 24, 2027").
 */
export function formatChipTime(ts: number, now: number, visibleMs: number, withSeconds: boolean): string {
  if (visibleMs < 2 * DAY) return formatClockCompact(ts, withSeconds)
  const date = formatMonthDay(ts, now, visibleMs >= YEAR_ZOOM_MS)
  return visibleMs >= 60 * DAY ? date : `${date} ${formatClockCompact(ts, withSeconds)}`
}

/** Calendar days covered by [start, end], e.g. "Thu, Oct 2" or "Thu, Oct 2 – Sat, Oct 4". */
export function formatDateRange(start: number, end: number, now: number): string {
  const a = new Date(start)
  const b = new Date(end)
  const sameDay = a.toDateString() === b.toDateString()
  const yearSuffix = (d: Date) => (d.getFullYear() !== new Date(now).getFullYear() ? `, ${yearFmt.format(d)}` : '')
  const fa = formatShortDate(start) + yearSuffix(a)
  return sameDay ? fa : `${fa} – ${formatShortDate(end)}${yearSuffix(b)}`
}

// --- Time entry ---

/** "±hh:mm:ss" with a leading "-" only for negative values. */
export function formatDurationForInput(ms: number): string {
  const abs = Math.abs(ms)
  const h = Math.floor(abs / HOUR)
  const m = Math.floor((abs % HOUR) / MINUTE)
  const s = Math.floor((abs % MINUTE) / SECOND)
  return `${ms < 0 ? '-' : ''}${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

/** Parses "[+-]hh:mm:ss" (hours up to 99) into signed milliseconds. Throws on bad input. */
export function parseDurationInput(text: string): number {
  const negative = text.trim().startsWith('-')
  const parts = text.trim().replace(/^[+-]/, '').split(':')
  if (parts.length !== 3) throw new Error('Expected hh:mm:ss')
  const [h, m, s] = parts.map(p => Number.parseInt(p, 10))
  if ([h, m, s].some(Number.isNaN)) throw new Error('Invalid time values')
  if (h > 99 || m > 59 || s > 59 || h < 0 || m < 0 || s < 0) throw new Error('Time values out of range')
  const total = h * HOUR + m * MINUTE + s * SECOND
  return negative ? -total : total
}

/** Converts a 12h clock reading into 24h hours. */
export function to24h(hour12: number, pm: boolean): number {
  const h = hour12 % 12
  return pm ? h + 12 : h
}

/** Same calendar day as `dayOf`, at the given local wall-clock time. */
export function atClockTimeOnDay(dayOf: number, hours24: number, minutes: number, seconds: number): number {
  const d = new Date(dayOf)
  d.setHours(hours24, minutes, seconds, 0)
  return d.getTime()
}

/** Marks a snooze in short names: "Test Alarm ⟲2" (config/labels). */
export const SNOOZE_MARK = MARKS.snooze

/** An instant's name as shown on its timeline chip; snoozes become "Base ⟲N". */
export function chipName(label: string): string {
  const snooze = parseSnoozeLabel(label)
  return snooze ? `${displayName(snooze.base)} ${SNOOZE_MARK}${snooze.count}` : displayName(label)
}

/** Saved chips show seconds only when the finest visible tick is shorter than `thresholdMs`. */
export const showsSeconds = (finestTickMs: number, thresholdMs: number): boolean => finestTickMs < thresholdMs


// ---------------------------------------------------------------------------
// Durations at the granularity that matters. One rule for every length the timeline shows
// (span readings, live lanes, alarm offsets, the stopwatch): the finest of
//   - what the zoom can resolve: a unit spanning at least DURATION_UNIT_PX on screen;
//   - what the length calls for: under a minute shows ms (a stopwatch's first lap), under an
//     hour seconds, so short spans never read as a bare "1m";
//   - for a snapped or typed value (an alarm's offset: `exact`), what the value holds, so 1m 30s
//     never reads "1m". Exact values skip the length rule: 15 minutes stays "15m".

/** Units a duration is shown to, coarsest first: minutes ("26m"), seconds, tenths, ms. */
export type DurationStep = typeof MINUTE | typeof SECOND | 100 | 1

/** How many px of the time axis one unit should span before the zoom shows it. */
const DURATION_UNIT_PX = 30

/** The finest unit the zoom resolves (no zoom: minutes). */
function zoomStep(msPerPx: number | undefined): DurationStep {
  if (msPerPx === undefined) return MINUTE
  const unit = msPerPx * DURATION_UNIT_PX
  return unit >= MINUTE ? MINUTE : unit >= SECOND ? SECOND : unit >= 100 ? 100 : 1
}

/** The finest unit a value holds: 90s holds seconds, 1.5s tenths. */
function exactStep(abs: number): DurationStep {
  const t = Math.round(abs)
  return t % 100 ? 1 : t % SECOND ? 100 : t % MINUTE ? SECOND : MINUTE
}

/** The finest unit a duration is shown to (see above). `msPerPx`: the zoom; `exact`: a snapped or typed value. */
export function durationStep(ms: number, o: { msPerPx?: number; exact?: boolean } = {}): DurationStep {
  const abs = Math.abs(ms)
  const byValue: DurationStep = o.exact ? exactStep(abs) : abs < MINUTE ? 1 : abs < HOUR ? SECOND : MINUTE
  return Math.min(zoomStep(o.msPerPx), byValue) as DurationStep
}

/** A length to a unit: "26m" / "1h 5m" (minutes), "26:13" / "1:05:13" (seconds), "26:13.4", "0:04.050". */
export function formatDurationTo(ms: number, step: DurationStep): string {
  const abs = Math.abs(ms)
  if (step >= MINUTE) return formatDurationShort(abs)
  const t = Math.floor(abs / step) * step
  const h = Math.floor(t / HOUR)
  const m = Math.floor((t % HOUR) / MINUTE)
  const s = Math.floor((t % MINUTE) / SECOND)
  const frac = step === SECOND ? '' : step === 100 ? `.${Math.floor((t % SECOND) / 100)}` : `.${(t % SECOND).toString().padStart(3, '0')}`
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}${frac}` : `${m}:${pad2(s)}${frac}`
}

/** A length at the granularity that matters (durationStep). */
export const formatDuration = (ms: number, o: { msPerPx?: number; exact?: boolean } = {}): string =>
  formatDurationTo(ms, durationStep(ms, o))

/** A live span's length at this zoom (formatDuration): "1h 5m" zoomed out, "26:13", "26:13.4", "26:13.457". */
export const formatLiveSpan = (ms: number, msPerPx: number): string => formatDuration(ms, { msPerPx })
