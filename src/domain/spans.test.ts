import { describe, expect, it } from 'vitest'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { resolveSpan, savedSpanLanes, spanGeometry } from './spans.ts'
import { HOUR } from './time.ts'

describe('spanGeometry', () => {
  it('clamps to the screen and reports off-screen ends', () => {
    expect(spanGeometry(-100, 300, 1000)).toEqual({ left: 0, right: 300, mid: 150, leftOffscreen: true, rightOffscreen: false, onScreen: true })
    expect(spanGeometry(800, 1500, 1000)).toMatchObject({ left: 800, right: 1000, rightOffscreen: true })
  })
  it('is on screen when spanning the whole width, off when entirely to one side', () => {
    expect(spanGeometry(-50, 2000, 1000)).toMatchObject({ onScreen: true, mid: 500 })
    expect(spanGeometry(-500, -10, 1000).onScreen).toBe(false)
    expect(spanGeometry(1100, 1200, 1000).onScreen).toBe(false)
    expect(spanGeometry(300, 300, 1000).onScreen).toBe(false)
  })
})

describe('savedSpanLanes', () => {
  const instants: InstantRecord[] = [
    { id: 'a', tsEpochMs: 0, label: 'A' },
    { id: 'b', tsEpochMs: 2 * HOUR, label: 'B' },
    { id: 'c', tsEpochMs: 4 * HOUR, label: 'C' },
  ]
  const byId = new Map(instants.map(i => [i.id, i]))
  const spans: SpanRecord[] = [
    { id: 'bc', startInstantId: 'b', endInstantId: 'c', label: '', visible: true },
    { id: 'ab', startInstantId: 'a', endInstantId: 'b', label: '', visible: false },
    { id: 'ac', startInstantId: 'a', endInstantId: 'c', label: '', visible: true },
  ]
  const resolved = spans.map(s => resolveSpan(s, byId)!)
  const base = {
    favoriteLanes: 'selected' as const, resolved, focusMode: 'now', focusedInstantId: null, focusedSpanId: null, selectedInstantId: null, now: 0 }

  it('shows only visible spans without a selection, ordered by midpoint', () => {
    expect(savedSpanLanes(base).map(s => s.span.id)).toEqual(['ac', 'bc'])
  })
  it('puts spans touching the selection first, even hidden ones', () => {
    const lanes = savedSpanLanes({ ...base, selectedInstantId: 'a' })
    expect(lanes.map(s => [s.span.id, s.priority])).toEqual([['ab', 1], ['ac', 1], ['bc', 2]])
  })
  it('prioritizes the focused instant in instant mode', () => {
    const lanes = savedSpanLanes({ ...base, focusMode: 'instant', focusedInstantId: 'c' })
    expect(lanes.map(s => [s.span.id, s.priority])).toEqual([['ac', 0], ['bc', 0]])
  })
  it('puts the focused span first and marks it', () => {
    const lanes = savedSpanLanes({ ...base, focusMode: 'span', focusedSpanId: 'ab' })
    expect(lanes.map(s => [s.span.id, s.focused])).toEqual([['ab', true], ['ac', false], ['bc', false]])
  })
  it('drops spans whose endpoints no longer exist', () => {
    expect(resolveSpan({ id: 'x', startInstantId: 'a', endInstantId: 'gone', label: '' }, byId)).toBeNull()
  })
  it('hides lanes for favorites to Now unless selected, or always on', () => {
    const fav: InstantRecord = { id: 'f', tsEpochMs: HOUR, label: 'Rice', favorite: true }
    const favById = new Map([...byId, ['f', fav]])
    const favSpan = resolveSpan({ id: 'fn', startInstantId: 'f', endInstantId: '__NOW__', label: '', visible: true, endIsNow: true }, favById)!
    const all = { ...base, resolved: [...resolved, favSpan] }
    expect(savedSpanLanes(all).map(s => s.span.id)).not.toContain('fn')
    expect(savedSpanLanes({ ...all, selectedInstantId: 'f' }).map(s => s.span.id)).toContain('fn')
    expect(savedSpanLanes({ ...all, favoriteLanes: 'always' }).map(s => s.span.id)).toContain('fn')
  })
})

describe('savedSpanLanes: tracked spans', () => {
  it('always shows a tracked favorite span to Now, even when favorites show only when selected', () => {
    const start = { id: 's', tsEpochMs: 0, label: 'Stopwatch', favorite: true }
    const r = { span: { id: 'n', startInstantId: 's', endInstantId: '__NOW__', label: '', visible: true, endIsNow: true }, start }
    const base = { resolved: [r], focusMode: 'now', focusedInstantId: null, focusedSpanId: null, selectedInstantId: null, now: 1000, favoriteLanes: 'selected' as const }
    expect(savedSpanLanes(base)).toHaveLength(0)
    expect(savedSpanLanes({ ...base, trackedIds: new Set(['s']) })).toHaveLength(1)
  })
})
