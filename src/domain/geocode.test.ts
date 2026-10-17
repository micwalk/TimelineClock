import { describe, expect, it } from 'vitest'
import { formatLatLon, parseGeocodeResults, parseLatLon } from './geocode.ts'

describe('parseLatLon', () => {
  it('reads "lat, lon" and "lat lon"', () => {
    expect(parseLatLon('37.77, -122.42')).toEqual({ lat: 37.77, lon: -122.42 })
    expect(parseLatLon(' -33.9 151.2 ')).toEqual({ lat: -33.9, lon: 151.2 })
  })
  it('rejects zips, names and out-of-range numbers', () => {
    expect(parseLatLon('94103')).toBeNull()
    expect(parseLatLon('Paris')).toBeNull()
    expect(parseLatLon('95, 10')).toBeNull()
  })
})

describe('parseGeocodeResults', () => {
  it('names each place with its region and country, skipping junk', () => {
    const json = {
      results: [
        { name: 'San Francisco', latitude: 37.77493, longitude: -122.41942, admin1: 'California', country_code: 'US' },
        { name: 'Paris', latitude: 48.85, longitude: 2.35, admin1: 'Paris', country_code: 'FR' },
        { name: 'Nowhere' },
      ],
    }
    expect(parseGeocodeResults(json)).toEqual([
      { lat: 37.77493, lon: -122.41942, name: 'San Francisco, California, US' },
      { lat: 48.85, lon: 2.35, name: 'Paris, FR' },
    ])
  })
  it('gives nothing for an empty or odd response', () => {
    expect(parseGeocodeResults({ generationtime_ms: 1 })).toEqual([])
    expect(parseGeocodeResults(null)).toEqual([])
  })
})

it('formatLatLon', () => {
  expect(formatLatLon(37.77, -122.42)).toBe('37.77°N, 122.42°W')
})
