// Solstices and equinoxes as instants: the moments the seasons turn, the same instant everywhere.
// Computed (Meeus, Astronomical Algorithms ch. 27: a mean time and 24 periodic terms, good to about
// a minute), never stored unless tapped, like a clock change; a kept one keeps its id
// ("season:<kind>@<epoch ms>"), which is how it is known (isAtSeason).
import type { InstantRecord } from './entities.ts'
import { LABELS } from '../config/labels.ts'
import { DAY, MINUTE } from './time.ts'

export type SeasonKind = 'marchEquinox' | 'juneSolstice' | 'septemberEquinox' | 'decemberSolstice'

/** In the order they come in a year. */
export const SEASON_KINDS: readonly SeasonKind[] = ['marchEquinox', 'juneSolstice', 'septemberEquinox', 'decemberSolstice']

export interface SeasonEvent {
  kind: SeasonKind
  ts: number
}

// Mean times (JDE) as polynomials in Y: for years 1000 to 3000, Y = (year - 2000) / 1000; before, Y = year / 1000.
const MEAN_2000: Record<SeasonKind, readonly number[]> = {
  marchEquinox: [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  juneSolstice: [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
  septemberEquinox: [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  decemberSolstice: [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
}
const MEAN_0: Record<SeasonKind, readonly number[]> = {
  marchEquinox: [1721139.29189, 365242.1374, 0.06134, 0.00111, -0.00071],
  juneSolstice: [1721233.25401, 365241.72562, -0.05323, 0.00907, 0.00025],
  septemberEquinox: [1721325.70455, 365242.49558, -0.11677, -0.00297, 0.00074],
  decemberSolstice: [1721414.39987, 365242.88257, -0.00769, -0.00933, -0.00006],
}

// The periodic terms: A, B (degrees), C (degrees per Julian century).
const TERMS: readonly (readonly [number, number, number])[] = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112],
  [156, 73.14, 45036.886], [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906],
  [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328],
  [17, 288.79, 4562.452], [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848],
  [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074],
]

const RAD = Math.PI / 180
const UNIX_EPOCH_JD = 2440587.5

/** Terrestrial time runs ahead of UTC by ΔT (seconds): about 69 s now; a rough curve is plenty for minutes. */
function deltaTSeconds(year: number): number {
  const t = year - 2000
  if (year >= 2005 && year <= 2050) return 62.92 + 0.32217 * t + 0.005589 * t * t
  const u = (year - 1820) / 100
  return -20 + 32 * u * u
}

/** When the `kind` of season turns in `year` (UTC epoch ms). */
export function seasonTime(year: number, kind: SeasonKind): number {
  const [table, y] = year >= 1000 ? [MEAN_2000, (year - 2000) / 1000] : [MEAN_0, year / 1000]
  const c = table[kind]
  const jde0 = c[0] + y * (c[1] + y * (c[2] + y * (c[3] + y * c[4])))
  const T = (jde0 - 2451545) / 36525
  const W = (35999.373 * T - 2.47) * RAD
  const dLambda = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W)
  let S = 0
  for (const [A, B, C] of TERMS) S += A * Math.cos((B + C * T) * RAD)
  const jde = jde0 + (0.00001 * S) / dLambda
  return Math.round((jde - UNIX_EPOCH_JD) * DAY - deltaTSeconds(year) * 1000)
}

/** The solstices and equinoxes in [from, to], in order. */
export function seasonEvents(from: number, to: number): SeasonEvent[] {
  const out: SeasonEvent[] = []
  const first = new Date(from).getUTCFullYear() - 1
  const last = new Date(to).getUTCFullYear() + 1
  for (let year = first; year <= last; year++) {
    for (const kind of SEASON_KINDS) {
      const ts = seasonTime(year, kind)
      if (ts >= from && ts <= to) out.push({ kind, ts })
    }
  }
  return out
}

/** The next solstice or equinox after `now`. */
export function nextSeasonEvent(now: number): SeasonEvent {
  return seasonEvents(now + 1, now + 200 * DAY)[0]
}

const NORTH = { marchEquinox: 'vernalEquinox', juneSolstice: 'summerSolstice', septemberEquinox: 'autumnalEquinox', decemberSolstice: 'winterSolstice' } as const
const SOUTH = { marchEquinox: 'autumnalEquinox', juneSolstice: 'winterSolstice', septemberEquinox: 'vernalEquinox', decemberSolstice: 'summerSolstice' } as const

/**
 * What one is called (config/labels), for the season it begins at latitude `lat`: in the north
 * the June solstice is the Summer Solstice, in the south the Winter Solstice. No location: the north.
 */
export const seasonName = (kind: SeasonKind, lat?: number | null): string => LABELS[(lat != null && lat < 0 ? SOUTH : NORTH)[kind]]

/** A computed season's id: "season:<kind>@<epoch ms>". */
export const seasonVirtualId = (kind: SeasonKind, ts: number) => `season:${kind}@${ts}`

/** The kind and time a computed season's id names, or null. */
export function parseSeasonVirtualId(id: string): SeasonEvent | null {
  const m = /^season:(marchEquinox|juneSolstice|septemberEquinox|decemberSolstice)@(-?\d+)$/.exec(id)
  return m ? { kind: m[1] as SeasonKind, ts: Number(m[2]) } : null
}

/** Whether `inst` stands for a solstice or equinox: its id says so and it still sits on it. */
export function isAtSeason(inst: Pick<InstantRecord, 'id' | 'tsEpochMs'>): boolean {
  const s = parseSeasonVirtualId(inst.id)
  return !!s && Math.abs(inst.tsEpochMs - seasonTime(new Date(s.ts).getUTCFullYear(), s.kind)) < MINUTE
}

/** The solstices and equinoxes between `from` and `to` as virtual instants (named for latitude `lat`), except those already stored (same id). */
export function virtualSeasons(instants: readonly InstantRecord[], from: number, to: number, lat?: number | null): InstantRecord[] {
  const ids = new Set(instants.map(i => i.id))
  return seasonEvents(from, to)
    .map(s => ({ id: seasonVirtualId(s.kind, s.ts), tsEpochMs: s.ts, label: seasonName(s.kind, lat), virtual: true as const }))
    .filter(i => !ids.has(i.id))
}
