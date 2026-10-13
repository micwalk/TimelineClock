// The Agenda's Alarms tab (TLC-3): every alarm, like a clock app's list. Pure.
//   Repeating: each series, with its next ring (paused ones too).
//   Upcoming:  one-off instants (not in a series) with an alarm still to ring, soonest first.
//   Recent:    alarms that rang in the last day and were answered (dismissed, snoozed), latest first.
import type { AlarmAnswer, AlarmRecord, InstantRecord } from './entities.ts'
import { isArmed, ringTime } from './alarms.ts'
import type { GroupRecord, SeriesRecord } from './series.ts'
import { DAY } from './time.ts'

export interface AlarmList {
  repeating: { series: SeriesRecord; next: InstantRecord | null; nextRing: number | null }[]
  upcoming: { inst: InstantRecord; nextRing: number; count: number }[]
  recent: { inst: InstantRecord; alarm: AlarmRecord; ringTs: number; answered: AlarmAnswer }[]
}

/** When an instant's next alarm rings (its soonest still to ring), or null. */
export function nextRing(inst: InstantRecord, now: number): number | null {
  let best: number | null = null
  for (const a of inst.alarms ?? []) if (isArmed(inst, a, now) && (best === null || ringTime(inst, a) < best)) best = ringTime(inst, a)
  return best
}

export function alarmList(instants: readonly InstantRecord[], groups: readonly GroupRecord[], now: number, recentMs = DAY): AlarmList {
  const repeating = groups.filter(g => g.kind === 'series').map(series => {
    const ahead = instants
      .filter(i => i.seriesId === series.id)
      .map(i => ({ i, ring: nextRing(i, now) }))
      .filter((x): x is { i: InstantRecord; ring: number } => x.ring !== null)
      .sort((a, b) => a.ring - b.ring)[0]
    return { series, next: ahead?.i ?? null, nextRing: ahead?.ring ?? null }
  }).sort((a, b) => (a.nextRing ?? Infinity) - (b.nextRing ?? Infinity) || a.series.time.localeCompare(b.series.time))

  const upcoming = instants
    .filter(i => !i.seriesId)
    .map(inst => ({ inst, nextRing: nextRing(inst, now), count: (inst.alarms ?? []).filter(a => isArmed(inst, a, now)).length }))
    .filter((x): x is { inst: InstantRecord; nextRing: number; count: number } => x.nextRing !== null)
    .sort((a, b) => a.nextRing - b.nextRing)

  const recent = instants
    .flatMap(inst => (inst.alarms ?? []).map(alarm => ({ inst, alarm, ringTs: ringTime(inst, alarm), answered: alarm.answered })))
    .filter((x): x is AlarmList['recent'][number] => !!x.answered && x.ringTs <= now && now - x.ringTs <= recentMs)
    .sort((a, b) => b.ringTs - a.ringTs)

  return { repeating, upcoming, recent }
}
