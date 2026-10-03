// Pure alarm logic. Scheduling and side effects live in services/AlarmScheduler.
import type { InstantRecord } from './entities.ts'

export interface RingingAlarm {
  instantId: string
  label: string
  tsEpochMs: number
  triggeredAt: number
}

/**
 * Alarms that should start ringing at `now`: enabled, due, not already ringing,
 * and not older than `graceMs` (so long-closed tabs don't ring stale alarms).
 * Using a window instead of an exact match means throttled background timers
 * can't skip an alarm.
 */
export function findDueAlarms(instants: InstantRecord[], now: number, ringingIds: Set<string>, graceMs: number): InstantRecord[] {
  return instants.filter(i => i.alarm && i.tsEpochMs <= now && now - i.tsEpochMs <= graceMs && !ringingIds.has(i.id))
}

export function nextAlarmTime(instants: InstantRecord[], now: number): number | null {
  let best: number | null = null
  for (const i of instants) {
    if (i.alarm && i.tsEpochMs > now && (best === null || i.tsEpochMs < best)) best = i.tsEpochMs
  }
  return best
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
