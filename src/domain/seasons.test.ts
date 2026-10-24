import { describe, expect, it } from 'vitest'
import { isAtSeason, seasonName, nextSeasonEvent, parseSeasonVirtualId, seasonEvents, seasonTime, virtualSeasons } from './seasons.ts'
import { MINUTE } from './time.ts'

const utc = (s: string) => Date.parse(s)

describe('seasonTime', () => {
  it('matches published times to within two minutes', () => {
    expect(Math.abs(seasonTime(2026, 'marchEquinox') - utc('2026-03-20T14:46Z'))).toBeLessThan(2 * MINUTE)
    expect(Math.abs(seasonTime(2026, 'juneSolstice') - utc('2026-06-21T08:24Z'))).toBeLessThan(2 * MINUTE)
    expect(Math.abs(seasonTime(2026, 'septemberEquinox') - utc('2026-09-23T00:05Z'))).toBeLessThan(2 * MINUTE)
    expect(Math.abs(seasonTime(2026, 'decemberSolstice') - utc('2026-12-21T20:50Z'))).toBeLessThan(2 * MINUTE)
    expect(Math.abs(seasonTime(2024, 'juneSolstice') - utc('2024-06-20T20:51Z'))).toBeLessThan(2 * MINUTE)
  })
})

describe('seasonEvents', () => {
  it('lists the four of a year in order', () => {
    const list = seasonEvents(utc('2026-01-01T00:00Z'), utc('2027-01-01T00:00Z'))
    expect(list.map(s => s.kind)).toEqual(['marchEquinox', 'juneSolstice', 'septemberEquinox', 'decemberSolstice'])
  })
  it('finds the next one', () => {
    expect(nextSeasonEvent(utc('2026-10-24T00:00Z')).kind).toBe('decemberSolstice')
  })
})

describe('seasonName', () => {
  it('names the season each begins, in the north without a location', () => {
    expect(seasonName('marchEquinox')).toBe('Vernal Equinox')
    expect(seasonName('septemberEquinox', 47.6)).toBe('Autumnal Equinox')
    expect(seasonName('septemberEquinox', -33.9)).toBe('Vernal Equinox')
    expect(seasonName('juneSolstice', -33.9)).toBe('Winter Solstice')
  })
})

describe('virtual seasons', () => {
  it('are named, held by id, and known while on their time', () => {
    const [dec] = virtualSeasons([], utc('2026-12-01T00:00Z'), utc('2026-12-31T00:00Z'))
    expect(dec.label).toBe('Winter Solstice')
    expect(virtualSeasons([], utc('2026-12-01T00:00Z'), utc('2026-12-31T00:00Z'), -33.9)[0].label).toBe('Summer Solstice')
    expect(parseSeasonVirtualId(dec.id)).toEqual({ kind: 'decemberSolstice', ts: dec.tsEpochMs })
    expect(isAtSeason(dec)).toBe(true)
    expect(isAtSeason({ id: dec.id, tsEpochMs: dec.tsEpochMs + 10 * MINUTE })).toBe(false)
    expect(virtualSeasons([dec], utc('2026-12-01T00:00Z'), utc('2026-12-31T00:00Z'))).toEqual([])
  })
})
