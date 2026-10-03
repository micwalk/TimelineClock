import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNABLES, resolveTunables, TUNABLE_DESCRIPTORS, type Tunables } from './tunables.ts'

describe('resolveTunables', () => {
  it('returns defaults with no overrides', () => {
    expect(resolveTunables({})).toEqual(DEFAULT_TUNABLES)
  })
  it('merges overrides', () => {
    const r = resolveTunables({ chipRowsMax: 5 })
    expect(r.chipRowsMax).toBe(5)
    expect(r.chipGapPx).toBe(DEFAULT_TUNABLES.chipGapPx)
  })
  it('clamps to min/max', () => {
    const r = resolveTunables({ chipRowsMax: 999, chipGapPx: -5 })
    expect(r.chipRowsMax).toBe(8)
    expect(r.chipGapPx).toBe(0)
  })
  it('ignores NaN, Infinity, non-numbers and unknown keys', () => {
    const bad = { chipRowsMax: NaN, chipGapPx: Infinity, glideTauMs: '5', bogus: 1 } as unknown as Partial<Tunables>
    const r = resolveTunables(bad)
    expect(r).toEqual(DEFAULT_TUNABLES)
    expect('bogus' in r).toBe(false)
  })
  it('defaults sit within their ranges', () => {
    for (const t of TUNABLE_DESCRIPTORS) {
      expect(t.default).toBeGreaterThanOrEqual(t.min)
      expect(t.default).toBeLessThanOrEqual(t.max)
    }
  })
})
