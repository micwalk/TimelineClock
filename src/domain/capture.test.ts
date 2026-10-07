import { describe, expect, it } from 'vitest'
import { NOW_TARGET, findCapture } from './capture.ts'

// 1 px per ms keeps the numbers readable.
const at = (id: string, ts: number, hidden = false) => ({ id, ts, hidden })

describe('findCapture', () => {
  it('captures the nearest instant within the radius', () => {
    expect(findCapture({ instants: [at('a', 10), at('b', -5), at('c', 40)], center: 0, pxPerMs: 1, radiusPx: 12 })).toBe('b')
  })

  it('captures nothing past the radius, and never a hidden instant', () => {
    expect(findCapture({ instants: [at('a', 20)], center: 0, pxPerMs: 1, radiusPx: 12 })).toBeNull()
    expect(findCapture({ instants: [at('h', 1, true)], center: 0, pxPerMs: 1, radiusPx: 12 })).toBeNull()
  })

  it('holds a capture a little past the radius (no flicker at the edge)', () => {
    const o = { instants: [at('a', 14)], center: 0, pxPerMs: 1, radiusPx: 12, releasePx: 4 }
    expect(findCapture(o)).toBeNull()
    expect(findCapture({ ...o, prevId: 'a' })).toBe('a')
    expect(findCapture({ ...o, instants: [at('a', 17)], prevId: 'a' })).toBeNull()
  })

  it('captures Now like an instant, the nearest of them winning', () => {
    expect(findCapture({ instants: [at('a', 9)], now: 3, center: 0, pxPerMs: 1, radiusPx: 12 })).toBe(NOW_TARGET)
    expect(findCapture({ instants: [at('a', 2)], now: 6, center: 0, pxPerMs: 1, radiusPx: 12 })).toBe('a')
    expect(findCapture({ instants: [], now: 20, center: 0, pxPerMs: 1, radiusPx: 12 })).toBeNull()
    // An instant right at Now wins the tie.
    expect(findCapture({ instants: [at('a', 4)], now: 4, center: 0, pxPerMs: 1, radiusPx: 12 })).toBe('a')
  })

  it('scales with the zoom', () => {
    // 10 px per second: an instant 1 s away is 10 px away.
    expect(findCapture({ instants: [at('a', 1000)], center: 0, pxPerMs: 0.01, radiusPx: 12 })).toBe('a')
    expect(findCapture({ instants: [at('a', 1500)], center: 0, pxPerMs: 0.01, radiusPx: 12 })).toBeNull()
  })
})

