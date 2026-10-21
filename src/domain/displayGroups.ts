// Visibility by zoom (#10). Pure. One rule for every instant on the timeline: as you zoom out it
// is a Label (its chip) out to one zoom, a Mark (a short line from the axis, no chip) out to a
// wider one, then Hidden; zooming back in brings it back. "Zoom" is how much time is on screen.
// An instant's own visibility (its eye) wins; else its group's (a repeat's occurrences, the
// computed sun times, unnamed instants: set in the Groups tab); else what it gets by itself
// (domain/reach). What you are working with (selected, focused, ringing...) keeps its label.
// A threshold is one of the ladder's stops or, with snapping off, any time on screen (ms).
import type { InstantRecord } from './entities.ts'
import { formatDurationShort } from './format.ts'
import { DAY, HOUR, smoothstep } from './time.ts'

export type ZoomStop = 'hour' | '6h' | 'day' | '3d' | 'week' | 'month' | 'quarter' | 'year' | 'decade' | 'century' | 'always'
/** A threshold: a stop on the ladder, or any time on screen in ms (snapping off). */
export type ZoomValue = ZoomStop | number

/** The zoom ladder, closest first: how much time is on screen. The widest zoom shows 150 years. */
export const ZOOM_STOPS: readonly { stop: ZoomStop; ms: number; label: string; words: string }[] = [
  { stop: 'hour', ms: HOUR, label: '1h', words: 'an hour' },
  { stop: '6h', ms: 6 * HOUR, label: '6h', words: '6 hours' },
  { stop: 'day', ms: DAY, label: '1d', words: 'a day' },
  { stop: '3d', ms: 3 * DAY, label: '3d', words: '3 days' },
  { stop: 'week', ms: 7 * DAY, label: '1w', words: 'a week' },
  { stop: 'month', ms: 30 * DAY, label: '1mo', words: 'a month' },
  { stop: 'quarter', ms: 91 * DAY, label: '3mo', words: '3 months' },
  { stop: 'year', ms: 365 * DAY, label: '1y', words: 'a year' },
  { stop: 'decade', ms: 10 * 365 * DAY, label: '10y', words: '10 years' },
  { stop: 'century', ms: 100 * 365 * DAY, label: '100y', words: '100 years' },
  { stop: 'always', ms: Infinity, label: '∞', words: 'any zoom' },
]

const index = (s: ZoomStop) => ZOOM_STOPS.findIndex(z => z.stop === s)
const at = (i: number) => ZOOM_STOPS[Math.max(0, Math.min(ZOOM_STOPS.length - 1, i))].stop
/** The last finite stop's index (the one before ∞). */
const LAST_FINITE = ZOOM_STOPS.length - 2

/** A threshold's time on screen, ms (∞ for 'always'). */
export const msOf = (v: ZoomValue): number => (typeof v === 'number' ? v : ZOOM_STOPS[index(v)].ms)

/** How something shows by zoom: a Label up to `label` on screen, a Mark up to `mark`, Hidden beyond. */
export interface Visibility {
  label: ZoomValue
  mark: ZoomValue
}

/** Label (the chip), Mark (a line from the axis), or Hidden. */
export type Stage = 'label' | 'mark' | 'hidden'

/** The computed sunrises and sunsets. */
export const SUN_GROUP = 'sun'
/** Instants with no name (and no repeat, star or alarm to come): most of a busy history. */
export const UNNAMED_GROUP = 'unnamed'

/**
 * What each kind of group starts with: a repeat's occurrences Label up to 3 days, Mark up to 10
 * years; sunrises and sunsets Label up to 3 days, Mark up to a week (the sky shows them beyond);
 * unnamed instants Label up to a day, Mark up to 10 years.
 */
export function defaultVisibility(key: string): Visibility {
  if (key === SUN_GROUP) return { label: '3d', mark: 'week' }
  if (key === UNNAMED_GROUP) return { label: 'day', mark: 'decade' }
  return { label: '3d', mark: 'decade' }
}

export const groupVisibility = (key: string, prefs: Readonly<Record<string, Visibility>>): Visibility => prefs[key] ?? defaultVisibility(key)

/** The stage at `visibleMs` of time on screen. */
export function stageAt(v: Visibility, visibleMs: number): Stage {
  if (visibleMs <= msOf(v.label)) return 'label'
  if (visibleMs <= msOf(v.mark)) return 'mark'
  return 'hidden'
}

/** A mark fades out over the last stretch before it is hidden: its opacity (1 when never hidden). */
export function markFade(v: Visibility, visibleMs: number): number {
  const hide = msOf(v.mark)
  return Number.isFinite(hide) ? 1 - smoothstep(hide / 1.6, hide, visibleMs) : 1
}

/**
 * The recurring group an instant belongs to (its series, or the computed sun times), or null:
 * its visibility is always the group's, never its own.
 */
export function recurringGroupOf(i: InstantRecord): string | null {
  const g = displayGroupOf(i)
  return g && g !== UNNAMED_GROUP ? g : null
}

/** The group an instant follows: its series, the sun (computed ones), or Unnamed; null for none. */
export function displayGroupOf(i: InstantRecord): string | null {
  if (i.seriesId) return i.seriesId
  if (i.virtual && i.sun) return SUN_GROUP
  if (!i.label.trim() && !i.sun && !i.favorite) return UNNAMED_GROUP
  return null
}

// --- The ladder as a scale (the strips) -----------------------------------------------------

/** The ladder position of `visibleMs` (0 = an hour, 5 = a month, 7 = a year; fractional between stops, log scale). */
export function zoomPosition(visibleMs: number): number {
  if (visibleMs <= ZOOM_STOPS[0].ms) return 0
  for (let k = 0; k < LAST_FINITE; k++) {
    const a = ZOOM_STOPS[k].ms
    const b = ZOOM_STOPS[k + 1].ms
    if (visibleMs <= b) return k + Math.log(visibleMs / a) / Math.log(b / a)
  }
  return Number.isFinite(visibleMs) ? LAST_FINITE : LAST_FINITE + 1
}

/** A threshold's position on the ladder (∞ at the end). */
export const valuePosition = (v: ZoomValue) => (v === 'always' ? LAST_FINITE + 1 : zoomPosition(msOf(v)))

/**
 * The threshold at a ladder position: the nearest stop when snapping, else the time on screen
 * there (between stops, on the log scale); past half the last gap, ∞.
 */
export function valueAtPosition(p: number, snap: boolean): ZoomValue {
  const q = Math.max(0, Math.min(LAST_FINITE + 1, p))
  if (snap || q > LAST_FINITE + 0.5) return at(Math.round(q))
  if (q >= LAST_FINITE) return ZOOM_STOPS[LAST_FINITE].ms
  const k = Math.floor(q)
  const a = ZOOM_STOPS[k].ms
  const b = ZOOM_STOPS[k + 1].ms
  return Math.round(a * Math.pow(b / a, q - k))
}

/** Moves one threshold, keeping label ≤ mark (the other one gives way). */
export function setThreshold(v: Visibility, which: 'label' | 'mark', to: ZoomValue): Visibility {
  if (which === 'label') return { label: to, mark: msOf(v.mark) < msOf(to) ? to : v.mark }
  return { label: msOf(v.label) > msOf(to) ? to : v.label, mark: to }
}

/** "a day", "3 days", or a free value's length ("5d 3h"); a free value right on a stop reads as the stop. */
export function valueWords(v: ZoomValue): string {
  if (typeof v !== 'number') return ZOOM_STOPS[index(v)].words
  return ZOOM_STOPS.find(z => z.ms === v)?.words ?? formatDurationShort(v)
}

/** "Label up to a day, Mark up to a week, Hidden beyond" (the same words for instants and groups). */
export function describeVisibility(v: Visibility): string {
  if (v.label === 'always') return 'Label at any zoom'
  if (msOf(v.label) >= msOf(v.mark)) return `Label up to ${valueWords(v.label)}, Hidden beyond`
  return `Label up to ${valueWords(v.label)}, ${v.mark === 'always' ? 'Mark beyond, never Hidden' : `Mark up to ${valueWords(v.mark)}, Hidden beyond`}`
}

const STOPS: readonly string[] = ZOOM_STOPS.map(z => z.stop)
const isValue = (v: unknown): v is ZoomValue =>
  (typeof v === 'string' && STOPS.includes(v)) || (typeof v === 'number' && Number.isFinite(v) && v > 0)

/** One visibility from untrusted JSON (label past mark is pulled back to it), or null. Reads the old { full, mini } too. */
export function sanitizeVisibility(raw: unknown): Visibility | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const label = r.label ?? r.full
  const mark = r.mark ?? r.mini
  if (!isValue(label) || !isValue(mark)) return null
  return msOf(label) <= msOf(mark) ? { label, mark } : { label: mark, mark }
}

/** The groups' visibility settings in untrusted JSON, junk dropped. */
export function sanitizeGroupVisibility(raw: unknown): Record<string, Visibility> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, Visibility> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const d = sanitizeVisibility(v)
    if (d) out[k] = d
  }
  return out
}
