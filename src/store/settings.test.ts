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
    expect(useSettings.getState()).toEqual({ glow: 1, tunables: {} })
    expect(getTunables()).toEqual(DEFAULT_TUNABLES)
  })

  it('loads saved values and drops junk', async () => {
    localStorage.setItem(KEY, JSON.stringify({ glow: 1.5, tunables: { chipRowsMax: 2, chipGapPx: 999, bogus: 1, glideTauMs: 'x' } }))
    const { useSettings, getTunables } = await loadStore()
    expect(useSettings.getState()).toEqual({ glow: 1.5, tunables: { chipRowsMax: 2, chipGapPx: 40 } })
    expect(getTunables().chipRowsMax).toBe(2)
  })

  it('survives unreadable storage', async () => {
    localStorage.setItem(KEY, '{not json')
    const { useSettings } = await loadStore()
    expect(useSettings.getState()).toEqual({ glow: 1, tunables: {} })
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
    expect(saved()).toEqual({ glow: 2, tunables: { chipGapPx: 10 } })
  })
})
