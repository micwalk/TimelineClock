import { describe, expect, it } from 'vitest'
import type { AlarmRecord, InstantRecord } from './entities.ts'
import type { BellOptions } from './bells.ts'
import { bellsToShow } from './bells.ts'
import { ringKey } from './alarms.ts'
import { MINUTE } from './time.ts'

const now = 1_800_000_000_000
const inst = (id: string, offsetMs: number, alarms: AlarmRecord[]): InstantRecord => ({ id, tsEpochMs: now + offsetMs, label: id, alarms })
/** 1px per minute, everything on screen. */
const opts = (o: Partial<BellOptions> = {}): BellOptions => ({
  now, pos: ts => (ts - now) / MINUTE, lo: -Infinity, hi: Infinity,
  ringingKeys: new Set(), revealPast: new Set(), collapsePx: 10, dragging: null, ...o,
})
const ids = (r: ReturnType<typeof bellsToShow>) => r.shown.map(b => b.alarm.id)

describe('bellsToShow', () => {
  const wake = inst('wake', 60 * MINUTE, [{ id: 'at', offsetMs: 0 }, { id: 'm5', offsetMs: 5 * MINUTE }, { id: 'm15', offsetMs: 15 * MINUTE }])

  it('draws bells before their instant; the one at the instant is on its chip', () => {
    expect(ids(bellsToShow([wake], opts()))).toEqual(['m15'])
  })

  it('folds a live bell too close to its instant into the chip, and counts it', () => {
    expect(bellsToShow([wake], opts()).folded).toEqual({ wake: 1 })
    // Zoomed out (0.5px per minute): both fold.
    const r = bellsToShow([wake], opts({ pos: ts => (ts - now) / MINUTE / 2 }))
    expect(r.shown).toEqual([])
    expect(r.folded).toEqual({ wake: 2 })
  })

  it('never hides a live bell, ringing ones included, but leaves off-screen ones out', () => {
    const ringing = inst('meeting', 2 * MINUTE, [{ id: 'm30', offsetMs: 30 * MINUTE }])
    const r = bellsToShow([ringing], opts({ ringingKeys: new Set([ringKey('meeting', 'm30')]) }))
    expect(r.shown.map(b => [b.alarm.id, b.past])).toEqual([['m30', false]])
    expect(ids(bellsToShow([wake], opts({ lo: now, hi: now + 30 * MINUTE })))).toEqual([])
  })

  it('keeps a bell off screen while its line to its instant crosses the screen', () => {
    // On screen: 55m to 70m. m15 rings at 45m (off screen); its line runs to the instant at 60m.
    expect(ids(bellsToShow([wake], opts({ lo: now + 55 * MINUTE, hi: now + 70 * MINUTE })))).toEqual(['m15'])
  })

  it('shows history (answered or missed) only while its instant is selected or focused, hollow', () => {
    const standup = inst('standup', -60 * MINUTE, [{ id: 'heard', offsetMs: 30 * MINUTE, answered: 'dismissed' }, { id: 'missed', offsetMs: 20 * MINUTE }])
    expect(ids(bellsToShow([standup], opts()))).toEqual([])
    const r = bellsToShow([standup], opts({ revealPast: new Set(['standup']) }))
    expect(r.shown.map(b => [b.alarm.id, b.past])).toEqual([['heard', true], ['missed', true]])
    expect(r.folded).toEqual({})
  })

  it('always shows the bell being dragged, at the drag’s time', () => {
    const r = bellsToShow([wake], opts({ dragging: { alarmId: 'at', ringTs: now + 50 * MINUTE } }))
    expect(r.shown.find(b => b.alarm.id === 'at')?.ringTs).toBe(now + 50 * MINUTE)
  })
})
