import { beforeEach, describe, expect, it } from 'vitest'
import { recomputeLayout, resolveLayout, useLayout } from './layout.ts'
import { settings, useSettings } from './settings.ts'
import * as act from './actions.ts'
import { useUi } from './ui.ts'

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

describe('agenda placement', () => {
  const size = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
    recomputeLayout()
  }
  beforeEach(() => {
    useSettings.setState({ orientation: 'auto', verticalDir: 'down', agendaPlacement: 'auto' })
    useLayout.setState({ override: null, agendaOverride: null, shape: 'landscape' })
    size(1400, 900)
  })

  it('phone portrait: drawer; phone landscape: drawer', () => {
    size(390, 844)
    expect(useLayout.getState()).toMatchObject({ orientation: 'vertical', agendaPlacement: 'drawer', agendaCanDock: false })
    size(844, 390)
    expect(useLayout.getState().agendaPlacement).toBe('drawer')
  })

  it('1400x900: bottom when horizontal, side when rotated to vertical', () => {
    expect(useLayout.getState().agendaPlacement).toBe('bottom')
    act.rotate()
    expect(useLayout.getState()).toMatchObject({ orientation: 'vertical', agendaPlacement: 'side' })
  })

  it('the setting forces the drawer; settings changes recompute', () => {
    useSettings.setState({ agendaPlacement: 'drawer' })
    recomputeLayout()
    expect(useLayout.getState().agendaPlacement).toBe('drawer')
  })

  it('toggle sets the override and a second toggle clears it', () => {
    act.toggleAgendaDock()
    expect(useLayout.getState()).toMatchObject({ agendaPlacement: 'drawer', agendaOverride: { placement: 'drawer', shape: 'landscape' } })
    act.toggleAgendaDock()
    expect(useLayout.getState()).toMatchObject({ agendaPlacement: 'bottom', agendaOverride: null })
  })

  it('a shape change clears the override', () => {
    act.toggleAgendaDock()
    size(390, 844)
    expect(useLayout.getState().agendaOverride).toBeNull()
  })
})

describe('orientation change', () => {
  it('closes an open tag menu and time-input popover', () => {
    useLayout.setState({ orientation: 'horizontal' })
    useUi.setState({ tagMenu: 'now', timeInput: { kind: 'clock', anchor: 'now' } })
    useLayout.setState({ orientation: 'vertical' })
    expect(useUi.getState()).toMatchObject({ tagMenu: null, timeInput: null })
    useUi.setState({ tagMenu: 'cursor' })
    useLayout.setState({ dir: -1 }) // not an orientation change
    expect(useUi.getState().tagMenu).toBe('cursor')
    useUi.setState({ tagMenu: null })
    useLayout.setState({ orientation: 'horizontal', dir: 1 })
  })
})
