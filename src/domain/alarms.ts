// Pure alarm logic. Scheduling and side effects live in services/AlarmScheduler.
//
// An instant holds its alarms (entities AlarmRecord): each rings `offsetMs` before the
// instant, so it moves with it. One alarm is named by a ring key, "<instant id>|<alarm id>":
// the ringing list, notifications and the Android app's alarms all use it.
import type { AlarmRecord, InstantRecord } from './entities.ts'
import { displayName, legacyAlarmId } from './entities.ts'
import { formatClockCompact, formatDuration } from './format.ts'
import { SECOND } from './time.ts'

export interface RingingAlarm {
  instantId: string
  alarmId: string
  /** What the alarm says: "Wake up", "Wake up in 15m". */
  label: string
  /** The instant's time. */
  tsEpochMs: number
  triggeredAt: number
}

/**
 * The name of one alarm, for the ringing list, notifications and the Android app. An alarm
 * from before offset alarms keeps the bare instant id it had, so the Android app's alarms
 * carry over unchanged.
 */
export const ringKey = (instantId: string, alarmId: string) =>
  alarmId === legacyAlarmId(instantId) ? instantId : `${instantId}|${alarmId}`

/** The instant and alarm a ring key names (a bare instant id: the instant's alarm from before offset alarms). */
export function parseRingKey(key: string): { instantId: string; alarmId: string } {
  const k = key.indexOf('|')
  return k < 0 ? { instantId: key, alarmId: legacyAlarmId(key) } : { instantId: key.slice(0, k), alarmId: key.slice(k + 1) }
}

/** When an alarm rings. */
export const ringTime = (inst: InstantRecord, a: AlarmRecord) => inst.tsEpochMs - a.offsetMs

/** An alarm still to ring: not answered, and its time is ahead. */
export const isArmed = (inst: InstantRecord, a: AlarmRecord, now: number) => !a.answered && ringTime(inst, a) > now

export const hasArmedAlarm = (inst: InstantRecord, now: number) => !!inst.alarms?.some(a => isArmed(inst, a, now))

/** Alarms not answered yet (ahead, ringing, or missed). */
export const openAlarms = (inst: InstantRecord) => inst.alarms?.filter(a => !a.answered) ?? []

export const findAlarm = (inst: InstantRecord | undefined, alarmId: string) => inst?.alarms?.find(a => a.id === alarmId)

/**
 * "Wake up" for an alarm at its instant; "Wake up in 15m" for a warning before it; "Wake up
 * (snoozed)" for a snooze after it. Unnamed instants read as their time.
 */
export function alarmLabel(inst: InstantRecord, a: AlarmRecord): string {
  if (a.offsetMs === 0) return inst.label
  const name = displayName(inst.label, formatClockCompact(inst.tsEpochMs, false))
  return a.offsetMs > 0 ? `${name} in ${formatDuration(a.offsetMs, { exact: true })}` : `${name} (snoozed)`
}

// ---------------------------------------------------------------------------
// Snoozing and skipping. A snooze is another alarm on the same instant, never a new instant.

/**
 * Where snoozing an alarm until `at` lands:
 * - `{ offsetMs }`: a new alarm, that far before its instant (negative: after it).
 * - `{ joins }`: nothing new; the instant's own alarm (that id) still rings and covers it.
 * Snoozes land on whole seconds ("+5:00", not "+5:04.815"), and the instant rules apply to
 * that rounded time, so rounding can never make a second alarm at the instant or move one
 * across it:
 * - A warning (before its instant) that would land past the instant, or within `joinMs` before
 *   it (a moment before the instant's own alarm), lands on the instant: it joins the alarm
 *   already there, or becomes it (offset exactly 0).
 * - A snooze of the alarm at (or after) its instant stays after it: at least a second.
 */
export type SnoozeLanding = { offsetMs: number; ringTs: number } | { joins: string; ringTs: number }

/** How close before its instant a snoozed warning joins the instant (a tunable overrides it: Settings > Advanced). */
export const SNOOZE_JOIN_MS = 60 * SECOND

export function snoozeLanding(inst: InstantRecord, alarm: AlarmRecord, at: number, now: number, joinMs = SNOOZE_JOIN_MS): SnoozeLanding {
  const ts = inst.tsEpochMs
  let offsetMs = Math.round((ts - at) / SECOND) * SECOND
  if (alarm.offsetMs > 0 && offsetMs < Math.max(SECOND, joinMs)) {
    const atInstant = inst.alarms?.find(a => a.id !== alarm.id && a.offsetMs === 0 && !a.answered && ts >= now)
    return atInstant ? { joins: atInstant.id, ringTs: ts } : { offsetMs: 0, ringTs: ts }
  }
  if (alarm.offsetMs <= 0) offsetMs = Math.min(offsetMs, -SECOND)
  return { offsetMs, ringTs: ts - offsetMs }
}

/** A warning: an alarm before its instant. */
export const isWarning = (a: AlarmRecord) => a.offsetMs > 0

/** The alarms "Skip warnings" answers: unanswered warnings (the alarm at the instant stays). */
export const warningsToSkip = (inst: InstantRecord) => (inst.alarms ?? []).filter(a => !a.answered && isWarning(a))

/** The alarms "Skip all" answers: every unanswered one. */
export const alarmsToSkip = (inst: InstantRecord) => (inst.alarms ?? []).filter(a => !a.answered)

export interface DueAlarm {
  inst: InstantRecord
  alarm: AlarmRecord
}

/**
 * Alarms that should start ringing at `now`: not answered, due, not already ringing (by ring
 * key), and not older than `graceMs` (so long-closed tabs don't ring stale alarms). Using a
 * window instead of an exact match means throttled background timers can't skip an alarm.
 */
export function findDueAlarms(instants: readonly InstantRecord[], now: number, ringingKeys: Set<string>, graceMs: number): DueAlarm[] {
  const out: DueAlarm[] = []
  for (const inst of instants) {
    for (const alarm of inst.alarms ?? []) {
      const at = ringTime(inst, alarm)
      if (!alarm.answered && at <= now && now - at <= graceMs && !ringingKeys.has(ringKey(inst.id, alarm.id))) out.push({ inst, alarm })
    }
  }
  return out
}

export function nextAlarmTime(instants: readonly InstantRecord[], now: number): number | null {
  let best: number | null = null
  for (const inst of instants) {
    for (const a of inst.alarms ?? []) {
      const at = ringTime(inst, a)
      if (!a.answered && at > now && (best === null || at < best)) best = at
    }
  }
  return best
}

/**
 * An alarm still to ring is never hidden: an instant with one can't be hidden. Shows any hidden
 * instant that has one (data from before the rule). Returns the input when it already follows it.
 */
export function syncAlarmVisibility(instants: InstantRecord[], now: number): InstantRecord[] {
  const breaks = (i: InstantRecord) => !!i.hidden && hasArmedAlarm(i, now)
  return instants.some(breaks) ? instants.map(i => (breaks(i) ? { ...i, hidden: false } : i)) : instants
}

const SNOOZE_PREFIX = /^(?:Snooze\s+\d+:\s*)+/i

export function snoozeBaseLabel(label: string): string {
  return label.replace(SNOOZE_PREFIX, '')
}

const LATEST_SNOOZE = /^Snooze\s+(\d+):/i

/** "Snooze 3: Snooze 2: Wake up" → { base: 'Wake up', count: 3 }; null for other labels. */
export function parseSnoozeLabel(label: string): { base: string; count: number } | null {
  const m = LATEST_SNOOZE.exec(label)
  return m ? { base: snoozeBaseLabel(label), count: Number(m[1]) } : null
}

export function snoozeLabel(baseLabel: string, count: number): string {
  return `Snooze ${count}: ${snoozeBaseLabel(baseLabel)}`
}
