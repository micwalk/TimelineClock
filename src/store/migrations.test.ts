import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from './migrations.ts'
import { useSettings } from './settings.ts'
import { initialViewState, useView } from './view.ts'

beforeEach(() => {
  useView.setState({ ...initialViewState(), showImpliedSelectedPrev: true })
  useSettings.setState({ layoutVersion: 0 })
})

describe('runMigrations', () => {
  it('switches the Secondary→Selected span off once for layout v2', () => {
    runMigrations()
    expect(useView.getState().showImpliedSelectedPrev).toBe(false)
    expect(useSettings.getState().layoutVersion).toBe(2)
  })

  it('leaves a later choice alone', () => {
    runMigrations()
    useView.setState({ showImpliedSelectedPrev: true })
    runMigrations()
    expect(useView.getState().showImpliedSelectedPrev).toBe(true)
  })
})

describe('migration persistence', () => {
  it('saves the view flag before the version, so a quick close cannot lose it', () => {
    localStorage.clear()
    runMigrations()
    const saved = JSON.parse(localStorage.getItem('timeline.state') ?? '{}') as { showImpliedSelectedPrev?: boolean }
    expect(saved.showImpliedSelectedPrev).toBe(false)
  })
})
