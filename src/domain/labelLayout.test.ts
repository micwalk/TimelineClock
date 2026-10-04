import { describe, expect, it } from 'vitest'
import type { LabelItem, LabelLayoutOptions, LabelLayoutResult } from './labelLayout.ts'
import { layoutLabels } from './labelLayout.ts'

// Chips 100 wide and 20 tall; horizontal rows are 20 + 4 apart.
const chip = (id: string, pos: number, extra: Partial<LabelItem> = {}): LabelItem => ({
  id, pos, mainExtent: 100, crossExtent: 20, priority: 5, pinned: false, ...extra,
})
// Vertical chips: 20 tall along the time axis, 100 wide across it.
const vchip = (id: string, pos: number, extra: Partial<LabelItem> = {}): LabelItem => ({
  id, pos, mainExtent: 20, crossExtent: 100, priority: 5, pinned: false, ...extra,
})

const H: LabelLayoutOptions = {
  orientation: 'horizontal', crossBudget: Infinity, slotGap: 4, maxSlots: 3, centerPos: 0,
  cluster: { mainExtent: 40, crossExtent: 20 }, foldBadgeExtent: 0,
}
const V: LabelLayoutOptions = { ...H, orientation: 'vertical', crossBudget: 250, maxSlots: 4, cluster: { mainExtent: 20, crossExtent: 40 } }

/** Every item must end up placed, folded or in exactly one cluster: nothing disappears. */
function accounted(r: LabelLayoutResult): string[] {
  return [...Object.keys(r.placed), ...Object.keys(r.folded), ...r.clusters.flatMap(c => c.memberIds)].sort()
}

describe('layoutLabels: placement', () => {
  it('puts chips that do not overlap in the first slot', () => {
    const r = layoutLabels([chip('a', 0), chip('b', 200)], H)
    expect(r.placed).toEqual({ a: { slot: 0, crossOffset: 0 }, b: { slot: 0, crossOffset: 0 } })
  })

  it('moves an overlapping chip to the next row', () => {
    const r = layoutLabels([chip('a', 0, { priority: 1 }), chip('b', 50)], H)
    expect(r.placed.b).toEqual({ slot: 1, crossOffset: 24 })
  })

  it('reuses a free inner row', () => {
    const r = layoutLabels([chip('a', 0, { priority: 1 }), chip('b', 60, { priority: 2 }), chip('c', 120, { priority: 3 })], H)
    expect(r.placed.c).toEqual({ slot: 0, crossOffset: 0 })
  })

  it('counts the slot by depth, not by how many chips sit nearer the axis', () => {
    const wide = chip('w', 50, { mainExtent: 200, priority: 9 })
    const r = layoutLabels([chip('a', 0, { priority: 1 }), chip('b', 101, { priority: 1 }), wide], H)
    expect(r.placed.w.slot).toBe(1)
  })

  it('places more important chips first, ties going to chips nearer the center', () => {
    const r = layoutLabels([chip('far', 60, { priority: 5 }), chip('near', 10, { priority: 5 }), chip('top', 40, { priority: 1 })], H)
    expect(r.placed.top.slot).toBe(0)
    expect(r.placed.near.slot).toBe(1)
    expect(r.placed.far.slot).toBe(2)
  })

  it('places pinned chips before everything else', () => {
    const r = layoutLabels([chip('alarm', 0, { priority: 1 }), chip('selected', 10, { priority: 9, pinned: true })], H)
    expect(r.placed.selected.slot).toBe(0)
    expect(r.placed.alarm.slot).toBe(1)
  })

  it('lets pinned chips overflow the slot limit rather than collapse', () => {
    const items = [0, 1, 2, 3].map(i => chip(`p${i}`, i, { pinned: true }))
    const r = layoutLabels(items, H)
    expect(Object.keys(r.placed)).toHaveLength(4)
    expect(r.placed.p3.slot).toBe(3)
    expect(r.clusters).toEqual([])
  })

  it('packs vertical chips into columns after the blocking chip', () => {
    const r = layoutLabels([vchip('a', 0, { priority: 1 }), vchip('b', 10)], V)
    expect(r.placed.b).toEqual({ slot: 1, crossOffset: 104 })
  })

  it('respects the cross budget in vertical', () => {
    const r = layoutLabels([vchip('a', 0, { priority: 1 }), vchip('b', 5, { priority: 2 }), vchip('c', 10, { priority: 3 })], V)
    expect(r.placed.c).toBeUndefined()
    expect(r.clusters.flatMap(c => c.memberIds)).toContain('c')
  })
})

describe('layoutLabels: snooze groups', () => {
  it('folds snoozes that collide with their original into its chip', () => {
    const items = [chip('alarm', 0), chip('s1', 30, { groupId: 'alarm' }), chip('s2', 60, { groupId: 'alarm' })]
    const r = layoutLabels(items, H)
    expect(r.folded).toEqual({ s1: 'alarm', s2: 'alarm' })
    expect(r.foldCount).toEqual({ alarm: 2 })
    expect(Object.keys(r.placed)).toEqual(['alarm'])
  })

  it('folds through a chain of siblings', () => {
    // s2 does not touch the original but touches s1, which folded.
    const items = [chip('alarm', 0), chip('s1', 90, { groupId: 'alarm' }), chip('s2', 180, { groupId: 'alarm' })]
    expect(layoutLabels(items, H).folded).toEqual({ s1: 'alarm', s2: 'alarm' })
  })

  it('keeps a snooze that is far from its group as its own chip', () => {
    const r = layoutLabels([chip('alarm', 0), chip('s1', 500, { groupId: 'alarm' })], H)
    expect(r.folded).toEqual({})
    expect(r.placed.s1).toBeDefined()
  })

  it('folds siblings together when the original is not in view', () => {
    const r = layoutLabels([chip('s1', 0, { groupId: 'gone', priority: 4 }), chip('s2', 30, { groupId: 'gone', priority: 5 })], H)
    expect(r.folded).toEqual({ s2: 's1' })
    expect(r.foldCount).toEqual({ s1: 1 })
  })

  it('never folds a pinned snooze', () => {
    const r = layoutLabels([chip('alarm', 0), chip('s1', 30, { groupId: 'alarm', pinned: true })], H)
    expect(r.folded).toEqual({})
    expect(r.placed.s1).toBeDefined()
  })

  it('widens the anchor chip by the badge', () => {
    const opts = { ...H, foldBadgeExtent: 40 }
    // Chips are centered on their line, so the badge widens the anchor by 20 on each
    // side: -70..70 instead of -50..50, which now reaches b (65..165).
    const items = [chip('alarm', 0, { priority: 1 }), chip('s1', 30, { groupId: 'alarm' }), chip('b', 115, { priority: 2 })]
    expect(layoutLabels(items, H).placed.b.slot).toBe(0)
    const r = layoutLabels(items, opts)
    expect(r.placed.b.slot).toBe(1)
  })
})

describe('layoutLabels: clusters', () => {
  it('collapses chips that do not fit into a placed "+N" cluster', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => chip(id, i * 10, { priority: i }))
    const r = layoutLabels(items, H)
    expect(Object.keys(r.placed).sort()).toEqual(['a', 'b'])
    expect(r.clusters).toHaveLength(1)
    const c = r.clusters[0]
    expect(c.memberIds).toEqual(['c', 'd', 'e'])
    expect(c.topPriority).toBe(2)
    expect(c.slot).toBe(2)
  })

  it('takes the slot of the least important chip when the cluster has no room, absorbing it', () => {
    const items = ['a', 'b', 'c', 'd'].map((id, i) => chip(id, i * 5, { priority: i }))
    const r = layoutLabels(items, { ...H, cluster: { mainExtent: 100, crossExtent: 20 } })
    // Rows: a, b, c placed; d does not fit; the cluster evicts c (the least important).
    expect(Object.keys(r.placed).sort()).toEqual(['a', 'b'])
    expect(r.clusters[0].memberIds).toEqual(['c', 'd'])
    expect(r.clusters[0].slot).toBe(2)
  })

  it('carries folded snoozes along when their anchor joins a cluster', () => {
    const items = [
      chip('a', 0, { priority: 1 }), chip('b', 5, { priority: 2 }),
      chip('alarm', 10, { priority: 3 }), chip('s1', 20, { groupId: 'alarm' }),
      chip('d', 15, { priority: 4 }),
    ]
    const r = layoutLabels(items, { ...H, cluster: { mainExtent: 100, crossExtent: 20 } })
    expect(r.clusters[0].memberIds).toEqual(['alarm', 'd', 's1'])
    expect(r.folded).toEqual({})
    expect(r.foldCount).toEqual({})
  })

  it('merges neighbouring overflow into one cluster and keeps distant overflow separate', () => {
    const near = [0, 10, 20, 30, 40].map((p, i) => chip(`n${i}`, p, { priority: i }))
    const far = [1000, 1010, 1020, 1030].map((p, i) => chip(`f${i}`, p, { priority: i }))
    const r = layoutLabels([...near, ...far], { ...H, maxSlots: 2 })
    // Two rows: the most important chip keeps row 0; the cluster absorbs row 1's chip.
    expect(r.clusters.map(c => c.memberIds)).toEqual([['n1', 'n2', 'n3', 'n4'], ['f1', 'f2', 'f3']])
    expect(Object.keys(r.placed).sort()).toEqual(['f0', 'n0'])
  })
})

describe('layoutLabels: invariants', () => {
  // Small deterministic PRNG so failures are reproducible.
  const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('accounts for every item and never overlaps chips (seed %i)', seed => {
    const r0 = rng(seed)
    const items: LabelItem[] = []
    for (let i = 0; i < 40; i++) {
      const group = r0() < 0.2 ? `g${Math.floor(r0() * 3)}` : undefined
      items.push(chip(`i${i}`, Math.floor(r0() * 800), { priority: Math.floor(r0() * 6), pinned: r0() < 0.05, groupId: group, mainExtent: 40 + Math.floor(r0() * 100) }))
    }
    for (const opts of [H, { ...V, crossBudget: 400 }]) {
      const r = layoutLabels(items, opts)
      expect(accounted(r)).toEqual(items.map(i => i.id).sort())

      const boxes = [
        ...Object.entries(r.placed).map(([id, p]) => {
          const it = items.find(x => x.id === id)!
          return { lo: it.pos - it.mainExtent / 2, hi: it.pos + it.mainExtent / 2, a: p.crossOffset, b: p.crossOffset + it.crossExtent }
        }),
        ...r.clusters.map(c => ({ lo: c.pos - opts.cluster.mainExtent / 2, hi: c.pos + opts.cluster.mainExtent / 2, a: c.crossOffset, b: c.crossOffset + opts.cluster.crossExtent })),
      ]
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const x = boxes[i]
          const y = boxes[j]
          const overlap = x.lo < y.hi && y.lo < x.hi && x.a < y.b && y.a < x.b
          expect(overlap).toBe(false)
        }
      }
    }
  })

  it('gives the same result whatever the input order', () => {
    const items = [chip('b', 5), chip('a', 5), chip('c', 6), chip('d', 7, { groupId: 'a' }), chip('e', 8), chip('f', 9)]
    expect(layoutLabels(items, H)).toEqual(layoutLabels([...items].reverse(), H))
  })
})

describe('layoutLabels: centerPos optional', () => {
  const NO_CENTER: LabelLayoutOptions = { ...H }
  delete NO_CENTER.centerPos

  it('breaks ties by time (earlier first) when centerPos is omitted', () => {
    const r = layoutLabels([chip('a', 20), chip('b', 10)], NO_CENTER)
    expect(r.placed.b.slot).toBe(0)
    expect(r.placed.a.slot).toBe(1)
  })

  it('gives the same placement whatever the pan offset', () => {
    const items = [chip('a', 0), chip('b', 30), chip('c', 60), chip('d', 400, { priority: 2 })]
    const base = layoutLabels(items, NO_CENTER)
    for (const shift of [-1000, 37, 5000]) {
      const r = layoutLabels(items.map(i => ({ ...i, pos: i.pos + shift })), NO_CENTER)
      expect(r.placed).toEqual(base.placed)
      expect(r.folded).toEqual(base.folded)
      expect(r.clusters.map(c => ({ ...c, pos: 0 }))).toEqual(base.clusters.map(c => ({ ...c, pos: 0 })))
    }
  })
})

describe('layoutLabels: no one-chip clusters', () => {
  it('a lone chip that does not fit joins the least important chip it hits ("+2", never "+1")', () => {
    // Vertical, room for one 170-wide column: b fits, a does not.
    const wide = { crossExtent: 170 }
    const r = layoutLabels([vchip('a', 100, { ...wide, priority: 3 }), vchip('b', 105, { ...wide, priority: 2 })], V)
    expect(r.clusters).toHaveLength(1)
    expect(r.clusters[0].memberIds).toEqual(['a', 'b'])
    expect(r.placed).toEqual({})
    expect(accounted(r)).toEqual(['a', 'b'])
  })

  it('keeps a pinned chip and only then shows "+1"', () => {
    const wide = { crossExtent: 170 }
    const r = layoutLabels([vchip('a', 100, { ...wide, priority: 3 }), vchip('b', 105, { ...wide, priority: 2, pinned: true })], V)
    expect(Object.keys(r.placed)).toEqual(['b'])
    expect(r.clusters[0].memberIds).toEqual(['a'])
  })

  it('leaves clusters of two or more alone', () => {
    const r = layoutLabels([chip('a', 0), chip('b', 10), chip('c', 20), chip('d', 30)], H)
    expect(r.clusters.every(c => c.memberIds.length >= 2)).toBe(true)
    expect(accounted(r)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('layoutLabels: a lone chip always shows', () => {
  it('places a chip with no neighbours next to the axis even when it is wider than the room', () => {
    const r = layoutLabels([vchip('a', 100, { crossExtent: 400 })], V)
    expect(r.placed).toEqual({ a: { slot: 0, crossOffset: 0 } })
    expect(r.clusters).toEqual([])
  })
})
