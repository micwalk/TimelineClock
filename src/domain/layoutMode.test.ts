import { describe, expect, it } from 'vitest'
import { resolveAgendaPlacement, resolveOrientation, shapeClass } from './layoutMode'

const t = { sideDockMinWidthPx: 900, bottomDockMinHeightPx: 600 }

describe('shapeClass', () => {
  it('plain compare with no previous', () => {
    expect(shapeClass(400, 800, null)).toBe('portrait')
    expect(shapeClass(800, 800, null)).toBe('landscape')
    expect(shapeClass(800, 400, null)).toBe('landscape')
  })
  it('hysteresis holds previous until 10% margin', () => {
    expect(shapeClass(1050, 1000, 'portrait')).toBe('portrait')
    expect(shapeClass(1100, 1000, 'portrait')).toBe('landscape')
    expect(shapeClass(1000, 1050, 'landscape')).toBe('landscape')
    expect(shapeClass(1000, 1100, 'landscape')).toBe('portrait')
  })
})

describe('resolveOrientation', () => {
  it('manual setting wins', () => {
    expect(resolveOrientation('vertical', null, 'landscape')).toBe('vertical')
    expect(
      resolveOrientation('horizontal', { orientation: 'vertical', shape: 'portrait' }, 'portrait'),
    ).toBe('horizontal')
  })
  it('auto follows shape', () => {
    expect(resolveOrientation('auto', null, 'portrait')).toBe('vertical')
    expect(resolveOrientation('auto', null, 'landscape')).toBe('horizontal')
  })
  it('override applies only while shape matches', () => {
    const o = { orientation: 'horizontal' as const, shape: 'portrait' as const }
    expect(resolveOrientation('auto', o, 'portrait')).toBe('horizontal')
    const v = { orientation: 'vertical' as const, shape: 'landscape' as const }
    expect(resolveOrientation('auto', v, 'landscape')).toBe('vertical')
    expect(resolveOrientation('auto', v, 'portrait')).toBe('vertical')
    expect(resolveOrientation('auto', o, 'landscape')).toBe('horizontal')
    expect(resolveOrientation('auto', { orientation: 'vertical', shape: 'portrait' }, 'landscape')).toBe(
      'horizontal',
    )
  })
})

describe('resolveAgendaPlacement', () => {
  it('horizontal', () => {
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 1400, 900, t)).toBe('bottom')
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 1400, 599, t)).toBe('drawer')
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 800, 600, t)).toBe('bottom')
  })
  it('phone landscape -> drawer', () => {
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 844, 390, t)).toBe('drawer')
  })
  it('vertical', () => {
    expect(resolveAgendaPlacement('vertical', 'auto', null, 'portrait', 900, 1200, t)).toBe('side')
    expect(resolveAgendaPlacement('vertical', 'auto', null, 'portrait', 899, 1200, t)).toBe('drawer')
    expect(resolveAgendaPlacement('vertical', 'auto', null, 'portrait', 390, 844, t)).toBe('drawer')
  })
  it('drawer setting/override forces drawer', () => {
    expect(resolveAgendaPlacement('horizontal', 'drawer', null, 'landscape', 1400, 900, t)).toBe('drawer')
    expect(
      resolveAgendaPlacement('horizontal', 'auto', { placement: 'drawer', shape: 'landscape' }, 'landscape', 1400, 900, t),
    ).toBe('drawer')
  })
  it('override resets on shape change', () => {
    expect(
      resolveAgendaPlacement('horizontal', 'auto', { placement: 'drawer', shape: 'portrait' }, 'landscape', 1400, 900, t),
    ).toBe('bottom')
  })
  it('forced docked falls back when not fitting', () => {
    expect(resolveAgendaPlacement('vertical', 'docked', null, 'portrait', 390, 844, t)).toBe('drawer')
    expect(resolveAgendaPlacement('vertical', 'docked', null, 'portrait', 1000, 844, t)).toBe('side')
    expect(
      resolveAgendaPlacement('vertical', 'drawer', { placement: 'docked', shape: 'portrait' }, 'portrait', 1000, 844, t),
    ).toBe('side')
  })
})
