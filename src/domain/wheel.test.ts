import { describe, expect, it } from 'vitest'
import { wheelEffect } from './wheel.ts'

const base = { dx: 0, dy: 0, ctrl: false, shift: false, vertical: false }

describe('wheelEffect', () => {
  it('zooms with the plain wheel in both orientations', () => {
    expect(wheelEffect({ ...base, dy: 100 })).toEqual({ zoom: 100, pan: 0 })
    expect(wheelEffect({ ...base, dy: -100, vertical: true })).toEqual({ zoom: -100, pan: 0 })
  })

  it('pans with Shift+wheel, whichever delta the browser reports', () => {
    expect(wheelEffect({ ...base, dy: 100, shift: true, vertical: true })).toEqual({ zoom: 0, pan: 100 })
    expect(wheelEffect({ ...base, dx: -100, shift: true, vertical: true })).toEqual({ zoom: 0, pan: -100 })
    expect(wheelEffect({ ...base, dx: 40, shift: true })).toEqual({ zoom: 0, pan: 40 })
  })

  it('zooms with Ctrl+wheel (a trackpad pinch), even with Shift', () => {
    expect(wheelEffect({ ...base, dy: 30, dx: 20, ctrl: true })).toEqual({ zoom: 30, pan: 0 })
    expect(wheelEffect({ ...base, dy: 30, ctrl: true, shift: true, vertical: true })).toEqual({ zoom: 30, pan: 0 })
  })

  it('pans a sideways swipe in horizontal only, where sideways is the time axis', () => {
    expect(wheelEffect({ ...base, dx: 50, dy: 10 })).toEqual({ zoom: 10, pan: 50 })
    expect(wheelEffect({ ...base, dx: 50, vertical: true })).toEqual({ zoom: 0, pan: 0 })
  })
})
