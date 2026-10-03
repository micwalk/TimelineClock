import { describe, it, expect } from 'vitest'
import { layoutLabels, type LabelItem, type LabelLayoutOptions } from './labelLayout'

const mk = (id: string, pos: number, extra: Partial<LabelItem> = {}): LabelItem => ({
  id, pos, mainExtent: 100, crossExtent: 20, priority: 1, pinned: false, ...extra,
})
const H: LabelLayoutOptions = { orientation: 'horizontal', crossBudget: 100, slotGap: 4, maxSlots: 3, centerPos: 0 }
const V: LabelLayoutOptions = { orientation: 'vertical', crossBudget: 100, slotGap: 4, maxSlots: 4, centerPos: 0 }

describe('layoutLabels', () => {
  it('no overlap -> slot 0', () => {
    const r = layoutLabels([mk('a', 0), mk('b', 200)], H)
    expect(r.placed.a.slot).toBe(0)
    expect(r.placed.b.slot).toBe(0)
  })
  it('overlap -> second row', () => {
    const r = layoutLabels([mk('a', 0), mk('b', 50)], H)
    expect(r.placed.b).toEqual({ slot: 1, crossOffset: 24 })
  })
  it('exhausted budget -> cluster', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => mk(id, i))
    const r = layoutLabels(items, H)
    expect(Object.keys(r.placed)).toHaveLength(3)
    expect(r.clusters).toHaveLength(1)
    expect(r.clusters[0].memberIds).toEqual(['d', 'e'])
  })
  it('pinned overflow always places', () => {
    const items = [mk('a', 0), mk('b', 1), mk('c', 2), mk('p', 3, { pinned: true, priority: 9 })]
    const r = layoutLabels(items, H)
    expect(r.placed.p.slot).toBe(3)
  })
  it('snooze folds into anchor', () => {
    const items = [mk('o', 0), mk('x', 1, { groupId: 'o', priority: 5 })]
    const r = layoutLabels(items, { ...H, maxSlots: 1 })
    expect(r.folded).toEqual({ x: 'o' })
    expect(r.foldCount.o).toBe(1)
    expect(r.clusters).toHaveLength(0)
  })
  it('vertical packs after blocker', () => {
    const r = layoutLabels([mk('a', 0), mk('b', 10)], V)
    expect(r.placed.b.crossOffset).toBe(24)
  })
  it('deterministic', () => {
    const items = [mk('b', 5), mk('a', 5), mk('c', 6)]
    expect(layoutLabels(items, H)).toEqual(layoutLabels([...items].reverse(), H))
  })
})
