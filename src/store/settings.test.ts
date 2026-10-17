import { DEFAULT_RING_DEFAULTS } from '../domain/alarmPicker.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TUNABLES } from '../domain/tunables.ts'

const KEY = 'timeline.settings.v1'

/** Imports a fresh copy of the store, as on page load. */
async function loadStore() {
  vi.resetModules()
  return import('./settings.ts')
}

const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null')

beforeEach(() => localStorage.clear())

describe('settings store', () => {
  it('starts from defaults with nothing saved', async () => {
    const { useSettings, getTunables } = await loadStore()
    expect(useSettings.getState()).toEqual({ glow: 1, tunables: {}, favoriteLanes: 'selected', orientation: 'auto', verticalDir: 'down', tickSnap: true, stopwatchKeepStart: true, agendaPlacement: 'auto', alarmRings: DEFAULT_RING_DEFAULTS, sky: 'auto', skyLocation: null, sunEvents: ['sunrise', 'sunset'], layoutVersion: 0 })
    expect(getTunables()).toEqual(DEFAULT_TUNABLES)
  })

  it('loads saved values and drops junk', async () => {
    localStorage.setItem(KEY, JSON.stringify({ glow: 1.5, tunables: { chipRowsMax: 2, chipGapPx: 999, bogus: 1, glideTauMs: 'x' } }))
    const { useSettings, getTunables } = await loadStore()
    expect(useSettings.getState()).toEqual({ glow: 1.5, tunables: { chipRowsMax: 2, chipGapPx: 40 }, favoriteLanes: 'selected', orientation: 'auto', verticalDir: 'down', tickSnap: true, stopwatchKeepStart: true, agendaPlacement: 'auto', alarmRings: DEFAULT_RING_DEFAULTS, sky: 'auto', skyLocation: null, sunEvents: ['sunrise', 'sunset'], layoutVersion: 0 })
    expect(getTunables().chipRowsMax).toBe(2)
  })

  it('survives unreadable storage', async () => {
    localStorage.setItem(KEY, '{not json')
    const { useSettings } = await loadStore()
    expect(useSettings.getState()).toEqual({ glow: 1, tunables: {}, favoriteLanes: 'selected', orientation: 'auto', verticalDir: 'down', tickSnap: true, stopwatchKeepStart: true, agendaPlacement: 'auto', alarmRings: DEFAULT_RING_DEFAULTS, sky: 'auto', skyLocation: null, sunEvents: ['sunrise', 'sunset'], layoutVersion: 0 })
  })

  it('clamps, saves and resets a tunable', async () => {
    const { settings, getTunables } = await loadStore()
    settings.setTunable('chipRowsMax', 50)
    expect(getTunables().chipRowsMax).toBe(8)
    expect(saved().tunables).toEqual({ chipRowsMax: 8 })

    settings.setTunable('chipRowsMax', Number.NaN)
    expect(getTunables().chipRowsMax).toBe(8)

    settings.resetTunable('chipRowsMax')
    expect(getTunables().chipRowsMax).toBe(DEFAULT_TUNABLES.chipRowsMax)
    expect(saved().tunables).toEqual({})
  })

  it('keeps glow when tunables change', async () => {
    const { settings } = await loadStore()
    settings.setGlow(2)
    settings.setTunable('chipGapPx', 10)
    expect(saved()).toEqual({ glow: 2, tunables: { chipGapPx: 10 }, favoriteLanes: 'selected', orientation: 'auto', verticalDir: 'down', tickSnap: true, stopwatchKeepStart: true, agendaPlacement: 'auto', alarmRings: DEFAULT_RING_DEFAULTS, sky: 'auto', skyLocation: null, sunEvents: ['sunrise', 'sunset'], layoutVersion: 0 })
  })

  it('loads and saves the favorite-lanes choice and layout version', async () => {
    localStorage.setItem(KEY, JSON.stringify({ favoriteLanes: 'always', layoutVersion: 2 }))
    const { useSettings, settings } = await loadStore()
    expect(useSettings.getState()).toMatchObject({ favoriteLanes: 'always', layoutVersion: 2 })
    settings.setFavoriteLanes('selected')
    expect(saved().favoriteLanes).toBe('selected')
  })

  it('falls back on unknown favorite-lanes values', async () => {
    localStorage.setItem(KEY, JSON.stringify({ favoriteLanes: 'sometimes', layoutVersion: 'x' }))
    const { useSettings } = await loadStore()
    expect(useSettings.getState()).toMatchObject({ favoriteLanes: 'selected', orientation: 'auto', verticalDir: 'down', tickSnap: true, stopwatchKeepStart: true, agendaPlacement: 'auto', alarmRings: DEFAULT_RING_DEFAULTS, sky: 'auto', skyLocation: null, sunEvents: ['sunrise', 'sunset'], layoutVersion: 0 })
  })

  it('loads, saves and sanitizes the sky and its location (rounded, junk dropped)', async () => {
    localStorage.setItem(KEY, JSON.stringify({ sky: 'fixed', skyLocation: { lat: 37.77493, lon: -122.41942, name: 'San Francisco' } }))
    const a = await loadStore()
    expect(a.useSettings.getState()).toMatchObject({ sky: 'fixed', skyLocation: { lat: 37.77, lon: -122.42, name: 'San Francisco' } })
    a.settings.setSky('off')
    a.settings.setSkyLocation(null)
    expect(saved()).toMatchObject({ sky: 'off', skyLocation: null })
    localStorage.setItem(KEY, JSON.stringify({ sky: 'sunny', skyLocation: { lat: 120, lon: 0 } }))
    const b = await loadStore()
    expect(b.useSettings.getState()).toMatchObject({ sky: 'auto', skyLocation: null })
  })

  it('keeps which sun events show, reading the old on/off switch', async () => {
    localStorage.setItem(KEY, JSON.stringify({ sunEvents: false }))
    const a = await loadStore()
    expect(a.useSettings.getState().sunEvents).toEqual([])
    a.settings.setSunEventShown('sunset', true)
    expect(saved().sunEvents).toEqual(['sunset'])
    localStorage.setItem(KEY, JSON.stringify({ sunEvents: ['sunset', 'noon', 'sunrise'] }))
    const b = await loadStore()
    expect(b.useSettings.getState().sunEvents).toEqual(['sunrise', 'sunset'])
  })

  it('loads, saves and sanitizes orientation and vertical direction', async () => {
    localStorage.setItem(KEY, JSON.stringify({ orientation: 'vertical', verticalDir: 'up' }))
    const a = await loadStore()
    expect(a.useSettings.getState()).toMatchObject({ orientation: 'vertical', verticalDir: 'up' })
    a.settings.setOrientation('horizontal')
    a.settings.setVerticalDir('down')
    expect(saved()).toMatchObject({ orientation: 'horizontal', verticalDir: 'down' })
    localStorage.setItem(KEY, JSON.stringify({ orientation: 'sideways', verticalDir: 3 }))
    const b = await loadStore()
    expect(b.useSettings.getState()).toMatchObject({ orientation: 'auto', verticalDir: 'down' })
  })

  it('tickSnap loads, saves and falls back to true', async () => {
    localStorage.setItem(KEY, JSON.stringify({ tickSnap: false }))
    const a = await loadStore()
    expect(a.useSettings.getState().tickSnap).toBe(false)
    localStorage.clear()
    localStorage.setItem(KEY, JSON.stringify({ tickSnap: 'no' }))
    const b = await loadStore()
    expect(b.useSettings.getState().tickSnap).toBe(true)
    b.settings.setTickSnap(false)
    expect(saved().tickSnap).toBe(false)
  })
})

describe('agendaPlacement setting', () => {
  it('persists and reloads, and junk falls back to auto', async () => {
    const { settings } = await loadStore()
    settings.setAgendaPlacement('drawer')
    expect(saved().agendaPlacement).toBe('drawer')
    expect((await loadStore()).useSettings.getState().agendaPlacement).toBe('drawer')
    localStorage.setItem(KEY, JSON.stringify({ agendaPlacement: 'bogus' }))
    expect((await loadStore()).useSettings.getState().agendaPlacement).toBe('auto')
  })
})
