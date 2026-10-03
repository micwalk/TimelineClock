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
