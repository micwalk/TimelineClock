// Pure formatting/parsing helpers for times and durations.
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

/** A length in its two largest units, floored: "45s", "26m", "1h 5m", "2d 3h". For tight spots like live-lane chips. */
export function formatDurationShort(ms: number): string {
  const abs = Math.abs(ms)
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

export function formatSignedDuration(ms: number): string {
  return `${ms >= 0 ? '+' : '-'}${formatDurationHMS(Math.abs(ms))}`
}

/** Coarser duration used in lists: never shows milliseconds. */
export function formatDurationCoarse(ms: number): string {
  const abs = Math.abs(ms)
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

/** Marks a snooze in short names: "Test Alarm ⟲2". */
export const SNOOZE_MARK = '⟲'

/** An instant's name as shown on its timeline chip; snoozes become "Base ⟲N". */
export function chipName(label: string): string {
  const snooze = parseSnoozeLabel(label)
  return snooze ? `${displayName(snooze.base)} ${SNOOZE_MARK}${snooze.count}` : displayName(label)
}

/** Saved chips show seconds only when the finest visible tick is shorter than `thresholdMs`. */
export const showsSeconds = (finestTickMs: number, thresholdMs: number): boolean => finestTickMs < thresholdMs

