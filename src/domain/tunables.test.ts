import { describe, expect, it } from 'vitest'
import { clampTunable, DEFAULT_TUNABLES, resolveTunables, sanitizeTunableOverrides, TUNABLE_DESCRIPTORS } from './tunables.ts'

describe('tunables table', () => {
  it('lists every tunable once, with its default inside its range', () => {
    const keys = TUNABLE_DESCRIPTORS.map(d => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(Object.keys(DEFAULT_TUNABLES).sort()).toEqual([...keys].sort())
    for (const d of TUNABLE_DESCRIPTORS) {
      expect(d.default).toBeGreaterThanOrEqual(d.min)
      expect(d.default).toBeLessThanOrEqual(d.max)
      expect(d.step).toBeGreaterThan(0)
    }
  })

  it('has the values agreed in the spec', () => {
    expect(DEFAULT_TUNABLES.chipRowsMax).toBe(3)
    expect(DEFAULT_TUNABLES.autoHysteresis).toBe(0.1)
    expect(DEFAULT_TUNABLES.landingMousePx).toBe(8)
    expect(DEFAULT_TUNABLES.landingTouchPx).toBe(12)
    expect(DEFAULT_TUNABLES.tickSnapPx).toBe(8)
    expect(DEFAULT_TUNABLES.snapMaxReleaseSpeed).toBe(0.05)
    expect(DEFAULT_TUNABLES.secondsBelowTickMs).toBe(60_000)
  })
})

describe('sanitizeTunableOverrides', () => {
  it('keeps known finite numbers, clamped', () => {
    expect(sanitizeTunableOverrides({ chipRowsMax: 5, chipGapPx: -5, glideTauMs: 99999 })).toEqual({ chipRowsMax: 5, chipGapPx: 0, glideTauMs: 2000 })
  })

  it('drops unknown keys, non-numbers and non-finite values', () => {
    expect(sanitizeTunableOverrides({ bogus: 1, chipRowsMax: NaN, chipGapPx: Infinity, glideTauMs: '5' })).toEqual({})
    expect(sanitizeTunableOverrides({ toString: 3, __proto__: { chipRowsMax: 2 } })).toEqual({})
  })

  it('accepts junk input', () => {
    expect(sanitizeTunableOverrides(null)).toEqual({})
    expect(sanitizeTunableOverrides('x')).toEqual({})
    expect(sanitizeTunableOverrides([4])).toEqual({})
  })
})

describe('resolveTunables', () => {
  it('returns defaults without overrides', () => {
    expect(resolveTunables()).toEqual(DEFAULT_TUNABLES)
  })

  it('applies sanitized overrides over defaults', () => {
    const r = resolveTunables({ chipRowsMax: 999, bogus: 1 })
    expect(r.chipRowsMax).toBe(8)
    expect(r.chipGapPx).toBe(DEFAULT_TUNABLES.chipGapPx)
    expect('bogus' in r).toBe(false)
  })
})

describe('clampTunable', () => {
  it('clamps into the range', () => {
    expect(clampTunable('chipRowsMax', 0)).toBe(1)
    expect(clampTunable('chipRowsMax', 4)).toBe(4)
  })
})
