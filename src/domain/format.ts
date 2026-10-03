// Pure formatting/parsing helpers for times and durations.
import { DAY, HOUR, MINUTE, SECOND } from './time.ts'
import { displayName } from './entities.ts'
import { snoozeBaseLabel } from './alarms.ts'

const pad2 = (n: number) => n.toString().padStart(2, '0')

/** "hh:mm:ss AM" in local time. */
export function formatClock12h(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours()
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${pad2(displayHour)}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${h >= 12 ? 'PM' : 'AM'}`
}

/**
 * Duration as "D days, hh:mm:ss", "hh:mm:ss", "mm:ss", or "00:ss.mmm" (under a minute).
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
  return `00:${pad2(seconds)}.${rest.toString().padStart(3, '0')}`
}

/** True when formatDurationHMS would show milliseconds (so the text changes every frame). */
export const durationShowsMillis = (ms: number) => Math.abs(ms) < MINUTE

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

export function chipName(label: string): string {
  const m = /^Snooze (\d+): /.exec(label)
  if (!m) return displayName(label)
  return `${displayName(snoozeBaseLabel(label))} ?${m[1]}`
}

export const showsSeconds = (finestTickMs: number, thresholdMs: number): boolean => finestTickMs <= thresholdMs

