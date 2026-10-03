import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from './migrations.ts'
import { useSettings } from './settings.ts'
import { initialViewState, useView } from './view.ts'

beforeEach(() => {
  // An old install: the Now span on, the Previous→Selected span off.
  useView.setState({ ...initialViewState(), showImpliedSelectedNow: true, showImpliedSelectedPrev: false })
  useSettings.setState({ layoutVersion: 0 })
})

describe('runMigrations', () => {
  it('moves the automatic lane from Selected→Now to the selections once for layout v3', () => {
    runMigrations()
    expect(useView.getState()).toMatchObject({ showImpliedSelectedNow: false, showImpliedSelectedPrev: true })
    expect(useSettings.getState().layoutVersion).toBe(3)
  })

  it('leaves a later choice alone', () => {
    runMigrations()
    useView.setState({ showImpliedSelectedNow: true, showImpliedSelectedPrev: false })
    runMigrations()
    expect(useView.getState()).toMatchObject({ showImpliedSelectedNow: true, showImpliedSelectedPrev: false })
  })

  it('applies v3 to an install already at v2 (which had chosen the old defaults)', () => {
    useSettings.setState({ layoutVersion: 2 })
    runMigrations()
    expect(useView.getState()).toMatchObject({ showImpliedSelectedNow: false, showImpliedSelectedPrev: true })
  })
})

describe('migration persistence', () => {
  it('saves the view flags before the version, so a quick close cannot lose them', () => {
    localStorage.clear()
    runMigrations()
    const saved = JSON.parse(localStorage.getItem('timeline.state') ?? '{}') as { showImpliedSelectedNow?: boolean; showImpliedSelectedPrev?: boolean }
    expect(saved).toMatchObject({ showImpliedSelectedNow: false, showImpliedSelectedPrev: true })
  })
})
