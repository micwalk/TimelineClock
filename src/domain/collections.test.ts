import { describe, expect, it } from 'vitest'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { NOW_SENTINEL } from './entities.ts'
import type { SeriesRecord } from './series.ts'
import {
  DEFAULT_COLLECTION, collectionCounts, collectionOf, dataForCollections, defaultImportRows, fileCollections, groupHiddenTest,
  mapImport, sanitizeCollections, seriesGroupLookup,
} from './collections.ts'

const inst = (id: string, extra: Partial<InstantRecord> = {}): InstantRecord => ({ id, tsEpochMs: 0, label: id, ...extra })
const series = (id: string, collectionId?: string): SeriesRecord => ({
  id, kind: 'series', label: id, time: '07:00', repeat: { kind: 'interval', every: 1 }, alarms: [], from: '2026-10-01', ...(collectionId ? { collectionId } : {}),
})
const span = (id: string, a: string, b: string): SpanRecord => ({ id, startInstantId: a, endInstantId: b, label: '', visible: true })
const toNow = (id: string, a: string): SpanRecord => ({ id, startInstantId: a, endInstantId: NOW_SENTINEL, label: '', visible: true, endIsNow: true })

describe('sanitizeCollections', () => {
  it('always has Default, first', () => {
    expect(sanitizeCollections(undefined)).toEqual([{ id: DEFAULT_COLLECTION, label: 'Default' }])
    expect(sanitizeCollections([{ id: 'c1', label: 'Work', hidden: true }, { id: 'default', label: 'Mine' }, { id: 'c1' }, { label: 'no id' }]))
      .toEqual([{ id: 'default', label: 'Mine' }, { id: 'c1', label: 'Work', hidden: true }])
  })
})

describe('collectionOf', () => {
  const sg = seriesGroupLookup([series('s1', 'c1'), series('s2')])
  it('an occurrence is in its series\' group; a plain instant in its own, else Default; a computed one in none', () => {
    expect(collectionOf(inst('a', { seriesId: 's1', collectionId: 'c9' }), sg)).toBe('c1')
    expect(collectionOf(inst('a', { seriesId: 's2' }), sg)).toBe(DEFAULT_COLLECTION)
    expect(collectionOf(inst('a', { collectionId: 'c2' }), sg)).toBe('c2')
    expect(collectionOf(inst('a'), sg)).toBe(DEFAULT_COLLECTION)
    expect(collectionOf(inst('sun:sunset@1', { virtual: true }), sg)).toBeNull()
  })
})

describe('groupHiddenTest', () => {
  it('null while every group is on; hides a switched-off group, except an alarm still to ring', () => {
    expect(groupHiddenTest(sanitizeCollections([]), [], 0)).toBeNull()
    const test = groupHiddenTest(sanitizeCollections([{ id: 'c1', label: 'Work', hidden: true }]), [series('s1', 'c1')], 0)!
    expect(test(inst('a', { collectionId: 'c1' }))).toBe(true)
    expect(test(inst('b', { seriesId: 's1' }))).toBe(true)
    expect(test(inst('c'))).toBe(false)
    expect(test(inst('d', { collectionId: 'c1', tsEpochMs: 1000, alarms: [{ id: 'x', offsetMs: 0 }] }))).toBe(false)
  })
})

describe('export and import', () => {
  const data = {
    instants: [inst('a'), inst('b', { collectionId: 'c1' }), inst('o', { seriesId: 's1' }), inst('d')],
    spans: [span('ab', 'a', 'b'), span('ad', 'a', 'd'), toNow('bn', 'b')],
    groups: [series('s1', 'c1')],
    collections: sanitizeCollections([{ id: 'c1', label: 'Sarah' }]),
  }

  it('counts each group', () => {
    expect(Object.fromEntries(collectionCounts(data.instants, data.groups))).toEqual({ default: 2, c1: 2 })
  })

  it('exports only the chosen groups: their instants and series, and spans with both ends', () => {
    const out = dataForCollections(data, new Set(['c1']))
    expect(out.instants.map(i => i.id)).toEqual(['b', 'o'])
    expect(out.spans.map(s => s.id)).toEqual(['bn'])
    expect(out.groups!.map(s => s.id)).toEqual(['s1'])
    expect(out.collections!.map(c => c.id)).toEqual(['c1'])
  })

  it('by default a file\'s group goes into yours of the same name, else a new one; its Default comes in as "Imported"', () => {
    const rows = defaultImportRows(data, sanitizeCollections([{ id: 'm1', label: 'sarah' }]))
    expect(rows).toEqual([
      { id: 'default', label: 'Imported', count: 2, target: { kind: 'new', label: 'Imported' } },
      { id: 'c1', label: 'Sarah', count: 2, target: { kind: 'into', id: 'm1' } },
    ])
    // A file from before groups is one group.
    expect(fileCollections({ instants: [inst('a')], spans: [] })).toEqual([{ id: 'default', label: 'Imported', count: 1 }])
  })

  it('maps each group as chosen: new, into yours, or left out (with spans that lose an end)', () => {
    let n = 0
    const { data: out, added } = mapImport(data, [
      { id: 'default', label: 'Imported', count: 2, target: { kind: 'skip' } },
      { id: 'c1', label: 'Sarah', count: 2, target: { kind: 'new', label: 'Sarah' } },
    ], () => `new${++n}`)
    expect(added).toEqual([{ id: 'new1', label: 'Sarah' }])
    expect(out.instants.map(i => [i.id, i.collectionId ?? null])).toEqual([['b', 'new1'], ['o', null]])
    expect(out.groups!.map(s => s.collectionId)).toEqual(['new1'])
    expect(out.spans.map(s => s.id)).toEqual(['bn'])
    expect(out.collections).toBeUndefined()
    // Into your Default: the group is dropped from the records.
    const into = mapImport(data, [{ id: 'c1', label: 'Sarah', count: 2, target: { kind: 'into', id: DEFAULT_COLLECTION } }]).data
    expect(into.instants.find(i => i.id === 'b')!.collectionId).toBeUndefined()
    expect(into.groups![0].collectionId).toBeUndefined()
  })
})
