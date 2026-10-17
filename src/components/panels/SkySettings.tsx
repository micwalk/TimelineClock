// Settings > Sky (#11): the timeline's sky shading and where its sun is. A location comes from
// typed coordinates, the device's position (asked once), or a zip/city looked up once online;
// it is kept rounded to about a kilometre and the sun is computed on the device from then on.
import { useEffect, useRef, useState } from 'react'
import { settings, useSettings } from '../../store/settings.ts'
import type { SkyMode } from '../../store/settings.ts'
import { formatLatLon, parseLatLon } from '../../domain/geocode.ts'
import type { GeoPlace } from '../../domain/geocode.ts'
import { lookUpPlace } from '../../services/geocode.ts'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; text: string } | { kind: 'pick'; places: GeoPlace[] }

export function SkySettings() {
  const mode = useSettings(s => s.sky)
  const loc = useSettings(s => s.skyLocation)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const choose = (p: GeoPlace) => {
    settings.setSkyLocation(p)
    setQuery('')
    setStatus({ kind: 'idle' })
  }

  const find = async () => {
    const q = query.trim()
    if (!q) return
    const typed = parseLatLon(q)
    if (typed) { choose({ ...typed, name: formatLatLon(typed.lat, typed.lon) }); return }
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setStatus({ kind: 'busy' })
    try {
      const places = await lookUpPlace(q, ctl.signal)
      if (places.length === 0) setStatus({ kind: 'error', text: `Nothing found for “${q}”.` })
      else if (places.length === 1) choose(places[0])
      else setStatus({ kind: 'pick', places })
    } catch (e) {
      if (!ctl.signal.aborted) setStatus({ kind: 'error', text: e instanceof Error && e.message.startsWith('Lookup') ? e.message : 'Couldn’t reach the lookup. Try coordinates, or Use my location.' })
    }
  }

  const useDevice = () => {
    if (!('geolocation' in navigator)) { setStatus({ kind: 'error', text: 'This browser can’t share its location.' }); return }
    setStatus({ kind: 'busy' })
    navigator.geolocation.getCurrentPosition(
      p => choose({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'My location' }),
      () => setStatus({ kind: 'error', text: 'Location wasn’t shared.' }),
      { enableHighAccuracy: false, maximumAge: 24 * 3600_000, timeout: 15_000 },
    )
  }

  return (
    <>
      <label className="settings__row">
        <span>Shading</span>
        <select value={mode} onChange={e => settings.setSky(e.target.value === 'fixed' || e.target.value === 'off' ? (e.target.value as SkyMode) : 'auto')}>
          <option value="auto">Sun</option>
          <option value="fixed">Fixed 6a–6p</option>
          <option value="off">Off</option>
        </select>
      </label>
      <div className="settings__row settings__row--wrap">
        <span>Location</span>
        <span className="sky-settings__place">
          {loc ? <>{loc.name || 'Set'} <span className="mono">({formatLatLon(loc.lat, loc.lon)})</span></> : mode === 'auto' ? 'Not set: the sun is drawn 6a–6p until it is' : 'Not set'}
          {loc && <button type="button" className="sky-settings__clear" onClick={() => settings.setSkyLocation(null)}>Clear</button>}
        </span>
      </div>
      <form className="sky-settings__find" onSubmit={e => { e.preventDefault(); void find() }}>
        <input
          className="settings__text"
          value={query}
          placeholder="Zip, city, or 37.77, -122.42"
          aria-label="Zip code, city, or coordinates"
          onChange={e => { setQuery(e.target.value); if (status.kind !== 'busy') setStatus({ kind: 'idle' }) }}
        />
        <button type="submit" className="settings__action settings__action--plain glow-box" disabled={!query.trim() || status.kind === 'busy'}>Find</button>
      </form>
      {status.kind === 'pick' && (
        <div className="sky-settings__picks" role="group" aria-label="Pick a place">
          {status.places.map(p => (
            <button key={`${p.lat},${p.lon}`} type="button" className="repeat-chip glow-box" onClick={() => choose(p)}>{p.name}</button>
          ))}
        </div>
      )}
      {status.kind === 'error' && <p className="sky-settings__note is-error" role="alert">{status.text}</p>}
      {status.kind === 'busy' && <p className="sky-settings__note" aria-live="polite">Looking…</p>}
      <button type="button" className="settings__action settings__action--plain glow-box" onClick={useDevice} disabled={status.kind === 'busy'}>Use my location</button>
      <p className="sky-settings__note">Sunrise and sunset show on the timeline once a location is set; switch each on or off in the Agenda’s <b>Repeats</b> tab.</p>
      <p className="sky-settings__note">A zip or city is looked up once at open-meteo.com; sunrise, sunset and twilight are then worked out on this device, offline.</p>
    </>
  )
}
