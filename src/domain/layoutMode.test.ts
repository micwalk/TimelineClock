import { describe, expect, it } from 'vitest'
import { resolveAgendaPlacement, resolveOrientation, shapeClass } from './layoutMode.ts'

const limits = { sideDockMinWidthPx: 900, bottomDockMinHeightPx: 600 }

describe('shapeClass', () => {
  it('compares width and height when there is no previous class', () => {
    expect(shapeClass(400, 800, null, 0.1)).toBe('portrait')
    expect(shapeClass(800, 800, null, 0.1)).toBe('landscape')
    expect(shapeClass(800, 400, null, 0.1)).toBe('landscape')
  })

  it('keeps the previous class until one side is 10% longer', () => {
    expect(shapeClass(1050, 1000, 'portrait', 0.1)).toBe('portrait')
    expect(shapeClass(1100, 1000, 'portrait', 0.1)).toBe('landscape')
    expect(shapeClass(1000, 1050, 'landscape', 0.1)).toBe('landscape')
    expect(shapeClass(1000, 1100, 'landscape', 0.1)).toBe('portrait')
  })

  it('uses the given hysteresis', () => {
    expect(shapeClass(1100, 1000, 'portrait', 0.2)).toBe('portrait')
    expect(shapeClass(1001, 1000, 'portrait', 0)).toBe('landscape')
  })
})

describe('resolveOrientation', () => {
  it('Auto runs time along the longer side', () => {
    expect(resolveOrientation('auto', null, 'portrait')).toBe('vertical')
    expect(resolveOrientation('auto', null, 'landscape')).toBe('horizontal')
  })

  it('a manual setting ignores the shape', () => {
    expect(resolveOrientation('vertical', null, 'landscape')).toBe('vertical')
    expect(resolveOrientation('horizontal', null, 'portrait')).toBe('horizontal')
  })

  it('the rotate override wins while the shape is unchanged, whatever the setting', () => {
    expect(resolveOrientation('auto', { orientation: 'horizontal', shape: 'portrait' }, 'portrait')).toBe('horizontal')
    expect(resolveOrientation('horizontal', { orientation: 'vertical', shape: 'landscape' }, 'landscape')).toBe('vertical')
  })

  it('the override lapses once the shape changes', () => {
    expect(resolveOrientation('auto', { orientation: 'horizontal', shape: 'portrait' }, 'landscape')).toBe('horizontal')
    expect(resolveOrientation('auto', { orientation: 'vertical', shape: 'landscape' }, 'portrait')).toBe('vertical')
    expect(resolveOrientation('auto', { orientation: 'vertical', shape: 'portrait' }, 'landscape')).toBe('horizontal')
    expect(resolveOrientation('horizontal', { orientation: 'vertical', shape: 'landscape' }, 'portrait')).toBe('horizontal')
  })
})

describe('resolveAgendaPlacement', () => {
  it('horizontal docks at the bottom when tall enough', () => {
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 1400, 900, limits)).toBe('bottom')
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 800, 600, limits)).toBe('bottom')
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 1400, 599, limits)).toBe('drawer')
  })

  it('a phone in landscape gets the drawer', () => {
    expect(resolveAgendaPlacement('horizontal', 'auto', null, 'landscape', 844, 390, limits)).toBe('drawer')
  })

  it('vertical docks at the side when wide enough, else the drawer', () => {
    expect(resolveAgendaPlacement('vertical', 'auto', null, 'portrait', 900, 1200, limits)).toBe('side')
    expect(resolveAgendaPlacement('vertical', 'auto', null, 'portrait', 899, 1200, limits)).toBe('drawer')
    expect(resolveAgendaPlacement('vertical', 'auto', null, 'portrait', 390, 844, limits)).toBe('drawer')
  })

  it('the drawer setting or override forces the drawer', () => {
    expect(resolveAgendaPlacement('horizontal', 'drawer', null, 'landscape', 1400, 900, limits)).toBe('drawer')
    expect(resolveAgendaPlacement('horizontal', 'auto', { placement: 'drawer', shape: 'landscape' }, 'landscape', 1400, 900, limits)).toBe('drawer')
  })

  it('an override beats the setting and lapses on a shape change', () => {
    expect(resolveAgendaPlacement('vertical', 'drawer', { placement: 'docked', shape: 'portrait' }, 'portrait', 1000, 844, limits)).toBe('side')
    expect(resolveAgendaPlacement('horizontal', 'auto', { placement: 'drawer', shape: 'portrait' }, 'landscape', 1400, 900, limits)).toBe('bottom')
  })

  it('docked without room falls back to the drawer', () => {
    expect(resolveAgendaPlacement('vertical', 'docked', null, 'portrait', 390, 844, limits)).toBe('drawer')
    expect(resolveAgendaPlacement('vertical', 'docked', null, 'portrait', 1000, 844, limits)).toBe('side')
  })
})
