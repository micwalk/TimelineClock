// Finding a place for the sky (#11): typed coordinates, or a zip/city looked up once with
// Open-Meteo's free geocoder (services/geocode.ts); what comes back is parsed here.

export interface GeoPlace {
  lat: number
  lon: number
  /** "San Francisco, California, US". */
  name: string
}

/** "37.77, -122.42" (or with a space, or N/S/E/W-less degrees): coordinates, else null. */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

/** The places in an Open-Meteo geocoding response; anything malformed is skipped. */
export function parseGeocodeResults(json: unknown): GeoPlace[] {
  const results = json && typeof json === 'object' ? (json as { results?: unknown }).results : undefined
  if (!Array.isArray(results)) return []
  const out: GeoPlace[] = []
  for (const r of results) {
    if (!r || typeof r !== 'object') continue
    const { latitude, longitude, name, admin1, country_code } = r as Record<string, unknown>
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof name !== 'string') continue
    const parts = [name, typeof admin1 === 'string' && admin1 !== name ? admin1 : '', typeof country_code === 'string' ? country_code : '']
    out.push({ lat: latitude, lon: longitude, name: parts.filter(Boolean).join(', ') })
  }
  return out
}

/** "37.77°N, 122.42°W". */
export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
}
