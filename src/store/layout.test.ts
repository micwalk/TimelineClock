import { beforeEach, describe, expect, it } from 'vitest'
import { recomputeLayout, resolveLayout, useLayout } from './layout.ts'
import { settings, useSettings } from './settings.ts'
import * as act from './actions.ts'

const auto = { orientation: 'auto', verticalDir: 'down' } as const

describe('resolveLayout', () => {
  it('auto: portrait is vertical, landscape horizontal', () => {
    expect(resolveLayout(auto, null, null, 390, 844, 0.1)).toEqual({ shape: 'portrait', orientation: 'vertical', dir: 1 })
    expect(resolveLayout(auto, null, null, 1400, 900, 0.1)).toEqual({ shape: 'landscape', orientation: 'horizontal', dir: 1 })
  })

  it('an override lapses when the shape class changes', () => {
    const override = { orientation: 'horizontal', shape: 'portrait' } as const
    expect(resolveLayout(auto, override, 'portrait', 390, 844, 0.1).orientation).toBe('horizontal')
    // Landscape now: the override no longer applies, the setting does.
    expect(resolveLayout({ ...auto, orientation: 'vertical' }, override, 'portrait', 1400, 600, 0.1).orientation).toBe('vertical')
    expect(resolveLayout(auto, override, 'portrait', 1400, 600, 0.1).shape).toBe('landscape')
  })

  it("'up' gives dir -1 in vertical only", () => {
    const up = { orientation: 'auto', verticalDir: 'up' } as const
    expect(resolveLayout(up, null, null, 390, 844, 0.1).dir).toBe(-1)
    expect(resolveLayout(up, null, null, 1400, 900, 0.1).dir).toBe(1)
  })
})

describe('layout store and rotate', () => {
  beforeEach(() => {
    useSettings.setState({ orientation: 'auto', verticalDir: 'down' })
    useLayout.setState({ override: null })
    recomputeLayout()
  })

  it('rotate flips the orientation; a second rotate clears the override', () => {
    const start = useLayout.getState().orientation
    act.rotate()
    expect(useLayout.getState().orientation).not.toBe(start)
    expect(useLayout.getState().override).not.toBeNull()
    act.rotate()
    expect(useLayout.getState()).toMatchObject({ orientation: start, override: null })
  })

  it('settings changes recompute the layout', () => {
    settings.setOrientation('vertical')
    recomputeLayout()
    expect(useLayout.getState().orientation).toBe('vertical')
    settings.setVerticalDir('up')
    recomputeLayout()
    expect(useLayout.getState().dir).toBe(-1)
  })
})
