import { describe, expect, it } from 'vitest'
import {
  alarmLabel, findDueAlarms, hasArmedAlarm, nextAlarmTime, parseRingKey, parseSnoozeLabel, ringKey, snoozeBaseLabel, snoozeLabel, syncAlarmVisibility,
} from './alarms.ts'
import { findAdjacent, pushFocusHistory, stepFocusHistory } from './navigation.ts'
import type { AlarmRecord, InstantRecord } from './entities.ts'
import { legacyAlarmId, sanitizeInstants } from './entities.ts'
import { MINUTE } from './time.ts'

const now = 1_800_000_000_000
/** An instant `offsetMs` from now with one alarm at it (none when `alarm` is false); its ring key is its id. */
const inst = (id: string, offsetMs: number, alarm = true): InstantRecord =>
  ({ id, tsEpochMs: now + offsetMs, label: id, ...(alarm ? { alarms: [{ id: legacyAlarmId(id), offsetMs: 0 }] } : {}) })
const withAlarms = (id: string, offsetMs: number, alarms: AlarmRecord[], label = id): InstantRecord => ({ id, tsEpochMs: now + offsetMs, label, alarms })

describe('findDueAlarms', () => {
  const list = [inst('past', -1000), inst('stale', -10 * MINUTE), inst('future', 1000), inst('off', -500, false)]
  it('rings alarms that came due within the grace window', () => {
    expect(findDueAlarms(list, now, new Set(), 5 * MINUTE).map(d => d.inst.id)).toEqual(['past'])
  })
  it('rings an alarm before its instant at its own time, and never an answered one', () => {
    const meeting = withAlarms('meeting', 10 * MINUTE, [
      { id: 'at', offsetMs: 0 }, { id: 'early', offsetMs: 10 * MINUTE + 1000 }, { id: 'heard', offsetMs: 10 * MINUTE + 500, done: true },
    ])
    expect(findDueAlarms([meeting], now, new Set(), 5 * MINUTE).map(d => d.alarm.id)).toEqual(['early'])
    expect(findDueAlarms([meeting], now, new Set([ringKey('meeting', 'early')]), 5 * MINUTE)).toEqual([])
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
  it('counts alarms before their instants, and skips answered ones', () => {
    const wake = withAlarms('wake', 60 * MINUTE, [{ id: 'at', offsetMs: 0 }, { id: 'early', offsetMs: 15 * MINUTE }, { id: 'heard', offsetMs: 50 * MINUTE, done: true }])
    expect(nextAlarmTime([wake], now)).toBe(now + 45 * MINUTE)
  })
})

describe('ring keys', () => {
  it('name one alarm, and read back', () => {
    expect(parseRingKey(ringKey('i_1', 'a_2'))).toEqual({ instantId: 'i_1', alarmId: 'a_2' })
  })
  it('keep an old alarm’s bare instant id, so the Android app’s alarms carry over', () => {
    expect(ringKey('i_1', legacyAlarmId('i_1'))).toBe('i_1')
    expect(parseRingKey('i_1')).toEqual({ instantId: 'i_1', alarmId: legacyAlarmId('i_1') })
  })
})

describe('alarm labels', () => {
  it('say how long is left for an alarm before its instant; unnamed instants read as their time', () => {
    const wake = withAlarms('wake', 0, [], 'Wake up')
    expect(alarmLabel(wake, { id: 'a', offsetMs: 0 })).toBe('Wake up')
    expect(alarmLabel(wake, { id: 'a', offsetMs: 15 * MINUTE })).toBe('Wake up in 15m')
    expect(alarmLabel({ ...wake, label: '' }, { id: 'a', offsetMs: 90 * MINUTE })).toMatch(/^\d.* in 1h 30m$/)
  })
})

describe('alarm visibility', () => {
  it('an instant with an alarm still to ring is never hidden', () => {
    const list = [
      { ...withAlarms('soon', 5 * MINUTE, [{ id: 'a', offsetMs: 0 }]), hidden: true },
      { ...withAlarms('heard', 5 * MINUTE, [{ id: 'a', offsetMs: 0, done: true }]), hidden: true },
      { ...withAlarms('past', -5 * MINUTE, [{ id: 'a', offsetMs: 0 }]), hidden: true },
    ]
    expect(syncAlarmVisibility(list, now).map(i => [i.id, !!i.hidden])).toEqual([['soon', false], ['heard', true], ['past', true]])
    expect(hasArmedAlarm(list[0], now)).toBe(true)
  })
  it('returns the same list when nothing breaks the rule', () => {
    const list = [inst('a', MINUTE)]
    expect(syncAlarmVisibility(list, now)).toBe(list)
  })
})

describe('stored alarms', () => {
  it('turn an old `alarm: true` into one alarm at the instant, with a stable id', () => {
    const [a] = sanitizeInstants([{ id: 'i_1', tsEpochMs: 5, label: 'x', alarm: true }])
    expect(a).toEqual({ id: 'i_1', tsEpochMs: 5, label: 'x', alarms: [{ id: legacyAlarmId('i_1'), offsetMs: 0 }] })
    const [b] = sanitizeInstants([{ id: 'i_2', tsEpochMs: 5, label: 'x', alarm: false }])
    expect(b).toEqual({ id: 'i_2', tsEpochMs: 5, label: 'x' })
  })
  it('keep well-formed alarms only, with distinct ids and no negative offsets', () => {
    const [a] = sanitizeInstants([{ id: 'i', tsEpochMs: 5, label: '', alarms: [
      { id: 'a', offsetMs: 60_000, done: true }, { id: 'a', offsetMs: 1 }, { id: 'b', offsetMs: -5 }, { id: 'c' }, 'junk', { id: 'd', offsetMs: 0, done: 'yes' },
    ] }])
    expect(a.alarms).toEqual([{ id: 'a', offsetMs: 60_000, done: true }, { id: 'b', offsetMs: 0 }, { id: 'd', offsetMs: 0 }])
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
