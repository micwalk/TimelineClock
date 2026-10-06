import { describe, expect, it, vi } from 'vitest'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { NOW_SENTINEL } from './entities.ts'
import {
  MAX_NATIVE_ALARMS, alarmNotificationIds, assignNotificationIds, desiredLiveNotifications, desiredNativeAlarms,
  liveIdFor, liveTapTarget, notificationIdFor, replayAlarmActions, sanitizeAlarmActions, shellStatusItems, timerSpanFor,
} from './nativeNotifications.ts'
import { IDLE_STOPWATCH } from './quickCreate.ts'
import { MINUTE, SECOND } from './time.ts'

const now = 1_800_000_000_000
const RING = 5 * MINUTE
const inst = (id: string, offsetMs: number, opts: Partial<InstantRecord> = {}): InstantRecord =>
  ({ id, tsEpochMs: now + offsetMs, label: '', ...opts })
const span = (id: string, a: string, b: string, label = ''): SpanRecord =>
  ({ id, startInstantId: a, endInstantId: b, label, visible: true, endIsNow: false })
const nowSpan = (id: string, from: string): SpanRecord =>
  ({ id, startInstantId: from, endInstantId: NOW_SENTINEL, label: '', visible: true, endIsNow: true })

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

describe('timerSpanFor', () => {
  it('finds the span an alarm ends, whichever way round it was made', () => {
    const list = [inst('start', -MINUTE), inst('end', MINUTE, { alarm: true })]
    expect(timerSpanFor('end', list, [span('s', 'start', 'end')])?.span.id).toBe('s')
    expect(timerSpanFor('end', list, [span('s', 'end', 'start')])?.span.id).toBe('s')
  })

  it('ignores spans to Now and spans the instant starts', () => {
    const list = [inst('end', MINUTE, { alarm: true }), inst('later', 2 * MINUTE)]
    expect(timerSpanFor('end', list, [nowSpan('n', 'end'), span('s', 'end', 'later')])).toBeNull()
    expect(timerSpanFor('missing', list, [])).toBeNull()
  })

  it('prefers a named span, then the latest start', () => {
    const list = [inst('early', -10 * MINUTE), inst('late', -MINUTE), inst('end', MINUTE, { alarm: true })]
    expect(timerSpanFor('end', list, [span('x', 'early', 'end'), span('y', 'late', 'end')])?.span.id).toBe('y')
    expect(timerSpanFor('end', list, [span('x', 'early', 'end', 'Pasta'), span('y', 'late', 'end')])?.span.id).toBe('x')
  })
})

describe('desiredNativeAlarms', () => {
  it('lists future alarms and ones still ringing, soonest first', () => {
    const list = [
      inst('late', 20 * MINUTE, { alarm: true, label: 'Tea' }),
      inst('soon', 5 * MINUTE, { alarm: true }),
      inst('ringing', -MINUTE, { alarm: true }),
      inst('stale', -10 * MINUTE, { alarm: true }),
      inst('plain', 10 * MINUTE),
    ]
    const alarms = desiredNativeAlarms(list, [], now, RING)
    expect(alarms.map(a => [a.instantId, a.at, a.title, a.liveId])).toEqual([
      ['ringing', now - MINUTE, 'Alarm', 0],
      ['soon', now + 5 * MINUTE, 'Alarm', 0],
      ['late', now + 20 * MINUTE, 'Tea', 0],
    ])
    expect(alarms[1].ringText).toMatch(/^Due \d/)
    expect(alarms[2].id).toBe(alarmNotificationIds(list).get('late'))
  })

  it('names a timer after its span and points at its countdown', () => {
    const list = [inst('start', -MINUTE), inst('end', 12 * MINUTE, { alarm: true })]
    const [alarm] = desiredNativeAlarms(list, [span('s', 'start', 'end', '13m timer')], now, RING)
    expect(alarm).toMatchObject({ title: '13m timer', liveId: liveIdFor('countdown', 'end') })
    expect(alarm.ringText).toMatch(/^Time's up · /)
  })

  it('keeps ids stable as other alarms come and go', () => {
    const a = inst('a', MINUTE, { alarm: true })
    const before = desiredNativeAlarms([a], [], now, RING)[0].id
    expect(desiredNativeAlarms([a, inst('b', 2 * MINUTE, { alarm: true })], [], now, RING)[0].id).toBe(before)
  })

  it('caps the number of alarms', () => {
    const many = Array.from({ length: MAX_NATIVE_ALARMS + 10 }, (_, i) => inst(`i${i}`, (i + 1) * MINUTE, { alarm: true }))
    const alarms = desiredNativeAlarms(many, [], now, RING)
    expect(alarms).toHaveLength(MAX_NATIVE_ALARMS)
    expect(alarms[alarms.length - 1].instantId).toBe(`i${MAX_NATIVE_ALARMS - 1}`)
  })
})

describe('replayAlarmActions', () => {
  const fakeOps = (on: string[]) => {
    const alarmed = new Set(on)
    let n = 0
    const ops = {
      isOn: (id: string) => alarmed.has(id),
      dismiss: vi.fn((id: string) => { alarmed.delete(id) }),
      snooze: vi.fn((id: string, at: number | undefined) => { void at; alarmed.delete(id); const next = `snooze${++n}`; alarmed.add(next); return next }),
    }
    return ops
  }

  it('dismisses and snoozes alarms that are still on', () => {
    const ops = fakeOps(['a', 'b'])
    replayAlarmActions([{ type: 'dismiss', instantId: 'a' }, { type: 'snooze', instantId: 'b', at: now + RING }], ops)
    expect(ops.dismiss).toHaveBeenCalledWith('a')
    expect(ops.snooze).toHaveBeenCalledWith('b', now + RING)
  })

  it('follows an alarm through its snoozes (the native side keeps its first name)', () => {
    const ops = fakeOps(['a'])
    replayAlarmActions([
      { type: 'snooze', instantId: 'a', at: now + RING },
      { type: 'snooze', instantId: 'a', at: now + 2 * RING },
      { type: 'dismiss', instantId: 'a' },
    ], ops)
    expect(ops.snooze.mock.calls.map(c => c[0])).toEqual(['a', 'snooze1'])
    expect(ops.dismiss).toHaveBeenCalledWith('snooze2')
  })

  it('skips alarms already answered in the app', () => {
    const ops = fakeOps([])
    replayAlarmActions([{ type: 'dismiss', instantId: 'a' }, { type: 'snooze', instantId: 'a' }], ops)
    expect(ops.dismiss).not.toHaveBeenCalled()
    expect(ops.snooze).not.toHaveBeenCalled()
  })

  it('drops malformed actions', () => {
    expect(sanitizeAlarmActions([
      { type: 'dismiss', instantId: 'a', t: 1 },
      { type: 'snooze', instantId: 'b', at: 5 },
      { type: 'explode', instantId: 'c' },
      { type: 'dismiss' },
      null,
      { type: 'snooze', instantId: 'd', at: 'soon' },
    ])).toEqual([
      { type: 'dismiss', instantId: 'a' },
      { type: 'snooze', instantId: 'b', at: 5 },
      { type: 'snooze', instantId: 'd' },
    ])
    expect(sanitizeAlarmActions('nope')).toEqual([])
  })
})

describe('desiredLiveNotifications', () => {
  it('counts down a timer: a future alarm ending a span that started in the past', () => {
    const list = [inst('start', -MINUTE), inst('end', 12 * MINUTE, { alarm: true, label: '13m timer' })]
    const { items, nextChangeAt } = desiredLiveNotifications(list, [span('s', 'start', 'end', '13m timer')], IDLE_STOPWATCH, now)
    expect(items).toEqual([{
      id: liveIdFor('countdown', 'end'), kind: 'countdown', title: '13m timer', text: expect.stringMatching(/^Rings at /),
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
    const spans = [span('ended', 'a', 'done'), span('noAlarm', 'a', 'plain'), nowSpan('toNow', 'bell')]
    expect(desiredLiveNotifications(list, spans, IDLE_STOPWATCH, now).items).toEqual([])
  })

  it('waits for a span that starts later, and says when', () => {
    const list = [inst('a', 5 * MINUTE), inst('b', 10 * MINUTE, { alarm: true })]
    const { items, nextChangeAt } = desiredLiveNotifications(list, [span('s', 'a', 'b')], IDLE_STOPWATCH, now)
    expect(items).toEqual([])
    expect(nextChangeAt).toBe(now + 5 * MINUTE)
  })

  it('shows one countdown per alarm, named after its timer span', () => {
    const list = [inst('early', -10 * MINUTE), inst('late', -MINUTE), inst('end', MINUTE, { alarm: true })]
    const named = desiredLiveNotifications(list, [span('x', 'early', 'end', 'Pasta'), span('y', 'late', 'end')], IDLE_STOPWATCH, now).items
    expect(named.map(i => i.title)).toEqual(['Pasta'])
  })

  it('counts up a running stopwatch from its start, with the current lap', () => {
    const list = [inst('sw', -5 * MINUTE, { label: 'Stopwatch' }), inst('lap', -MINUTE, { label: 'Lap 1' })]
    const running = desiredLiveNotifications(list, [], { marks: ['sw'], stopped: false }, now).items
    expect(running).toEqual([{
      id: liveIdFor('stopwatch', 'sw'), kind: 'stopwatch', title: 'Stopwatch', text: expect.stringMatching(/^Started /),
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
})

describe('liveTapTarget', () => {
  const list = [inst('sw', -5 * MINUTE), inst('start', -MINUTE), inst('end', MINUTE, { alarm: true }), inst('bell', -MINUTE, { alarm: true })]
  const spans = [nowSpan('swNow', 'sw'), span('timer', 'start', 'end'), nowSpan('endNow', 'end')]

  it('stopwatch: its run so far (the start’s span to Now)', () => {
    expect(liveTapTarget('stopwatch', 'sw', list, spans, now)).toEqual({ spanId: 'swNow' })
    expect(liveTapTarget('stopwatch', 'sw', list, [], now)).toEqual({ instantId: 'sw' })
  })

  it('a running timer: its span', () => {
    expect(liveTapTarget('countdown', 'end', list, spans, now)).toEqual({ spanId: 'timer' })
  })

  it('a timer past its end: the overtime (its span to Now)', () => {
    expect(liveTapTarget('alarm', 'end', list, spans, now + 2 * MINUTE)).toEqual({ spanId: 'endNow' })
  })

  it('a plain alarm: the instant, unless it has a span to Now', () => {
    expect(liveTapTarget('alarm', 'bell', list, spans, now)).toEqual({ instantId: 'bell' })
    expect(liveTapTarget('alarm', 'gone', list, spans, now)).toBeNull()
  })
})

describe('shellStatusItems', () => {
  it('lists what Android allows, with a fix only for what is off', () => {
    const items = shellStatusItems({ notifications: true, alarmChannel: true, exactAlarms: false })
    expect(items.map(i => [i.label, i.ok])).toEqual([['Notifications', true], ['Alarm sound', true], ['Exact alarms', false]])
    expect(items[0].fix).toBeUndefined()
    expect(items[2].fix).toMatch(/Alarms & reminders/)
  })

  it('lists Live Updates when the app reports them', () => {
    const items = shellStatusItems({ notifications: true, alarmChannel: true, exactAlarms: true, liveUpdates: false })
    expect(items.map(i => [i.label, i.ok])).toContainEqual(['Live Updates', false])
    expect(items.at(-1)?.fix).toMatch(/Live Updates/)
  })
})
