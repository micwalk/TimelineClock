import { describe, expect, it } from 'vitest'
import { pushClear } from './pushClear.ts'

const box = (id: string, lo: number, hi: number) => ({ id, lo, hi, at: (lo + hi) / 2 })
const plus = { lo: 100, hi: 130 } // middle 115

describe('pushClear', () => {
  it('leaves boxes clear of it alone', () => {
    expect(pushClear([box('a', 0, 90), box('b', 140, 200)], plus, 4)).toEqual({})
  })

  it('pushes a box to its own side, just clear', () => {
    expect(pushClear([box('a', 60, 110)], plus, 4)).toEqual({ a: -14 }) // hi 110 → 96
    expect(pushClear([box('b', 120, 170)], plus, 4)).toEqual({ b: 14 }) // lo 120 → 134
  })

  it('chains: a pushed box pushes its neighbour on', () => {
    const out = pushClear([box('b', 120, 170), box('c', 174, 220), box('d', 400, 450)], plus, 4)
    expect(out.b).toBe(14)
    expect(out.c).toBe(14) // 174 + 14 = 188 = 170 + 14 + 4
    expect(out.d).toBeUndefined()
  })

  it('a box right over it goes to the side its chip is centered on', () => {
    expect(pushClear([{ id: 'w', lo: 40, hi: 190, at: 114 }], plus, 4).w).toBe(96 - 190)
    expect(pushClear([{ id: 'w', lo: 40, hi: 190, at: 116 }], plus, 4).w).toBe(134 - 40)
  })
})
