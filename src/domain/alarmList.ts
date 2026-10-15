// The Agenda's Alarms tab (TLC-3): every alarm, like a clock app's list. Pure.
//   Repeating: each series with alarms, with its next ring (paused ones too; ended ones go once their last day passed).
// The Repeats tab (repeatList) lists every series, alarms or not.
//   Upcoming:  one-off instants (not in a series) with an alarm still to ring, soonest first.
//   Recent:    alarms that rang in the last day and were answered (dismissed, snoozed), latest first.
import type { AlarmAnswer, AlarmRecord, InstantRecord } from './entities.ts'
import { isArmed, ringTime } from './alarms.ts'
import type { GroupRecord, SeriesRecord } from './series.ts'
import { dateKey } from './series.ts'
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
  const today = dateKey(now)
  const repeating = groups.filter(g => g.kind === 'series' && g.alarms.length > 0 && !(g.until && g.until < today)).map(series => {
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

export interface RepeatRow {
  series: SeriesRecord
  /** Its next occurrence still ahead (stored), or null. */
  next: InstantRecord | null
}

/** The Agenda's Repeats tab: every series (alarms or not) not ended yet, the next one first. */
export function repeatList(instants: readonly InstantRecord[], groups: readonly GroupRecord[], now: number): RepeatRow[] {
  const today = dateKey(now)
  return groups.filter(g => g.kind === 'series' && !(g.until && g.until < today)).map(series => ({
    series,
    next: instants.filter(i => i.seriesId === series.id && i.tsEpochMs > now).sort((a, b) => a.tsEpochMs - b.tsEpochMs)[0] ?? null,
  })).sort((a, b) => (a.next?.tsEpochMs ?? Infinity) - (b.next?.tsEpochMs ?? Infinity) || a.series.time.localeCompare(b.series.time))
}
