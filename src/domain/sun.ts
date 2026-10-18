// The sun, offline (TLC-6, #11): its altitude through the day from a latitude and longitude
// (NOAA's solar equations: about a minute's accuracy, which is plenty for shading and
// sunrise/sunset), and the sky stops the timeline's background is drawn from.
import { LABELS } from '../config/labels.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

export interface GeoPoint {
  /** Degrees north. */
  lat: number
  /** Degrees east. */
  lon: number
}

const RAD = Math.PI / 180

/** Julian centuries since J2000 for an epoch time. */
const julianCentury = (ts: number) => (ts / DAY + 2440587.5 - 2451545) / 36525

/** The sun's declination (radians) and the equation of time (minutes) at `ts`. */
function solarParams(ts: number): { decl: number; eqTime: number } {
  const T = julianCentury(ts)
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * T
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
  const y = Math.tan((eps * RAD) / 2) ** 2
  const eqTime =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD))
  return { decl, eqTime }
}

/** The sun's altitude above the horizon at `ts`, in degrees (no refraction). */
export function sunAltitude(ts: number, p: GeoPoint): number {
  const { decl, eqTime } = solarParams(ts)
  const utcMinutes = (((ts % DAY) + DAY) % DAY) / MINUTE
  const solarMinutes = utcMinutes + eqTime + 4 * p.lon
  const hourAngle = (solarMinutes / 4 - 180) * RAD
  const lat = p.lat * RAD
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD
}

/** The solar noon nearest `ts` (refined once, so the equation of time is taken at noon itself). */
export function solarNoonNear(ts: number, p: GeoPoint): number {
  let noon = ts
  for (let i = 0; i < 2; i++) {
    const { eqTime } = solarParams(noon)
    const utcNoonMinutes = 720 - 4 * p.lon - eqTime
    const dayStart = Math.round((noon - utcNoonMinutes * MINUTE) / DAY) * DAY
    noon = dayStart + utcNoonMinutes * MINUTE
  }
  return noon
}

/**
 * How long before and after `noon` the sun crosses `altitude` degrees: half the time it
 * spends above it, refined at the crossing. `'above'` if it never goes below it that day,
 * `'below'` if it never reaches it.
 */
function halfArcMs(noon: number, p: GeoPoint, altitude: number, side: -1 | 1): number | 'above' | 'below' {
  let t = noon
  let half = 0
  for (let i = 0; i < 3; i++) {
    const { decl } = solarParams(t)
    const lat = p.lat * RAD
    const cosH = (Math.sin(altitude * RAD) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl))
    if (cosH <= -1) return 'above'
    if (cosH >= 1) return 'below'
    half = (Math.acos(cosH) / RAD) * 4 * MINUTE // 1° of hour angle = 4 minutes
    t = noon + side * half
  }
  return half
}

/** Sunrise altitude: the sun's upper edge on the horizon, with average refraction. */
export const SUNRISE_ALT = -0.833

export interface SunDay {
  noon: number
  /** Undefined when the sun doesn't cross that altitude that day (polar day or night). */
  sunrise?: number
  sunset?: number
  civilDawn?: number
  civilDusk?: number
  nauticalDawn?: number
  nauticalDusk?: number
  astronomicalDawn?: number
  astronomicalDusk?: number
}

/** Sunrise, sunset and the twilights around the solar noon nearest `ts`. */
export function sunDay(ts: number, p: GeoPoint): SunDay {
  const noon = solarNoonNear(ts, p)
  const day: SunDay = { noon }
  const at = (alt: number, side: -1 | 1) => {
    const h = halfArcMs(noon, p, alt, side)
    return typeof h === 'number' ? noon + side * h : undefined
  }
  day.sunrise = at(SUNRISE_ALT, -1)
  day.sunset = at(SUNRISE_ALT, 1)
  day.civilDawn = at(-6, -1)
  day.civilDusk = at(-6, 1)
  day.nauticalDawn = at(-12, -1)
  day.nauticalDusk = at(-12, 1)
  day.astronomicalDawn = at(-18, -1)
  day.astronomicalDusk = at(-18, 1)
  return day
}

// --- The sky behind the timeline -------------------------------------------------------

/**
 * One colour of the sky, named for the sun's altitude where it is pure (theme.css
 * `--sky-<key>`): midnight (the night's darkest, a shade under `dark`), dark (−18°, the end
 * of astronomical twilight), astro (−12°), nautical (−6°), horizon (sunrise and sunset), day
 * (+6°, past the golden hour) and noon (the day's brightest, a shade over `day`).
 */
export type SkyKey = 'midnight' | 'dark' | 'astro' | 'nautical' | 'horizon' | 'day' | 'noon'

export interface SkyStop {
  t: number
  key: SkyKey
}

/** The altitudes the sky changes colour at, lowest first. */
const SKY_BANDS: { alt: number; key: SkyKey }[] = [
  { alt: -18, key: 'dark' },
  { alt: -12, key: 'astro' },
  { alt: -6, key: 'nautical' },
  { alt: SUNRISE_ALT, key: 'horizon' },
  { alt: 6, key: 'day' },
]

/** The colour at an altitude that may not reach a band's edge (noon in polar night, midnight in polar day). */
function keyAtAltitude(alt: number, extreme: 'noon' | 'midnight'): SkyKey {
  if (extreme === 'noon' && alt >= SKY_BANDS[SKY_BANDS.length - 1].alt) return 'noon'
  if (extreme === 'midnight' && alt <= SKY_BANDS[0].alt) return 'midnight'
  // The nearest band edge on the inner side: a polar noon at −8° is between astro and nautical.
  let best = SKY_BANDS[0]
  for (const b of SKY_BANDS) if (Math.abs(b.alt - alt) < Math.abs(best.alt - alt)) best = b
  return best.key
}

/**
 * Where the sky changes over [start, end], from the sun at `p`: a stop at each solar noon
 * and midnight and at each band's crossing in between, one day past either end so a
 * gradient drawn from them is right at the edges. Sorted by time.
 */
export function skyStops(start: number, end: number, p: GeoPoint): SkyStop[] {
  const stops: SkyStop[] = []
  let noon = solarNoonNear(start - DAY, p)
  for (let guard = 0; noon <= end + DAY && guard < 4000; guard++) {
    const next = solarNoonNear(noon + DAY, p)
    stops.push({ t: noon, key: keyAtAltitude(sunAltitude(noon, p), 'noon') })
    const rising: SkyStop[] = []
    const setting: SkyStop[] = []
    for (const b of SKY_BANDS) {
      const after = halfArcMs(noon, p, b.alt, 1)
      if (typeof after === 'number') setting.push({ t: noon + after, key: b.key })
      const before = halfArcMs(next, p, b.alt, -1)
      if (typeof before === 'number') rising.push({ t: next - before, key: b.key })
    }
    // Setting crossings run from the highest band down, rising ones from the lowest up.
    setting.sort((a, b) => a.t - b.t)
    rising.sort((a, b) => a.t - b.t)
    const midnight = (noon + next) / 2
    stops.push(...setting.filter(s => s.t < midnight))
    stops.push({ t: midnight, key: keyAtAltitude(sunAltitude(midnight, p), 'midnight') })
    stops.push(...rising.filter(s => s.t > midnight))
    noon = next
  }
  return stops
}

/** Offsets from local sunrise/sunset of the fixed sky (no location): twilights of half an hour each. */
const FIXED: { at: number; key: SkyKey }[] = [
  { at: 0, key: 'midnight' },
  { at: 4.5 * HOUR, key: 'dark' },
  { at: 5 * HOUR, key: 'astro' },
  { at: 5.5 * HOUR, key: 'nautical' },
  { at: 6 * HOUR, key: 'horizon' },
  { at: 7 * HOUR, key: 'day' },
  { at: 12 * HOUR, key: 'noon' },
  { at: 17 * HOUR, key: 'day' },
  { at: 18 * HOUR, key: 'horizon' },
  { at: 18.5 * HOUR, key: 'nautical' },
  { at: 19 * HOUR, key: 'astro' },
  { at: 19.5 * HOUR, key: 'dark' },
]

/**
 * The sky without a location: day 6a–6p local, by the wall clock, with half-hour twilights.
 * Same shape as skyStops; the offsets are taken from local midnight, so a DST day just
 * runs an hour short or long at night.
 */
export function fixedSkyStops(start: number, end: number): SkyStop[] {
  const stops: SkyStop[] = []
  const d = new Date(start - DAY)
  d.setHours(0, 0, 0, 0)
  for (let guard = 0; d.getTime() <= end + DAY && guard < 4000; guard++) {
    const midnight = d.getTime()
    for (const f of FIXED) {
      const h = Math.floor(f.at / HOUR)
      const m = (f.at % HOUR) / MINUTE
      stops.push({ t: new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime(), key: f.key })
    }
    d.setDate(d.getDate() + 1)
    if (d.getTime() === midnight) break
  }
  return stops
}

// --- Sunrise and sunset on a day ---------------------------------------------------------

export type SunEvent = 'sunrise' | 'sunset'
export const SUN_EVENTS: readonly SunEvent[] = ['sunrise', 'sunset']

/** "Sunrise", "Sunset" (config/labels). */
export const sunEventName = (e: SunEvent) => (e === 'sunrise' ? LABELS.sunrise : LABELS.sunset)

// Sun events belong to solar days (noon to noon at the place), not to the device's calendar
// dates: where the two differ (another timezone, or a sunset after midnight UTC), a date-based
// lookup finds the wrong day. Everything here steps from solar noon to solar noon.

/** The sunrise or sunset of the solar day around `noon` (a solar noon at `p`), to the minute; null when the sun doesn't cross. */
function eventOfSolarDay(noon: number, p: GeoPoint, event: SunEvent): number | null {
  const side = event === 'sunrise' ? -1 : 1
  const h = halfArcMs(noon, p, SUNRISE_ALT, side)
  return typeof h === 'number' ? Math.round((noon + side * h) / MINUTE) * MINUTE : null
}

/**
 * The sunrise or sunset that belongs to the local date `dayTs` falls on: the one of the solar day
 * whose noon is nearest that date's local noon (for a place in the device's own timezone, simply
 * that day's). Null when the sun doesn't rise or set that day.
 */
export function sunEventOnDay(dayTs: number, p: GeoPoint, event: SunEvent): number | null {
  const d = new Date(dayTs)
  return eventOfSolarDay(solarNoonNear(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), p), p, event)
}

/** Sunrises (or sunsets) at `p` between `from` and `to`, in order. */
export function sunEventsBetween(from: number, to: number, p: GeoPoint, event: SunEvent): number[] {
  const out: number[] = []
  let noon = solarNoonNear(from - DAY, p)
  for (let guard = 0; noon <= to + DAY && guard < 4000; guard++) {
    const t = eventOfSolarDay(noon, p, event)
    if (t !== null && t >= from && t <= to) out.push(t)
    noon = solarNoonNear(noon + DAY, p)
  }
  return out
}

/** The next sunrise or sunset at `p` after `now` (looking up to a year ahead, for polar nights), or null. */
export function nextSunEvent(now: number, p: GeoPoint, event: SunEvent): number | null {
  let noon = solarNoonNear(now - DAY, p)
  for (let k = 0; k < 372; k++) {
    const t = eventOfSolarDay(noon, p, event)
    if (t !== null && t > now) return t
    noon = solarNoonNear(noon + DAY, p)
  }
  return null
}

/** The sunrise or sunset at `p` nearest `ts` (of the solar days around it), or null when none is near. */
export function sunEventNear(ts: number, p: GeoPoint, event: SunEvent): number | null {
  let best: number | null = null
  for (const noon of [solarNoonNear(ts - DAY, p), solarNoonNear(ts, p), solarNoonNear(ts + DAY, p)]) {
    const t = eventOfSolarDay(noon, p, event)
    if (t !== null && (best === null || Math.abs(t - ts) < Math.abs(best - ts))) best = t
  }
  return best
}
