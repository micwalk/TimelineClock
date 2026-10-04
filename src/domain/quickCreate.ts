// Pure logic for the Stopwatch and Timer buttons: they are quick ways to make ordinary
// instants and spans, so all this decides is times, labels and which marks to keep.
import { HOUR, MINUTE, SECOND } from './time.ts'

/** Timer presets offered under the recent durations, in minutes. */
export const TIMER_PRESETS_MS = [1, 3, 5, 10, 15, 25, 30, 60].map(m => m * MINUTE)
/** How many recently used timer durations to remember. */
export const MAX_RECENT_TIMERS = 3
/** Longest timer: matches the hh:mm:ss input's 99 hours. */
export const MAX_TIMER_MS = 99 * HOUR + 59 * MINUTE + 59 * SECOND

/**
 * A typed timer length: "13" (minutes), "13m", "90s", "1h30", "1h 30m", "1:30" (m:ss),
 * "1:30:00" (h:mm:ss). Null when it isn't one, is zero, or is too long.
 */
export function parseTimerInput(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (t === '') return null
  let ms: number
  if (/^\d+(\.\d+)?$/.test(t)) ms = Number(t) * MINUTE
  else if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
    const parts = t.split(':').map(Number)
    if (parts.slice(1).some(p => p > 59)) return null
    const [h, m, s] = parts.length === 3 ? parts : [0, ...parts]
    ms = h * HOUR + m * MINUTE + s * SECOND
  } else {
    let u = t.replace(/(hours?|hrs?)/g, 'h').replace(/(minutes?|mins?)/g, 'm').replace(/(seconds?|secs?)/g, 's').replace(/\s+/g, '')
    if (/h\d+$/.test(u)) u += 'm' // "1h30"
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(u)
    if (!m || (!m[1] && !m[2] && !m[3])) return null
    ms = Number(m[1] ?? 0) * HOUR + Number(m[2] ?? 0) * MINUTE + Number(m[3] ?? 0) * SECOND
  }
  ms = Math.round(ms / SECOND) * SECOND
  return ms > 0 && ms <= MAX_TIMER_MS ? ms : null
}

/** A timer length for buttons and labels: "13m", "1h 30m", "1m 30s", "45s". */
export function formatTimerLength(ms: number): string {
  const h = Math.floor(ms / HOUR)
  const m = Math.floor((ms % HOUR) / MINUTE)
  const s = Math.floor((ms % MINUTE) / SECOND)
  const parts = [h ? `${h}h` : '', m ? `${m}m` : '', s ? `${s}s` : ''].filter(Boolean)
  return parts.length ? parts.join(' ') : '0s'
}

/** The picker's choices: recent durations first, then the presets not already listed. */
export function timerChoices(recents: readonly number[]): { recent: number[]; presets: number[] } {
  const recent = recents.slice(0, MAX_RECENT_TIMERS)
  return { recent, presets: TIMER_PRESETS_MS.filter(p => !recent.includes(p)) }
}

/** Remembers a used duration: most recent first, no repeats. */
export function pushRecentTimer(recents: readonly number[], ms: number): number[] {
  return [ms, ...recents.filter(r => r !== ms)].slice(0, MAX_RECENT_TIMERS)
}

/** Untrusted stored recents with junk dropped. */
export function sanitizeRecentTimers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= MAX_TIMER_MS).slice(0, MAX_RECENT_TIMERS)
}

// ---------------------------------------------------------------------------
// Stopwatch

/**
 * The stopwatch button's state. `marks` are its instants in order: start, laps, and the
 * stop when `stopped`. Idle when there are none.
 */
export interface StopwatchState {
  marks: string[]
  stopped: boolean
}

export const IDLE_STOPWATCH: StopwatchState = { marks: [], stopped: false }

export type StopwatchPhase = 'idle' | 'running' | 'stopped'

export const stopwatchPhase = (s: StopwatchState): StopwatchPhase =>
  (s.marks.length === 0 ? 'idle' : s.stopped ? 'stopped' : 'running')

/** Untrusted stored state with junk dropped. */
export function sanitizeStopwatch(raw: unknown): StopwatchState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const marks = Array.isArray(r.marks) ? r.marks.filter((x): x is string => typeof x === 'string') : []
  return { marks, stopped: marks.length > 1 && r.stopped === true }
}

/** Keeps only the marks that still exist (the user may delete them); a stopwatch left with none is idle. */
export function pruneStopwatch(s: StopwatchState, exists: (id: string) => boolean): StopwatchState {
  const marks = s.marks.filter(exists)
  if (marks.length === s.marks.length) return s
  return marks.length === 0 ? IDLE_STOPWATCH : { marks, stopped: s.stopped && marks.length > 1 }
}

/** Names: "Stopwatch", "Lap 1", "Lap 2", …; the stop is "Stop". */
export const stopwatchStartLabel = 'Stopwatch'
export const stopwatchStopLabel = 'Stop'
export const lapLabel = (n: number) => `Lap ${n}`
/** The span a lap or the stop closes: "Lap n" (the first lap is lap 1); with no laps, the whole run is "Stopwatch". */
export const closedSpanLabel = (marksBefore: number, stopping: boolean) =>
  (stopping && marksBefore === 1 ? stopwatchStartLabel : lapLabel(marksBefore))
