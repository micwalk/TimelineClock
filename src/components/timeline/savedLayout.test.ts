import { beforeEach, describe, expect, it } from 'vitest'
import type { InstantRecord } from '../../domain/entities.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { LayoutContext, SavedLayoutInputs } from './savedLayout.ts'
import { ZOOM_REUSE, createSavedLayoutCache, estimateChipWidth, layoutItems, layoutStats, useChipWidths } from './savedLayout.ts'
import { useSettings } from '../../store/settings.ts'
import type { InstantOpts } from '../../test/fixtures.ts'
import { instantFields } from '../../test/fixtures.ts'

type FrameLike = Pick<Frame, 'now' | 'pos' | 'start' | 'end' | 'pxPerMs' | 'mainSize' | 'crossSize'>

const inst = (id: string, ts: number, extra: InstantOpts = {}): InstantRecord => ({ id, tsEpochMs: ts, label: id, ...instantFields(id, extra) })
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

  it('pins the secondary-selected instant just after the selected one, so it never folds or clusters', () => {
    const items = layoutItems([inst('s', 0), inst('p', 0), inst('m', 0)], ctx({ selectedId: 's', secondaryId: 'p', movingId: 'm' }))
    const by = Object.fromEntries(items.map(i => [i.id, i]))
    expect(by.p.pinned).toBe(true)
    expect(by.s.priority).toBeLessThan(by.p.priority)
    expect(by.p.priority).toBeLessThan(by.m.priority)
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
    editing: null, moving: null, ringing: [], selectedBell: null, draggingBell: null, widths: {}, tunables: {}, groupVisibility: {}, laneCount: 0, ...extra,
  })
  const crowd = (n: number) => Array.from({ length: n }, (_, k) => inst(`c${k}`, 1000 + k))

  beforeEach(() => { useSettings.setState({ tunables: {} }) })

  it('one rule for every instant: Label, Mark, Hidden by zoom (groups, reach, or its own visibility)', () => {
    const DAYMS = 24 * 3600_000
    const at = (days: number): FrameLike => {
      const px = 800 / (days * DAYMS)
      return { now: 0, pxPerMs: px, mainSize: 800, crossSize: 900, start: -days * DAYMS / 2, end: days * DAYMS / 2, pos: ts => ts * px + 400 }
    }
    const keys = (m: Record<string, true>) => Object.keys(m).sort()
    // Unnamed (a group): Label up to a day, Mark up to 10 years, however far apart they are.
    const unnamed = [inst('u1', -DAYMS / 2), inst('u2', 0), inst('u3', DAYMS / 2)].map(i => ({ ...i, label: '' }))
    expect(createSavedLayoutCache()(at(0.5), inputs(unnamed)).marks).toEqual({})
    let r = createSavedLayoutCache()(at(2), inputs(unnamed))
    expect(keys(r.marks)).toEqual(['u1', 'u2', 'u3'])
    expect(r.markFade).toEqual({}) // far from Hidden: no fade
    // Computed sun times (a group): Mark past 3 days, fading toward a week, Hidden past it, unless selected.
    const sun = { event: 'sunset' as const, lat: 0, lon: 0 }
    const suns = [0, 1, 2].map(k => ({ ...inst(`sun:sunset@${k}`, k * DAYMS), sun, virtual: true as const }))
    r = createSavedLayoutCache()(at(6), inputs(suns))
    expect(keys(r.marks)).toEqual(['sun:sunset@0', 'sun:sunset@1', 'sun:sunset@2'])
    expect(r.markFade['sun:sunset@0']).toBeGreaterThan(0)
    expect(r.markFade['sun:sunset@0']).toBeLessThan(1)
    expect(createSavedLayoutCache()(at(10), inputs(suns)).visibleIds).toEqual([])
    r = createSavedLayoutCache()(at(10), inputs(suns, { selected: 'sun:sunset@1' }))
    expect(r.visibleIds).toEqual(['sun:sunset@1'])
    expect(r.marks).toEqual({}) // selected: its label
    // By reach: made at its time, 3 days; made 3 days ahead, 12 days; a Mark out to at least 10 years.
    const meeting = { ...inst('Meeting', 0), createdAt: 0 }
    const trip = { ...inst('Trip', 0), createdAt: -3 * DAYMS }
    expect(createSavedLayoutCache()(at(2), inputs([meeting, trip])).marks).toEqual({})
    expect(createSavedLayoutCache()(at(6), inputs([meeting, trip])).marks).toEqual({ Meeting: true })
    r = createSavedLayoutCache()(at(40), inputs([meeting, trip]))
    expect(r.marks).toEqual({ Meeting: true, Trip: true })
    expect(createSavedLayoutCache()(at(11 * 365), inputs([meeting, trip])).visibleIds).toEqual([]) // past 10 years: Hidden
    // A countdown: 70 days away, a favorite reaches 560 days.
    const xmas = { ...inst('Xmas', 70 * DAYMS), favorite: true }
    r = createSavedLayoutCache()(at(400), inputs([xmas]))
    expect(r.visibleIds).toEqual(['Xmas'])
    expect(r.marks).toEqual({})
    // A long span: its ends reach 8x its length.
    const born = inst('Born', -40 * 365 * DAYMS)
    const end = inst('Expected', 40 * 365 * DAYMS)
    const life = { id: 's1', startInstantId: 'Born', endInstantId: 'Expected', label: '', visible: true }
    r = createSavedLayoutCache()(at(100 * 365), inputs([born, end], { spans: [life] }))
    expect(r.visibleIds).toEqual(['Born', 'Expected'])
    expect(r.marks).toEqual({})
    // Its own visibility wins, over Unnamed's too; a repeat's occurrence is always its series'.
    const day3 = { ...inst('Wake', 0), seriesId: 'g1', occurrence: '2026-10-20' }
    r = createSavedLayoutCache()(at(40), inputs([{ ...meeting, visibility: { label: 'always', mark: 'always' } }, { ...unnamed[0], visibility: { label: 'week', mark: 'always' } }, { ...day3, visibility: { label: 'always', mark: 'always' } }]))
    expect(r.visibleIds.sort()).toEqual(['Meeting', 'Wake', 'u1'])
    expect(r.marks).toEqual({ u1: true, Wake: true })
    // A group's own setting: unnamed as labels to a month.
    r = createSavedLayoutCache()(at(2), inputs(unnamed, { groupVisibility: { unnamed: { label: 'month', mark: 'always' } } }))
    expect(r.marks).toEqual({})
  })

  it('leaves hidden instants out unless selected or ending the selected span', () => {
    const compute = createSavedLayoutCache()
    const all = [inst('a', 0), inst('h', 1000, { hidden: true })]
    expect(compute(frame(0), inputs(all)).visibleIds).toEqual(['a'])
    expect(compute(frame(0), inputs(all, { selected: 'h' })).visibleIds).toEqual(['a', 'h'])
    // A span it ends is selected or focused.
    expect(compute(frame(0), inputs(all, { revealIds: ['h', 'x'] })).visibleIds).toEqual(['a', 'h'])
  })

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
    const list = crowd(3)
    const first = compute(frame(1000), inputs(list))
    const runs = layoutStats.runs
    expect(compute(frame(1000), inputs(list))).toBe(first) // new inputs object: a real re-run
    expect(layoutStats.runs).toBe(runs + 1)
  })

  it('reuses the layout for a zoom step under ZOOM_REUSE, and re-runs past it', () => {
    const compute = createSavedLayoutCache()
    const inp = inputs(crowd(3))
    compute(frame(1000), inp)
    const runs = layoutStats.runs
    compute(frame(1000, { pxPerMs: PX * (1 + ZOOM_REUSE / 2) }), inp)
    expect(layoutStats.runs).toBe(runs)
    compute(frame(1000, { pxPerMs: PX * (1 + ZOOM_REUSE * 2) }), inp)
    expect(layoutStats.runs).toBe(runs + 1)
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

describe('useChipWidths.prune', () => {
  it('drops widths of instants that no longer exist and keeps the rest', () => {
    useChipWidths.setState({ widths: { a: 10, gone: 20 } })
    useChipWidths.getState().prune(new Set(['a']))
    expect(useChipWidths.getState().widths).toEqual({ a: 10 })
    const same = useChipWidths.getState().widths
    useChipWidths.getState().prune(new Set(['a']))
    expect(useChipWidths.getState().widths).toBe(same)
  })
})
