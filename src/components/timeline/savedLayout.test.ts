import { describe, expect, it } from 'vitest'
import type { InstantRecord } from '../../domain/entities.ts'
import type { LayoutContext } from './savedLayout.ts'
import { estimateChipWidth, layoutItems } from './savedLayout.ts'

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
})
