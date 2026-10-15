import { describe, expect, it } from 'vitest'
import type { InstantRecord } from './entities.ts'
import type { SeriesRecord } from './series.ts'
import {
  EVERY_DAY, WEEKDAYS, WEEKENDS, clockKey, duplicateOccurrences, dateKey, daysBetween, describeRepeat, describeRepeatShort, nextDateKey, nextOccurrence, occurrenceTs, occursOn,
  occursAheadBefore, parseVirtualId, planOccurrences, prevDateKey, splitSeries, refreshOccurrence, remakeable, ruleFromOccurrence, sanitizeGroups, seriesFromInstant, virtualOccurrences,
} from './series.ts'
import { DAY, MINUTE } from './time.ts'

// Monday 2026-10-12, local time.
const at = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).getTime()
const series = (o: Partial<SeriesRecord> = {}): SeriesRecord => ({
  id: 'g', kind: 'series', label: 'Wake up', time: '07:00', repeat: { kind: 'weekly', days: WEEKDAYS }, alarms: [0, 15 * MINUTE], from: '2026-10-12', ...o,
})
let n = 0
const ids = { instant: () => `i${++n}`, alarm: () => `a${++n}` }

describe('dates', () => {
  it('reads local dates and wall-clock times', () => {
    expect(dateKey(at(12, 23, 59))).toBe('2026-10-12')
    expect(clockKey(at(12, 7, 5))).toBe('07:05')
    expect(nextDateKey('2026-10-31')).toBe('2026-11-01')
    expect(daysBetween('2026-10-12', '2026-11-02')).toBe(21)
    expect(occurrenceTs(series(), '2026-10-13')).toBe(at(13, 7))
  })
})

describe('occursOn', () => {
  it('runs on its days, inside its dates, minus skipped ones', () => {
    const s = series({ until: '2026-10-23', skips: ['2026-10-14'] })
    expect(['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-17', '2026-10-23', '2026-10-26'].map(d => occursOn(s, d)))
      .toEqual([false, true, false, false, true, false])
  })
  it('every N days from its first date', () => {
    const s = series({ repeat: { kind: 'interval', every: 3 } })
    expect(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-18'].map(d => occursOn(s, d))).toEqual([true, false, true, true])
  })
})

describe('nextOccurrence', () => {
  it('finds the next one after now, and none for a paused or ended series', () => {
    expect(nextOccurrence(series(), at(12, 8))).toEqual({ date: '2026-10-13', ts: at(13, 7) })
    expect(nextOccurrence(series(), at(16, 8))?.date).toBe('2026-10-19') // Friday → Monday
    expect(nextOccurrence(series({ paused: true }), at(12, 8))).toBeNull()
    expect(nextOccurrence(series({ until: '2026-10-12' }), at(12, 8))).toBeNull()
  })
})

describe('planOccurrences', () => {
  it('makes the missing occurrences from now to the horizon, with the series’ alarms', () => {
    const made = planOccurrences([series()], [], at(12, 8), at(12, 8) + 7 * DAY, ids)
    expect(made.map(i => i.occurrence)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19'])
    expect(made[0]).toMatchObject({ tsEpochMs: at(13, 7), label: 'Wake up', seriesId: 'g' })
    expect(made[0].alarms?.map(a => a.offsetMs)).toEqual([0, 15 * MINUTE])
  })
  it('never makes one twice, nor back-fills the past, nor for a paused series', () => {
    const have: InstantRecord = { id: 'x', tsEpochMs: at(13, 7), label: 'Wake up', seriesId: 'g', occurrence: '2026-10-13' }
    expect(planOccurrences([series()], [have], at(12, 8), at(13, 23), ids)).toEqual([])
    expect(planOccurrences([series()], [], at(12, 8), at(12, 23), ids)).toEqual([]) // today's 7:00 has passed
    expect(planOccurrences([series({ paused: true })], [], at(12, 8), at(20), ids)).toEqual([])
  })
})

describe('remaking after a rule change', () => {
  it('remakes only occurrences ahead, never edited, with no alarm answered', () => {
    const now = at(13, 12)
    const list: InstantRecord[] = [
      { id: 'past', tsEpochMs: at(13, 7), label: '', seriesId: 'g', occurrence: '2026-10-13' },
      { id: 'plain', tsEpochMs: at(14, 7), label: '', seriesId: 'g', occurrence: '2026-10-14' },
      { id: 'edited', tsEpochMs: at(15, 7), label: '', seriesId: 'g', occurrence: '2026-10-15', seriesEdited: true },
      { id: 'answered', tsEpochMs: at(16, 7), label: '', seriesId: 'g', occurrence: '2026-10-16', alarms: [{ id: 'a', offsetMs: 2 * DAY, answered: 'dismissed' }] },
      { id: 'other', tsEpochMs: at(14, 7), label: '', seriesId: 'h', occurrence: '2026-10-14' },
    ]
    expect(remakeable(series(), list, now).map(i => i.id)).toEqual(['plain'])
  })
  it('takes the rule from an occurrence: name, time of day, alarms (not snoozes)', () => {
    const inst: InstantRecord = { id: 'i', tsEpochMs: at(14, 6, 30), label: 'Up!', alarms: [
      { id: 'a', offsetMs: 0 }, { id: 'b', offsetMs: 10 * MINUTE }, { id: 'c', offsetMs: -5 * MINUTE, snoozeOf: 'a' },
    ] }
    expect(ruleFromOccurrence(inst)).toEqual({ label: 'Up!', time: '06:30', alarms: [10 * MINUTE, 0] })
    expect(seriesFromInstant(inst, { kind: 'weekly', days: WEEKENDS }, 'g2')).toMatchObject({ id: 'g2', from: '2026-10-14', time: '06:30' })
  })
})

describe('computed occurrences (past the horizon)', () => {
  it('are computed for the window, never where an instant exists, never in the past, and are marked virtual', () => {
    const have: InstantRecord = { id: 'x', tsEpochMs: at(14, 7), label: 'Wake up', seriesId: 'g', occurrence: '2026-10-14' }
    const out = virtualOccurrences([series(), series({ id: 'p', paused: true })], [have], at(13, 8), at(12), at(16, 23))
    expect(out.map(i => i.occurrence)).toEqual(['2026-10-15', '2026-10-16'])
    expect(out[0]).toMatchObject({ id: 'v:g@2026-10-15', virtual: true, seriesId: 'g', tsEpochMs: at(15, 7) })
    expect(out[0].alarms?.map(a => a.offsetMs)).toEqual([0, 15 * MINUTE])
    expect(parseVirtualId(out[0].id)).toEqual({ seriesId: 'g', date: '2026-10-15' })
    expect(parseVirtualId('i_123')).toBeNull()
  })
})

describe('refreshOccurrence', () => {
  const inst: InstantRecord = { id: 'o', tsEpochMs: at(14, 7), label: 'Wake up', seriesId: 'g', occurrence: '2026-10-14',
    alarms: [{ id: 'keep', offsetMs: 0 }, { id: 'drop', offsetMs: 15 * MINUTE }] }
  it('takes the new time, name and alarms in place, keeping alarm ids at offsets it had', () => {
    const next = refreshOccurrence(series({ time: '06:30', label: 'Up', alarms: [0, 5 * MINUTE] }), inst, at(13), () => 'new')
    expect(next).toMatchObject({ id: 'o', tsEpochMs: at(14, 6, 30), label: 'Up', alarms: [{ id: 'keep', offsetMs: 0 }, { id: 'new', offsetMs: 5 * MINUTE }] })
  })
  it('goes when the rule no longer runs that day, the series is paused, or its new time has passed', () => {
    expect(refreshOccurrence(series({ repeat: { kind: 'weekly', days: [1] } }), inst, at(13), () => 'n')).toBeNull()
    expect(refreshOccurrence(series({ paused: true }), inst, at(13), () => 'n')).toBeNull()
    expect(refreshOccurrence(series({ time: '06:00' }), inst, at(14, 6, 30), () => 'n')).toBeNull()
  })
})

describe('describeRepeat', () => {
  it('reads like a phone alarm', () => {
    expect(describeRepeat({ kind: 'weekly', days: EVERY_DAY })).toBe('Daily')
    expect(describeRepeat({ kind: 'weekly', days: WEEKDAYS })).toBe('Weekdays')
    expect(describeRepeat({ kind: 'weekly', days: [0, 6] })).toBe('Weekends')
    expect(describeRepeat({ kind: 'weekly', days: [5, 1, 3] })).toBe('Mon, Wed, Fri')
    expect(describeRepeat({ kind: 'interval', every: 3 })).toBe('Every 3 days')
  })
  it('has a short form for tight spots', () => {
    expect(describeRepeatShort({ kind: 'weekly', days: [5, 1, 3] })).toBe('MWF')
    expect(describeRepeatShort({ kind: 'weekly', days: [2, 4] })).toBe('TuTh')
    expect(describeRepeatShort({ kind: 'weekly', days: WEEKDAYS })).toBe('Wkdays')
    expect(describeRepeatShort({ kind: 'interval', every: 3 })).toBe('Every 3d')
  })
})

describe('sanitizeGroups', () => {
  it('keeps well-formed series only', () => {
    const good = series({ until: '2026-12-01', skips: ['2026-10-14', 'bad'], paused: true })
    const out = sanitizeGroups([good, { ...good, id: 'g' }, { ...series({ id: 'h' }), time: '25:00' }, { ...series({ id: 'k' }), repeat: { kind: 'weekly', days: [] } }, 'junk'])
    expect(out).toEqual([{ ...good, skips: ['2026-10-14'] }])
  })
})

describe('splitting a series ("apply to all future" while earlier ones are ahead)', () => {
  it('knows whether an earlier occurrence is still ahead', () => {
    expect(occursAheadBefore(series(), '2026-10-14', at(12, 8))).toBe(true) // Tue the 13th is ahead
    expect(occursAheadBefore(series(), '2026-10-13', at(12, 8))).toBe(false) // Mon the 12th has passed
    expect(occursAheadBefore(series({ paused: true }), '2026-10-14', at(12, 8))).toBe(false)
  })

  it('ends the old part the day before; the new part runs from that date with the new rule', () => {
    const s = series({ skips: ['2026-10-13', '2026-10-20'], until: '2026-12-31' })
    const [old, next] = splitSeries(s, '2026-10-15', { label: 'Up', time: '06:30', alarms: [0] }, 'g2')
    expect(prevDateKey('2026-11-01')).toBe('2026-10-31')
    expect(old).toMatchObject({ id: 'g', label: 'Wake up', time: '07:00', until: '2026-10-14', skips: ['2026-10-13'] })
    expect(next).toMatchObject({ id: 'g2', label: 'Up', time: '06:30', alarms: [0], from: '2026-10-15', until: '2026-12-31', skips: ['2026-10-20'] })
    expect(occursOn(next, '2026-10-14')).toBe(false)
    expect(occursOn(next, '2026-10-16')).toBe(true)
  })
})

describe('duplicateOccurrences', () => {
  it('drops spare untouched copies of a series date, keeping the edited one', () => {
    const occ = (id: string, o: Partial<InstantRecord> = {}): InstantRecord => ({ id, tsEpochMs: at(13, 7), label: 'x', seriesId: 'g', occurrence: '2026-10-13', ...o })
    expect(duplicateOccurrences([occ('a'), occ('b', { seriesEdited: true }), occ('c'), occ('d', { occurrence: '2026-10-14' })])).toEqual(['a', 'c'])
    expect(duplicateOccurrences([occ('a', { alarms: [{ id: 'r', offsetMs: 0, answered: 'dismissed' }] }), occ('b', { seriesEdited: true })])).toEqual([])
  })
})
