// Display groups (#10): how a group's instants show at each zoom. Pure.
//
// A group is a repeating series, the computed sunrises and sunsets, or the built-in Unnamed
// group (tags will be groups too, #8). Each has two thresholds on the zoom ladder below, read as
// how much time is on screen: up to `full` its instants are chips (crowded ones slide aside or
// fold into "+N", like any chips), up to `mini` they are gathered into a rhythm
// (short lines from the axis and one summary chip), and past it they are hidden. What you are
// working with (selected, focused, ringing...) always keeps its chip.
import type { InstantRecord } from './entities.ts'
import { DAY, HOUR, smoothstep } from './time.ts'

export type ZoomStop = 'hour' | '6h' | 'day' | '3d' | 'week' | 'month' | 'quarter' | 'year' | 'decade' | 'always'

/** The zoom ladder, closest first: how much time is on screen. The widest zoom shows 50 years. */
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
  { stop: 'always', ms: Infinity, label: '∞', words: 'any zoom' },
]

const index = (s: ZoomStop) => ZOOM_STOPS.findIndex(z => z.stop === s)
const at = (i: number) => ZOOM_STOPS[Math.max(0, Math.min(ZOOM_STOPS.length - 1, i))].stop

export interface GroupDisplay {
  /** Chips while the screen shows up to this much ('always': whenever they fit). */
  full: ZoomStop
  /** Gathered into a rhythm up to this much; hidden past it ('always': never hidden). */
  mini: ZoomStop
}

export type DisplayLevel = 'full' | 'mini' | 'hidden'

/** The computed sunrises and sunsets. */
export const SUN_GROUP = 'sun'
/** Instants with no name (and no repeat, star or alarm to come): most of a busy history. */
export const UNNAMED_GROUP = 'unnamed'

/**
 * What each kind of group starts with: repeats chips up to a week, gathered beyond, never hidden;
 * sunrises and sunsets chips up to 3 days, gathered to a week, gone beyond (the sky shows it);
 * unnamed instants chips up to a day, gathered beyond, never hidden (history is core).
 */
export function defaultDisplay(key: string): GroupDisplay {
  if (key === SUN_GROUP) return { full: '3d', mini: 'week' }
  if (key === UNNAMED_GROUP) return { full: 'day', mini: 'always' }
  return { full: 'week', mini: 'always' }
}

export const displayFor = (key: string, prefs: Readonly<Record<string, GroupDisplay>>): GroupDisplay => prefs[key] ?? defaultDisplay(key)

/** The level at `visibleMs` of time on screen. */
export function displayLevel(d: GroupDisplay, visibleMs: number): DisplayLevel {
  if (visibleMs <= ZOOM_STOPS[index(d.full)].ms) return 'full'
  if (visibleMs <= ZOOM_STOPS[index(d.mini)].ms) return 'mini'
  return 'hidden'
}

/** How opaque a gathered group is: it fades out over the last stretch before it is hidden (1 when never hidden). */
export function displayFade(d: GroupDisplay, visibleMs: number): number {
  const hide = ZOOM_STOPS[index(d.mini)].ms
  return Number.isFinite(hide) ? 1 - smoothstep(hide / 1.6, hide, visibleMs) : 1
}

/** The group an instant's chip follows: its series, the sun (computed ones), or Unnamed; null for none. */
export function displayGroupOf(i: InstantRecord): string | null {
  if (i.seriesId) return i.seriesId
  if (i.virtual && i.sun) return SUN_GROUP
  if (!i.label.trim() && !i.sun && !i.favorite) return UNNAMED_GROUP
  return null
}

// --- Setting the thresholds from where you are --------------------------------------------

/** The ladder position of `visibleMs` (0 = an hour, 5 = a month, 7 = a year, 8 = 10 years; fractional between stops, log scale). */
export function zoomPosition(visibleMs: number): number {
  const last = ZOOM_STOPS.length - 2 // the last finite stop
  if (visibleMs <= ZOOM_STOPS[0].ms) return 0
  for (let k = 0; k < last; k++) {
    const a = ZOOM_STOPS[k].ms
    const b = ZOOM_STOPS[k + 1].ms
    if (visibleMs <= b) return k + Math.log(visibleMs / a) / Math.log(b / a)
  }
  return last
}

/** Chips at this zoom: `full` reaches at least here (and `mini` with it). */
export function showChipsHere(d: GroupDisplay, visibleMs: number): GroupDisplay {
  const full = at(Math.ceil(zoomPosition(visibleMs) - 1e-9))
  return { full, mini: index(d.mini) < index(full) ? full : d.mini }
}

/** Gathered at this zoom: chips only closer in, hidden only further out. */
export function gatherHere(d: GroupDisplay, visibleMs: number): GroupDisplay {
  const p = zoomPosition(visibleMs)
  const below = Math.ceil(p - 1e-9) - 1 // the last stop closer than here
  const full = below < 0 ? 'hour' : index(d.full) > below ? at(below) : d.full
  const mini = index(d.mini) < Math.ceil(p - 1e-9) ? at(Math.ceil(p - 1e-9)) : d.mini
  return { full, mini }
}

/** Hidden at this zoom and further out. */
export function hideHere(d: GroupDisplay, visibleMs: number): GroupDisplay {
  const below = Math.max(0, Math.ceil(zoomPosition(visibleMs) - 1e-9) - 1)
  const mini = index(d.mini) > below ? at(below) : d.mini
  return { full: index(d.full) > index(mini) ? mini : d.full, mini }
}

/** Moves one threshold to a stop, keeping full ≤ mini (the other one gives way). */
export function setThreshold(d: GroupDisplay, which: 'full' | 'mini', stop: ZoomStop): GroupDisplay {
  if (which === 'full') return { full: stop, mini: index(d.mini) < index(stop) ? stop : d.mini }
  return { full: index(d.full) > index(stop) ? stop : d.full, mini: stop }
}

export const stopIndex = index

/** "Chips up to a day, gathered beyond, never hidden." */
export function describeDisplay(d: GroupDisplay): string {
  const f = ZOOM_STOPS[index(d.full)]
  const m = ZOOM_STOPS[index(d.mini)]
  if (d.full === 'always') return 'Chips at any zoom'
  if (d.full === d.mini) return `Chips up to ${f.words}, hidden beyond`
  return `Chips up to ${f.words}, gathered ${d.mini === 'always' ? 'beyond, never hidden' : `up to ${m.words}, hidden beyond`}`
}

const STOPS: readonly string[] = ZOOM_STOPS.map(z => z.stop)

/** The display settings in untrusted JSON, junk dropped. */
export function sanitizeGroupDisplay(raw: unknown): Record<string, GroupDisplay> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, GroupDisplay> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const { full, mini } = v as Record<string, unknown>
    if (typeof full !== 'string' || typeof mini !== 'string' || !STOPS.includes(full) || !STOPS.includes(mini)) continue
    out[k] = index(full as ZoomStop) <= index(mini as ZoomStop) ? { full: full as ZoomStop, mini: mini as ZoomStop } : { full: mini as ZoomStop, mini: mini as ZoomStop }
  }
  return out
}
