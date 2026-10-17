import { describe, expect, it } from 'vitest'
import { lemonTally, mergeLemons, sanitizeLemons } from './lemons.ts'

const e = (id: string, ts: number, sour: boolean) => ({ id, ts, sour, text: id, kind: 'name' as const })

describe('the lemon log', () => {
  it('keeps well-formed answers, oldest first', () => {
    expect(sanitizeLemons([e('b', 2, true), { id: 'x' }, e('a', 1, false), 7])).toEqual([e('a', 1, false), e('b', 2, true)])
    expect(sanitizeLemons(null)).toEqual([])
  })
  it('merges two logs once per answer, and tallies them', () => {
    const merged = mergeLemons([e('a', 1, false), e('b', 2, true)], [e('b', 2, true), e('c', 3, true)])
    expect(merged.map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(lemonTally(merged)).toEqual({ sour: 2, sweet: 1 })
  })
})
