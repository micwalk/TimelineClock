// The one network call the sky makes (#11): a zip or city to coordinates, with Open-Meteo's free
// geocoder (no key). Only when the user asks, in Settings; sunrise and sunset are then computed
// on the device (domain/sun.ts).
import { parseGeocodeResults } from '../domain/geocode.ts'
import type { GeoPlace } from '../domain/geocode.ts'

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'

export async function lookUpPlace(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const url = `${ENDPOINT}?${new URLSearchParams({ name: query.trim(), count: '5', format: 'json', language: navigator.language.split('-')[0] || 'en' })}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
  return parseGeocodeResults(await res.json())
}
