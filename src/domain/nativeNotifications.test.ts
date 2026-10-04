import { describe, expect, it } from 'vitest'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { NOW_SENTINEL } from './entities.ts'
import {
  MAX_NATIVE_ALARMS, alarmNotificationIds, assignNotificationIds, desiredLiveNotifications, desiredNativeAlarms,
  notificationIdFor, planAlarmSync, shellStatusItems, staleDeliveredAlarms,
} from './nativeNotifications.ts'
import type { NativeAlarm } from './nativeNotifications.ts'
import { IDLE_STOPWATCH } from './quickCreate.ts'
import { MINUTE, SECOND } from './time.ts'

const now = 1_800_000_000_000
const inst = (id: string, offsetMs: number, opts: Partial<InstantRecord> = {}): InstantRecord =>
  ({ id, tsEpochMs: now + offsetMs, label: '', ...opts })
const span = (id: string, a: string, b: string, label = ''): SpanRecord =>
  ({ id, startInstantId: a, endInstantId: b, label, visible: true, endIsNow: false })

describe('notificationIdFor', () => {
  it('is a stable positive 32-bit int', () => {
    for (const key of ['i_abc123xyz', 'i_000000000', '', 'x'.repeat(500), 'i_é✓']) {
      const id = notificationIdFor(key)
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThan(0)
      expect(id).toBeLessThanOrEqual(0x7fffffff)
      expect(notificationIdFor(key)).toBe(id)
    }
  })

  it('spreads similar ids apart', () => {
    const ids = new Set(Array.from({ length: 2000 }, (_, i) => notificationIdFor(`i_${i}`)))
    expect(ids.size).toBe(2000)
  })
})

describe('assignNotificationIds', () => {
  it('gives each key its own id, the same way every time', () => {
    const keys = ['i_c', 'i_a', 'i_b']
    const ids = assignNotificationIds(keys)
    expect(new Set(ids.values()).size).toBe(3)
    expect(assignNotificationIds([...keys].reverse())).toEqual(ids)
  })

  it('moves a clash to the next free id', () => {
    // FNV-1a: "costarring" and "liquid" collide (a known pair).
    expect(notificationIdFor('costarring')).toBe(notificationIdFor('liquid'))
    const ids = assignNotificationIds(['liquid', 'costarring'])
    expect(ids.get('costarring')).toBe(notificationIdFor('costarring'))
    expect(ids.get('liquid')).toBe(notificationIdFor('costarring') + 1)
  })
})

describe('desiredNativeAlarms', () => {
  it('schedules future alarms, soonest first, named after the instant', () => {
    const list = [
      inst('late', 20 * MINUTE, { alarm: true, label: 'Tea' }),
      inst('soon', 5 * MINUTE, { alarm: true }),
      inst('past', -MINUTE, { alarm: true }),
      inst('plain', 10 * MINUTE),
    ]
    const alarms = desiredNativeAlarms(list, now)
    expect(alarms.map(a => [a.instantId, a.at, a.title])).toEqual([
      ['soon', now + 5 * MINUTE, 'Alarm'],
      ['late', now + 20 * MINUTE, 'Tea'],
    ])
    expect(alarms[0].body).toMatch(/^Due at \d/)
    expect(alarms[1].notificationId).toBe(alarmNotificationIds(list).get('late'))
  })

  it('keeps ids stable as other alarms come and go', () => {
    const a = inst('a', MINUTE, { alarm: true })
    const before = desiredNativeAlarms([a], now)[0].notificationId
    expect(desiredNativeAlarms([a, inst('b', 2 * MINUTE, { alarm: true })], now)[0].notificationId).toBe(before)
  })

  it('caps the number of alarms', () => {
    const many = Array.from({ length: MAX_NATIVE_ALARMS + 10 }, (_, i) => inst(`i${i}`, (i + 1) * MINUTE, { alarm: true }))
    const alarms = desiredNativeAlarms(many, now)
    expect(alarms).toHaveLength(MAX_NATIVE_ALARMS)
    expect(alarms[alarms.length - 1].instantId).toBe(`i${MAX_NATIVE_ALARMS - 1}`)
  })
})

describe('planAlarmSync', () => {
  const alarm = (id: number, at: number, title = 'Alarm'): NativeAlarm => ({ notificationId: id, instantId: `i${id}`, at, title, body: '' })

  it('schedules new alarms and cancels removed ones', () => {
    const scheduled = new Map([[1, alarm(1, now + 1)], [2, alarm(2, now + 2)]])
    const plan = planAlarmSync(scheduled, [alarm(2, now + 2), alarm(3, now + 3)])
    expect(plan.cancel).toEqual([1])
    expect(plan.schedule.map(a => a.notificationId)).toEqual([3])
  })

  it('reschedules a moved or renamed alarm', () => {
    const scheduled = new Map([[1, alarm(1, now + 1)], [2, alarm(2, now + 2)]])
    const plan = planAlarmSync(scheduled, [alarm(1, now + 5), alarm(2, now + 2, 'Tea')])
    expect(plan.cancel).toEqual([1, 2])
    expect(plan.schedule.map(a => a.notificationId)).toEqual([1, 2])
  })

  it('does nothing when nothing changed', () => {
    const scheduled = new Map([[1, alarm(1, now + 1)]])
    expect(planAlarmSync(scheduled, [alarm(1, now + 1)])).toEqual({ cancel: [], schedule: [] })
  })
})

describe('staleDeliveredAlarms', () => {
  it('clears notifications of alarms that were answered, turned off or deleted', () => {
    const ringing = inst('ringing', -MINUTE, { alarm: true })
    const answered = inst('answered', -MINUTE)
    const ids = [notificationIdFor('ringing'), notificationIdFor('answered'), notificationIdFor('deleted')]
    expect(staleDeliveredAlarms(ids, [ringing, answered])).toEqual([notificationIdFor('answered'), notificationIdFor('deleted')])
  })
})

describe('desiredLiveNotifications', () => {
  it('counts down a timer: a future alarm ending a span that started in the past', () => {
    const list = [inst('start', -MINUTE), inst('end', 12 * MINUTE, { alarm: true, label: '13m timer' })]
    const { items, nextChangeAt } = desiredLiveNotifications(list, [span('s', 'start', 'end', '13m timer')], IDLE_STOPWATCH, now)
    expect(items).toEqual([{
      id: expect.any(Number), kind: 'countdown', title: '13m timer', text: expect.stringMatching(/^Rings at /),
      whenMs: now + 12 * MINUTE, instantId: 'end',
    }])
    expect(nextChangeAt).toBeNull()
  })

  it('works whichever way round the span was made, and falls back to the alarm name', () => {
    const list = [inst('start', -MINUTE), inst('end', MINUTE, { alarm: true, label: 'Tea' })]
    const { items } = desiredLiveNotifications(list, [span('s', 'end', 'start')], IDLE_STOPWATCH, now)
    expect(items.map(i => [i.instantId, i.title])).toEqual([['end', 'Tea']])
  })

  it('ignores spans to Now, ended timers, alarms with no span, and spans with no alarm', () => {
    const list = [
      inst('a', -MINUTE), inst('done', -SECOND, { alarm: true }), inst('bell', MINUTE, { alarm: true }), inst('plain', MINUTE),
    ]
    const spans = [
      span('ended', 'a', 'done'),
      span('noAlarm', 'a', 'plain'),
      { ...span('toNow', 'bell', NOW_SENTINEL), endIsNow: true },
    ]
    expect(desiredLiveNotifications(list, spans, IDLE_STOPWATCH, now).items).toEqual([])
  })

  it('waits for a span that starts later, and says when', () => {
    const list = [inst('a', 5 * MINUTE), inst('b', 10 * MINUTE, { alarm: true })]
    const { items, nextChangeAt } = desiredLiveNotifications(list, [span('s', 'a', 'b')], IDLE_STOPWATCH, now)
    expect(items).toEqual([])
    expect(nextChangeAt).toBe(now + 5 * MINUTE)
  })

  it('shows one countdown per alarm: a named span first, then the latest start', () => {
    const list = [inst('early', -10 * MINUTE), inst('late', -MINUTE), inst('end', MINUTE, { alarm: true })]
    const unnamed = desiredLiveNotifications(list, [span('x', 'early', 'end'), span('y', 'late', 'end')], IDLE_STOPWATCH, now).items
    expect(unnamed).toHaveLength(1)
    const named = desiredLiveNotifications(list, [span('x', 'early', 'end', 'Pasta'), span('y', 'late', 'end')], IDLE_STOPWATCH, now).items
    expect(named.map(i => i.title)).toEqual(['Pasta'])
  })

  it('counts up a running stopwatch from its start, with the current lap', () => {
    const list = [inst('sw', -5 * MINUTE, { label: 'Stopwatch' }), inst('lap', -MINUTE, { label: 'Lap 1' })]
    const running = desiredLiveNotifications(list, [], { marks: ['sw'], stopped: false }, now).items
    expect(running).toEqual([{
      id: expect.any(Number), kind: 'stopwatch', title: 'Stopwatch', text: expect.stringMatching(/^Started /),
      whenMs: now - 5 * MINUTE, instantId: 'sw',
    }])
    const lapped = desiredLiveNotifications(list, [], { marks: ['sw', 'lap'], stopped: false }, now).items
    expect(lapped[0].text).toMatch(/^Lap 2 since /)
    expect(lapped[0].whenMs).toBe(now - 5 * MINUTE)
  })

  it('drops the stopwatch once stopped or reset', () => {
    const list = [inst('sw', -5 * MINUTE), inst('stop', -MINUTE)]
    expect(desiredLiveNotifications(list, [], { marks: ['sw', 'stop'], stopped: true }, now).items).toEqual([])
    expect(desiredLiveNotifications(list, [], IDLE_STOPWATCH, now).items).toEqual([])
  })

  it('gives the timer and the stopwatch different ids', () => {
    const list = [inst('sw', -MINUTE), inst('start', -MINUTE), inst('end', MINUTE, { alarm: true })]
    const { items } = desiredLiveNotifications(list, [span('s', 'start', 'end')], { marks: ['sw'], stopped: false }, now)
    expect(items.map(i => i.kind)).toEqual(['countdown', 'stopwatch'])
    expect(items[0].id).not.toBe(items[1].id)
  })
})

describe('shellStatusItems', () => {
  it('lists what Android allows, with a fix only for what is off', () => {
    const items = shellStatusItems({ notifications: true, alarmChannel: true, exactAlarms: false, liveUpdates: true })
    expect(items.map(i => [i.label, i.ok])).toEqual([
      ['Notifications', true], ['Alarm sound', true], ['Exact alarms', false], ['Live Updates', true],
    ])
    expect(items[0].fix).toBeUndefined()
    expect(items[2].fix).toMatch(/Alarms & reminders/)
  })
})
