import { describe, expect, it } from 'vitest'
import type { TimeBlock } from './blocks.ts'
import { planFolds, planLook } from './blocks.ts'

const M = 60_000
const block = (instantId: string | undefined, start: number, minutes: number): TimeBlock =>
  ({ key: `plan:${instantId}`, start, end: start + minutes * M, label: 'Pre-warm cooler', look: 'planned', instantId })
// 2px a minute: a 15m plan is 30px on screen.
const pos = (ts: number) => ts / M * 2

describe('planFolds', () => {
  it('folds a plan shorter on screen than maxPx into its instant’s chip, with its length', () => {
    expect(planFolds([block('a', 0, 15), block('b', 60 * M, 60)], pos, 48, false)).toEqual({ a: 15 * M })
  })
  it('folds every plan when always (vertical), however long', () => {
    expect(planFolds([block('a', 0, 15), block('b', 60 * M, 60)], pos, 48, true)).toEqual({ a: 15 * M, b: 60 * M })
  })
  it('leaves a plan with no instant alone (nothing to fold into)', () => {
    expect(planFolds([block(undefined, 0, 5)], pos, 48, true)).toEqual({})
  })
})

describe('planLook', () => {
  const todo = { chip: true, folded: false, mark: false, onScreen: true }
  it('puts its own chip on its bar while its todo’s chip shows, its bar alone once folded into it', () => {
    expect(planLook(todo)).toBe('chip')
    expect(planLook({ ...todo, folded: true })).toBe('bar')
  })
  it('isn’t drawn while its todo is a Mark, or not drawn at all with its time on screen', () => {
    expect(planLook({ ...todo, chip: false, mark: true })).toBe('hidden')
    expect(planLook({ ...todo, chip: false })).toBe('hidden')
  })
  it('keeps its chip when its todo’s time is off screen (a long plan running onto it)', () => {
    expect(planLook({ ...todo, chip: false, onScreen: false })).toBe('chip')
  })
})
