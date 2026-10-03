import { describe, expect, it } from 'vitest'
import { findDueAlarms, nextAlarmTime, parseSnoozeLabel, snoozeBaseLabel, snoozeLabel } from './alarms.ts'
import { findAdjacent, pushFocusHistory, stepFocusHistory } from './navigation.ts'
import type { InstantRecord } from './entities.ts'
import { MINUTE } from './time.ts'

const now = 1_800_000_000_000
const inst = (id: string, offsetMs: number, alarm = true): InstantRecord => ({ id, tsEpochMs: now + offsetMs, label: id, alarm })

describe('findDueAlarms', () => {
  const list = [inst('past', -1000), inst('stale', -10 * MINUTE), inst('future', 1000), inst('off', -500, false)]
  it('rings alarms that came due within the grace window', () => {
    expect(findDueAlarms(list, now, new Set(), 5 * MINUTE).map(i => i.id)).toEqual(['past'])
  })
  it('does not ring an alarm twice', () => {
    expect(findDueAlarms(list, now, new Set(['past']), 5 * MINUTE)).toEqual([])
  })
  it('catches alarms a throttled timer overshot by seconds', () => {
    expect(findDueAlarms([inst('late', -30_000)], now, new Set(), 5 * MINUTE)).toHaveLength(1)
  })
})

describe('nextAlarmTime', () => {
  it('finds the soonest future enabled alarm', () => {
    expect(nextAlarmTime([inst('a', 5000), inst('b', 2000), inst('c', 1000, false), inst('d', -1)], now)).toBe(now + 2000)
    expect(nextAlarmTime([inst('d', -1)], now)).toBeNull()
  })
})

describe('snooze labels', () => {
  it('never stacks prefixes', () => {
    expect(snoozeLabel('Wake up', 1)).toBe('Snooze 1: Wake up')
    expect(snoozeLabel('Snooze 1: Wake up', 2)).toBe('Snooze 2: Wake up')
    expect(snoozeBaseLabel('Snooze 2: Snooze 1: Wake up')).toBe('Wake up')
  })
  it('parses the latest snooze count and the base label', () => {
    expect(parseSnoozeLabel('Snooze 2: Wake up')).toEqual({ base: 'Wake up', count: 2 })
    expect(parseSnoozeLabel('Snooze 3: Snooze 2: Wake up')).toEqual({ base: 'Wake up', count: 3 })
    expect(parseSnoozeLabel('snooze  12:Wake up')).toEqual({ base: 'Wake up', count: 12 })
    expect(parseSnoozeLabel('Wake up')).toBeNull()
    expect(parseSnoozeLabel('My Snooze 2: thing')).toBeNull()
  })
})

describe('navigation', () => {
  const items = [
    { kind: 'now' as const, ts: 50 },
    { kind: 'saved' as const, id: 'x', ts: 10 },
    { kind: 'saved' as const, id: 'y', ts: 90 },
  ]
  it('finds the nearest item strictly before/after the anchor', () => {
    expect(findAdjacent(items, 50, 1)).toMatchObject({ id: 'y' })
    expect(findAdjacent(items, 50, -1)).toMatchObject({ id: 'x' })
    expect(findAdjacent(items, 10, -1)).toBeNull()
  })
  it('returns only history fields, even when given a whole view state', () => {
    const state = { focusHistory: ['a'], focusHistoryIndex: 0, viewFocusMode: 'cursor', focusedInstantId: null }
    expect(Object.keys(pushFocusHistory(state, 'a')).sort()).toEqual(['focusHistory', 'focusHistoryIndex'])
    expect(Object.keys(pushFocusHistory(state, 'b')).sort()).toEqual(['focusHistory', 'focusHistoryIndex'])
  })

  it('records focus history without consecutive duplicates', () => {
    let h = { focusHistory: [] as string[], focusHistoryIndex: -1 }
    h = pushFocusHistory(h, 'a')
    h = pushFocusHistory(h, 'b')
    h = pushFocusHistory(h, 'b')
    expect(h).toEqual({ focusHistory: ['a', 'b'], focusHistoryIndex: 1 })
    expect(stepFocusHistory(h, -1)).toBe(0)
    expect(stepFocusHistory(h, 1)).toBeNull()
  })
})
