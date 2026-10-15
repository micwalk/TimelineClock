import { describe, expect, it } from 'vitest'
import type { InstantRecord } from './entities.ts'
import type { SeriesRecord } from './series.ts'
import { alarmList, nextRing, repeatList } from './alarmList.ts'
import { HOUR, MINUTE } from './time.ts'

const now = 1_800_000_000_000
const inst = (id: string, offsetMs: number, o: Partial<InstantRecord> = {}): InstantRecord => ({ id, tsEpochMs: now + offsetMs, label: id, ...o })
const series = (id: string, o: Partial<SeriesRecord> = {}): SeriesRecord =>
  ({ id, kind: 'series', label: id, time: '07:00', repeat: { kind: 'weekly', days: [1] }, alarms: [0], from: '2026-01-01', ...o })

describe('alarmList', () => {
  const list = [
    inst('tea', 2 * HOUR, { alarms: [{ id: 'a', offsetMs: 0 }, { id: 'w', offsetMs: 30 * MINUTE }] }),
    inst('call', HOUR, { alarms: [{ id: 'a', offsetMs: 0 }] }),
    inst('plain', HOUR),
    inst('wake1', 5 * HOUR, { seriesId: 'g', occurrence: 'x', alarms: [{ id: 'a', offsetMs: 0 }] }),
    inst('wake0', -20 * HOUR, { seriesId: 'g', occurrence: 'y', alarms: [{ id: 'a', offsetMs: 0, answered: 'dismissed' }] }),
    inst('old', -3 * HOUR, { alarms: [{ id: 'a', offsetMs: 0, answered: 'snoozed' }, { id: 's', offsetMs: -5 * MINUTE, snoozeOf: 'a', answered: 'dismissed' }] }),
    inst('ancient', -30 * HOUR, { alarms: [{ id: 'a', offsetMs: 0, answered: 'dismissed' }] }),
  ]

  it('lists series with their next ring, one-offs with alarms to ring, and what rang in the last day', () => {
    const out = alarmList(list, [series('g'), series('paused', { paused: true })], now)
    expect(out.repeating.map(r => [r.series.id, r.next?.id ?? null])).toEqual([['g', 'wake1'], ['paused', null]])
    expect(out.upcoming.map(u => [u.inst.id, u.count])).toEqual([['call', 1], ['tea', 2]]) // call at 1h; tea's warning at 1h30
    expect(out.recent.map(r => [r.inst.id, r.alarm.id, r.answered])).toEqual([['old', 's', 'dismissed'], ['old', 'a', 'snoozed'], ['wake0', 'a', 'dismissed']])
  })

  it('finds an instant’s next ring among its alarms still to ring', () => {
    expect(nextRing(list[0], now)).toBe(now + 90 * MINUTE)
    expect(nextRing(list[2], now)).toBeNull()
  })
})

describe('repeatList', () => {
  it('every series not ended, alarms or not, the next one first; the Alarms tab only those with alarms', () => {
    const groups = [series('quiet', { alarms: [] }), series('loud'), series('old', { until: '2020-01-01' })]
    const instants = [inst('q1', 3 * HOUR, { seriesId: 'quiet', occurrence: '2027-01-01' }), inst('l1', HOUR, { seriesId: 'loud', occurrence: '2027-01-01', alarms: [{ id: 'a', offsetMs: 0 }] })]
    expect(repeatList(instants, groups, now).map(r => [r.series.id, r.next?.id])).toEqual([['loud', 'l1'], ['quiet', 'q1']])
    expect(alarmList(instants, groups, now).repeating.map(r => r.series.id)).toEqual(['loud'])
  })
})
