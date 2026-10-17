import { describe, expect, it } from 'vitest'
import { isAtSun, parseSunVirtualId, sanitizeSunAnchor, sunVirtualId, virtualSunEvents } from './sunEvents.ts'
import { nextSunEvent, sunEventOnDay } from './sun.ts'
import { nextOccurrence, occurrenceTs, occursOn, planOccurrences, ruleFromOccurrence, sanitizeGroups, seriesFromInstant, virtualOccurrences } from './series.ts'
import type { SeriesRecord } from './series.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

const SF = { lat: 37.77, lon: -122.42 }
const TROMSO = { lat: 69.65, lon: 18.96 }
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime()

describe('sunEventOnDay / nextSunEvent', () => {
  it('gives a time on the minute, and null where the sun never sets', () => {
    const t = sunEventOnDay(day(2026, 10, 15), SF, 'sunset')!
    expect(t % MINUTE).toBe(0)
    expect(sunEventOnDay(day(2026, 6, 21), TROMSO, 'sunset')).toBeNull()
  })
  it('finds the next one after now', () => {
    const today = sunEventOnDay(day(2026, 10, 15), SF, 'sunset')!
    expect(nextSunEvent(today - HOUR, SF, 'sunset')).toBe(today)
    expect(nextSunEvent(today + MINUTE, SF, 'sunset')).toBe(sunEventOnDay(day(2026, 10, 16), SF, 'sunset'))
  })
})

describe('virtualSunEvents', () => {
  const from = day(2026, 10, 15) - 12 * HOUR
  const to = from + 2 * DAY
  it('gives a sunrise and a sunset each day, named and anchored', () => {
    const list = virtualSunEvents(SF, [], from, to)
    expect(list.map(i => i.label)).toEqual(['Sunrise', 'Sunset', 'Sunrise', 'Sunset'])
    expect(list.every(i => i.virtual && i.sun && isAtSun(i))).toBe(true)
    expect(parseSunVirtualId(list[1].id)).toEqual({ event: 'sunset', ts: list[1].tsEpochMs })
  })
  it('leaves out one an instant already stands for', () => {
    const [, sunset] = virtualSunEvents(SF, [], from, to)
    const stored = { id: 'a', tsEpochMs: sunset.tsEpochMs, label: 'Beach', sun: { event: 'sunset' as const, ...SF } }
    expect(virtualSunEvents(SF, [stored], from, to).map(i => i.id)).not.toContain(sunset.id)
  })
})

describe('isAtSun', () => {
  it('holds only while the instant stays on its sunset', () => {
    const ts = sunEventOnDay(day(2026, 10, 15), SF, 'sunset')!
    const sun = { event: 'sunset' as const, ...SF }
    expect(isAtSun({ tsEpochMs: ts, sun })).toBe(true)
    expect(isAtSun({ tsEpochMs: ts + 10 * MINUTE, sun })).toBe(false)
    expect(isAtSun({ tsEpochMs: ts })).toBe(false)
  })
})

describe('series at sunset', () => {
  const s: SeriesRecord = { id: 'g1', kind: 'series', label: 'Beach', time: '18:30', repeat: { kind: 'interval', every: 1 }, alarms: [30 * MINUTE], from: '2026-10-15', sun: { event: 'sunset', ...SF } }

  it('runs at each day\'s sunset, which moves day to day', () => {
    const a = occurrenceTs(s, '2026-10-15')
    const b = occurrenceTs(s, '2026-10-16')
    expect(a).toBe(sunEventOnDay(day(2026, 10, 15), SF, 'sunset'))
    expect(b - a).not.toBe(DAY) // the sun sets a little earlier each day in October
    expect(Math.abs(b - a - DAY)).toBeLessThan(3 * MINUTE)
  })

  it('makes occurrences (stored and computed) that carry the anchor, with the alarms before sunset', () => {
    let n = 0
    const now = day(2026, 10, 15) - 6 * HOUR
    const made = planOccurrences([s], [], now, now + 3 * DAY, { instant: () => `i${n++}`, alarm: () => `a${n++}` })
    expect(made).toHaveLength(3)
    expect(made.every(i => i.sun?.event === 'sunset' && isAtSun(i))).toBe(true)
    expect(made[0].alarms).toEqual([{ id: expect.any(String), offsetMs: 30 * MINUTE }])
    const far = virtualOccurrences([s], made, now, now + 3 * DAY, now + 5 * DAY)
    expect(far.every(i => i.sun && isAtSun(i))).toBe(true)
    expect(nextOccurrence(s, now)?.ts).toBe(made[0].tsEpochMs)
  })

  it('skips days the sun doesn\'t set (polar day)', () => {
    const polar: SeriesRecord = { ...s, from: '2026-06-01', sun: { event: 'sunset', ...TROMSO } }
    expect(occursOn(polar, '2026-06-21')).toBe(false)
    expect(occursOn(polar, '2026-10-15')).toBe(true)
  })

  it('a sun instant repeated becomes a sun series; moved off it, its rule is the clock time', () => {
    const ts = sunEventOnDay(day(2026, 10, 15), SF, 'sunset')!
    const inst = { id: 'x', tsEpochMs: ts, label: 'Sunset', sun: { event: 'sunset' as const, ...SF } }
    expect(seriesFromInstant(inst, { kind: 'interval', every: 1 }).sun).toEqual(inst.sun)
    expect(ruleFromOccurrence({ ...inst, tsEpochMs: ts + 20 * MINUTE }).sun).toBeUndefined()
  })

  it('keeps the anchor through storage and drops a broken one', () => {
    expect(sanitizeGroups([s])[0].sun).toEqual(s.sun)
    expect(sanitizeGroups([{ ...s, sun: { event: 'noon', lat: 1, lon: 2 } }])[0].sun).toBeUndefined()
    expect(sanitizeSunAnchor({ event: 'sunrise', lat: 100, lon: 0 })).toBeUndefined()
  })
})

it('sunVirtualId round-trips', () => {
  expect(parseSunVirtualId(sunVirtualId('sunrise', 123))).toEqual({ event: 'sunrise', ts: 123 })
  expect(parseSunVirtualId('v:g@2026-10-15')).toBeNull()
})
