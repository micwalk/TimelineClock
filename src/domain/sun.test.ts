import { describe, expect, it } from 'vitest'
import { fixedSkyStops, skyStops, solarNoonNear, sunAltitude, sunDay } from './sun.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

const SF = { lat: 37.7749, lon: -122.4194 }
const LONDON = { lat: 51.5074, lon: -0.1278 }
const TROMSO = { lat: 69.6496, lon: 18.956 }

/** Within `min` minutes of the expected UTC time. */
const near = (actual: number | undefined, isoUtc: string, min = 2) => {
  expect(actual).toBeDefined()
  expect(Math.abs((actual as number) - Date.parse(isoUtc)) / MINUTE).toBeLessThan(min)
}

describe('sunDay', () => {
  it('San Francisco on the June solstice: sunrise 5:48a, sunset 8:35p PDT', () => {
    const d = sunDay(Date.parse('2026-06-21T20:00:00Z'), SF)
    near(d.sunrise, '2026-06-21T12:48:00Z')
    near(d.sunset, '2026-06-22T03:35:00Z')
    near(d.noon, '2026-06-21T20:12:00Z')
  })

  it('London at the March equinox: sunrise about 6:03, sunset about 18:14 GMT', () => {
    const d = sunDay(Date.parse('2026-03-20T12:00:00Z'), LONDON)
    near(d.sunrise, '2026-03-20T06:03:00Z', 3)
    near(d.sunset, '2026-03-20T18:14:00Z', 3)
    // Twilights come in order around sunrise.
    expect(d.astronomicalDawn!).toBeLessThan(d.nauticalDawn!)
    expect(d.nauticalDawn!).toBeLessThan(d.civilDawn!)
    expect(d.civilDawn!).toBeLessThan(d.sunrise!)
  })

  it('Tromsø has no sunrise in December and no sunset in June', () => {
    const winter = sunDay(Date.parse('2026-12-21T11:00:00Z'), TROMSO)
    expect(winter.sunrise).toBeUndefined()
    expect(winter.civilDawn).toBeDefined() // still a twilight at noon
    const summer = sunDay(Date.parse('2026-06-21T11:00:00Z'), TROMSO)
    expect(summer.sunset).toBeUndefined()
  })
})

describe('sunAltitude', () => {
  it('is highest at solar noon and below the horizon at midnight', () => {
    const noon = solarNoonNear(Date.parse('2026-06-21T20:00:00Z'), SF)
    expect(sunAltitude(noon, SF)).toBeCloseTo(90 - 37.7749 + 23.44, 0)
    expect(sunAltitude(noon, SF)).toBeGreaterThan(sunAltitude(noon + HOUR, SF))
    expect(sunAltitude(noon + 12 * HOUR, SF)).toBeLessThan(-20)
  })
})

describe('skyStops', () => {
  const start = Date.parse('2026-10-15T00:00:00Z')
  const end = start + DAY

  it('covers a day past either end, sorted', () => {
    const stops = skyStops(start, end, SF)
    expect(stops[0].t).toBeLessThanOrEqual(start - DAY / 2)
    expect(stops[stops.length - 1].t).toBeGreaterThanOrEqual(end + DAY / 2)
    for (let i = 1; i < stops.length; i++) expect(stops[i].t).toBeGreaterThan(stops[i - 1].t)
  })

  it('runs noon, day, horizon, nautical, astro, dark, midnight and back each day at mid latitudes', () => {
    const keys = skyStops(start, end, SF).map(s => s.key)
    const i = keys.indexOf('noon')
    expect(keys.slice(i, i + 13)).toEqual(['noon', 'day', 'horizon', 'nautical', 'astro', 'dark', 'midnight', 'dark', 'astro', 'nautical', 'horizon', 'day', 'noon'])
  })

  it('puts the horizon stops at sunrise and sunset', () => {
    const stops = skyStops(start, end, SF)
    const d = sunDay(Date.parse('2026-10-15T19:00:00Z'), SF)
    const horizons = stops.filter(s => s.key === 'horizon').map(s => s.t)
    expect(horizons.some(t => Math.abs(t - d.sunrise!) < MINUTE)).toBe(true)
    expect(horizons.some(t => Math.abs(t - d.sunset!) < MINUTE)).toBe(true)
  })

  it('skips the bands the sun never reaches (polar night: no day; noon at −3° takes the nearest band)', () => {
    const s = Date.parse('2026-12-21T00:00:00Z')
    const stops = skyStops(s, s + DAY, TROMSO)
    const keys = new Set(stops.map(x => x.key))
    expect(keys.has('day')).toBe(false)
    expect(keys.has('noon')).toBe(false)
    expect(stops.filter(x => x.key === 'horizon').every(x => Math.abs(sunAltitude(x.t, TROMSO) + 3) < 1)).toBe(true)
    expect(keys.has('midnight')).toBe(true)
  })
})

describe('fixedSkyStops', () => {
  it('has day from 6a to 6p local each day', () => {
    const s = new Date(2026, 9, 15, 0, 0).getTime()
    const stops = fixedSkyStops(s, s + DAY)
    const sunrise = stops.find(x => x.key === 'horizon' && new Date(x.t).getDate() === 15)!
    expect(new Date(sunrise.t).getHours()).toBe(6)
    const sunset = stops.filter(x => x.key === 'horizon' && new Date(x.t).getDate() === 15)[1]
    expect(new Date(sunset.t).getHours()).toBe(18)
    for (let i = 1; i < stops.length; i++) expect(stops[i].t).toBeGreaterThan(stops[i - 1].t)
  })
})
