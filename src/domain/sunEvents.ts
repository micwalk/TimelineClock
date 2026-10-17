// Sunrise and sunset as instants (#11). On the timeline they are computed for the days on screen
// (virtual, like a repeat's far occurrences): "Sunrise" and "Sunset" chips that are never stored
// unless tapped. Tapped, one becomes an ordinary instant that remembers it is a sunset (`sun`), so
// an alarm on it rings relative to sunset, its ⟳ tool repeats it at each day's sunset (a series
// with the same `sun` anchor: domain/series occurrenceTs), and so on. An instant that is moved off
// its sunset is simply an instant again (isAtSun).
import type { InstantRecord } from './entities.ts'
import type { GeoPoint, SunEvent } from './sun.ts'
import { SUN_EVENTS, sunEventName, sunEventOnDay } from './sun.ts'
import { DAY, MINUTE } from './time.ts'

/** Where a time follows the sun: that day's sunrise or sunset at a place. */
export interface SunAnchor extends GeoPoint {
  event: SunEvent
}

/** A sun anchor from untrusted JSON, or undefined. */
export function sanitizeSunAnchor(raw: unknown): SunAnchor | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const { lat, lon, event } = r
  if (event !== 'sunrise' && event !== 'sunset') return undefined
  if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined
  return { event, lat, lon }
}

/** Whether `inst` still sits on its sunrise or sunset (moving it makes it a plain instant). */
export function isAtSun(inst: Pick<InstantRecord, 'tsEpochMs' | 'sun'>): boolean {
  if (!inst.sun) return false
  const t = sunEventOnDay(inst.tsEpochMs, inst.sun, inst.sun.event)
  return t !== null && Math.abs(t - inst.tsEpochMs) < MINUTE
}

/** A computed sun event's id: "sun:<event>@<epoch ms>". */
export const sunVirtualId = (event: SunEvent, ts: number) => `sun:${event}@${ts}`

/** The event and time a computed sun event's id names, or null. */
export function parseSunVirtualId(id: string): { event: SunEvent; ts: number } | null {
  const m = /^sun:(sunrise|sunset)@(-?\d+)$/.exec(id)
  return m ? { event: m[1] as SunEvent, ts: Number(m[2]) } : null
}

/**
 * Sunrises and sunsets at `p` between `from` and `to`, as virtual instants, except where an
 * instant already stands for one (a tapped one, or a repeat's occurrence at that sunset).
 */
export function virtualSunEvents(p: GeoPoint, instants: readonly InstantRecord[], from: number, to: number, events: readonly SunEvent[] = SUN_EVENTS): InstantRecord[] {
  const taken = instants.filter(i => i.sun && isAtSun(i)).map(i => `${i.sun!.event}@${i.tsEpochMs}`)
  // A stored one keeps the id it had as a virtual one, even moved off its sunset.
  const have = new Set([...taken, ...instants.map(i => i.id)])
  const out: InstantRecord[] = []
  const d = new Date(from - DAY)
  for (let k = 0; k < 400; k++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k, 12).getTime()
    if (day > to + DAY) break
    for (const event of events) {
      const ts = sunEventOnDay(day, p, event)
      if (ts === null || ts < from || ts > to || have.has(`${event}@${ts}`) || have.has(sunVirtualId(event, ts))) continue
      out.push({ id: sunVirtualId(event, ts), tsEpochMs: ts, label: sunEventName(event), sun: { event, lat: p.lat, lon: p.lon }, virtual: true })
    }
  }
  return out
}
