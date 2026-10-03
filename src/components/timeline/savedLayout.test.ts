import { beforeEach, describe, expect, it } from 'vitest'
import type { InstantRecord } from '../../domain/entities.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { LayoutContext, SavedLayoutInputs } from './savedLayout.ts'
import { createSavedLayoutCache, estimateChipWidth, layoutItems, layoutStats } from './savedLayout.ts'
import { useSettings } from '../../store/settings.ts'

type FrameLike = Pick<Frame, 'now' | 'pos' | 'start' | 'end' | 'pxPerMs' | 'mainSize' | 'crossSize'>

const inst = (id: string, ts: number, extra: Partial<InstantRecord> = {}): InstantRecord => ({ id, tsEpochMs: ts, label: id, ...extra })
const ctx = (extra: Partial<LayoutContext> = {}): LayoutContext => ({
  now: 1000, pos: ts => ts / 10, mainSize: 800,
  selectedId: null, focusedId: null, editingId: null, movingId: null,
  ringingIds: new Set(), widths: {}, ...extra,
})
const only = (items: ReturnType<typeof layoutItems>, id: string) => items.find(i => i.id === id)!

describe('layoutItems', () => {
  it('uses measured widths, else 9 per character + 40', () => {
    const items = layoutItems([inst('abc', 0), inst('measured', 0)], ctx({ widths: { measured: 123 } }))
    expect(only(items, 'abc').mainExtent).toBe(estimateChipWidth('abc'))
    expect(estimateChipWidth('abc')).toBe(9 * 3 + 40)
    expect(only(items, 'measured').mainExtent).toBe(123)
    expect(only(items, 'abc').crossExtent).toBe(28)
  })

  it('ranks focused, selected, moving or editing, ringing, upcoming alarm, favorite, other', () => {
    const all = [
      inst('focused', 0), inst('selected', 0), inst('moving', 0), inst('editing', 0), inst('ringing', 0, { alarm: true }),
      inst('upcoming', 5000, { alarm: true }), inst('fav', 0, { favorite: true }), inst('other', 0),
    ]
    const items = layoutItems(all, ctx({
      focusedId: 'focused', selectedId: 'selected', movingId: 'moving', editingId: 'editing', ringingIds: new Set(['ringing']),
    }))
    const p = Object.fromEntries(items.map(i => [i.id, i.priority]))
    expect(p).toEqual({ focused: 0, selected: 1, moving: 2, editing: 2, ringing: 3, upcoming: 4, fav: 5, other: 6 })
  })

  it('treats a past alarm as an ordinary instant', () => {
    expect(only(layoutItems([inst('old', 0, { alarm: true })], ctx()), 'old').priority).toBe(6)
  })

  it('pins focused, selected, ringing, editing and moving instants only', () => {
    const all = [inst('f', 0), inst('s', 0), inst('r', 0), inst('e', 0), inst('m', 0), inst('x', 0, { favorite: true })]
    const items = layoutItems(all, ctx({ focusedId: 'f', selectedId: 's', ringingIds: new Set(['r']), editingId: 'e', movingId: 'm' }))
    expect(items.filter(i => i.pinned).map(i => i.id)).toEqual(['f', 's', 'r', 'e', 'm'])
  })

  it('passes the snooze group and places a moving instant at the screen center', () => {
    const items = layoutItems([inst('snz', 500, { snoozeOriginalId: 'orig' }), inst('mv', 100)], ctx({ movingId: 'mv' }))
    expect(only(items, 'snz')).toMatchObject({ groupId: 'orig', pos: 50 })
    expect(only(items, 'mv').pos).toBe(400)
  })

  it('in vertical, chips are CHIP_HEIGHT along time and as wide as measured across it', () => {
    const items = layoutItems([inst('abc', 0), inst('measured', 0)], ctx({ orientation: 'vertical', widths: { measured: 123 } }))
    expect(only(items, 'abc')).toMatchObject({ mainExtent: 28, crossExtent: estimateChipWidth('abc') })
    expect(only(items, 'measured')).toMatchObject({ mainExtent: 28, crossExtent: 123 })
  })
})

describe('createSavedLayoutCache', () => {
  const PX = 0.01 // px per ms
  const frame = (center: number, extra: Partial<FrameLike> = {}): FrameLike => ({
    now: 0, pxPerMs: PX, mainSize: 800, crossSize: 900,
    start: center - 400 / PX, end: center + 400 / PX,
    pos: ts => (ts - center) * PX + 400,
    ...extra,
  })
  const inputs = (instants: InstantRecord[], extra: Partial<SavedLayoutInputs> = {}): SavedLayoutInputs => ({
    orientation: 'horizontal', dir: 1, instants, mode: 'cursor', focusedInstantId: null, selected: null, secondary: null,
    editing: null, moving: null, ringing: [], widths: {}, tunables: {}, laneCount: 0, ...extra,
  })
  const crowd = (n: number) => Array.from({ length: n }, (_, k) => inst(`c${k}`, 1000 + k))

  beforeEach(() => { useSettings.setState({ tunables: {} }) })

  it('a pure pan reuses the cached layout without running the layout again', () => {
    const compute = createSavedLayoutCache()
    const inp = inputs(crowd(6))
    const first = compute(frame(1000), inp)
    const runs = layoutStats.runs
    for (const c of [1010, 1500, 2000]) expect(compute(frame(c), inp)).toBe(first)
    expect(layoutStats.runs).toBe(runs)
  })

  it('re-runs when zoom, the visible set or an input changes', () => {
    const compute = createSavedLayoutCache()
    const list = [...crowd(3), inst('far', 1000 + 1_000_000)]
    const inp = inputs(list)
    compute(frame(1000), inp)
    let runs = layoutStats.runs
    compute(frame(1000, { pxPerMs: PX * 2 }), inp)
    expect(layoutStats.runs).toBe(++runs)
    compute(frame(1000 + 1_000_000), inp) // the far instant comes in, the crowd goes out
    expect(layoutStats.runs).toBe(++runs)
    compute(frame(1000 + 1_000_000), inputs(list, { selected: 'c0' })) // new inputs
    expect(layoutStats.runs).toBe(++runs)
  })

  it('does not cache while an instant is being moved', () => {
    const compute = createSavedLayoutCache()
    const inp = inputs(crowd(2), { moving: 'c0' })
    compute(frame(1000), inp)
    const runs = layoutStats.runs
    compute(frame(1100), inp)
    expect(layoutStats.runs).toBe(runs + 1)
  })

  it('a stable layout keeps its identity across a re-run', () => {
    const compute = createSavedLayoutCache()
    const inp = inputs(crowd(3))
    const first = compute(frame(1000), inp)
    expect(compute(frame(1000, { pxPerMs: PX * 1.0001 }), inp)).toBe(first)
  })

  it('uses chipColumnsMax in vertical and chipRowsMax in horizontal', () => {
    useSettings.setState({ tunables: { chipColumnsMax: 2, chipRowsMax: 5 } })
    const list = crowd(8)
    const v = createSavedLayoutCache()(frame(1000), inputs(list, { orientation: 'vertical' }))
    expect(v.rowsUsed).toBeLessThanOrEqual(2)
    const h = createSavedLayoutCache()(frame(1000), inputs(list))
    expect(h.rowsUsed).toBeGreaterThan(2)
    expect(h.rowsUsed).toBeLessThanOrEqual(5)
  })
})
