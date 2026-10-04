// What the Android app (docs/android.md) should have scheduled or showing, decided from the
// entities alone. services/native applies it: alarm notifications through the
// LocalNotifications plugin, the running timer and stopwatch through LiveNotifications.
import { displayName } from './entities.ts'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { formatClockCompact } from './format.ts'
import type { StopwatchState } from './quickCreate.ts'
import { stopwatchPhase, stopwatchStartLabel } from './quickCreate.ts'

/** Android keeps at most 500 alarms per app; the soonest this many are plenty. */
export const MAX_NATIVE_ALARMS = 64

/**
 * A stable positive 31-bit notification id for a key (an instant id): Android notification
 * ids are 32-bit ints. FNV-1a; never 0.
 */
export function notificationIdFor(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h & 0x7fffffff) || 1
}

/**
 * Ids for these keys, distinct even if two keys hash alike: keys are taken in sorted order
 * and a clash moves to the next free id, so the same set always gets the same ids.
 */
export function assignNotificationIds(keys: Iterable<string>): Map<string, number> {
  const ids = new Map<string, number>()
  const used = new Set<number>()
  for (const key of [...new Set(keys)].sort()) {
    let id = notificationIdFor(key)
    while (used.has(id)) id = id >= 0x7fffffff ? 1 : id + 1
    used.add(id)
    ids.set(key, id)
  }
  return ids
}

/** The ids of every alarmed instant, past or future (a delivered notification belongs to one of these). */
export const alarmNotificationIds = (instants: readonly InstantRecord[]) =>
  assignNotificationIds(instants.filter(i => i.alarm).map(i => i.id))

export interface NativeAlarm {
  notificationId: number
  instantId: string
  /** When it rings (epoch ms). */
  at: number
  title: string
  body: string
}

/** Future alarmed instants as alarm notifications, soonest first. */
export function desiredNativeAlarms(instants: readonly InstantRecord[], now: number): NativeAlarm[] {
  const ids = alarmNotificationIds(instants)
  return instants
    .filter(i => i.alarm && i.tsEpochMs > now)
    .sort((a, b) => a.tsEpochMs - b.tsEpochMs)
    .slice(0, MAX_NATIVE_ALARMS)
    .map(i => ({
      notificationId: ids.get(i.id)!,
      instantId: i.id,
      at: i.tsEpochMs,
      title: displayName(i.label, 'Alarm'),
      body: `Due at ${formatClockCompact(i.tsEpochMs, true)}`,
    }))
}

const sameAlarm = (a: NativeAlarm, b: NativeAlarm) =>
  a.instantId === b.instantId && a.at === b.at && a.title === b.title && a.body === b.body

/**
 * How to get from what was scheduled to what should be: cancel what went away or changed,
 * schedule what is new or changed. Cancelling only removes pending alarms, never a
 * notification already showing.
 */
export function planAlarmSync(scheduled: ReadonlyMap<number, NativeAlarm>, desired: readonly NativeAlarm[]): { cancel: number[]; schedule: NativeAlarm[] } {
  const want = new Map(desired.map(a => [a.notificationId, a]))
  const cancel: number[] = []
  for (const [id, a] of scheduled) {
    const w = want.get(id)
    if (!w || !sameAlarm(a, w)) cancel.push(id)
  }
  const schedule = desired.filter(a => {
    const had = scheduled.get(a.notificationId)
    return !had || !sameAlarm(had, a)
  })
  return { cancel, schedule }
}

/**
 * Delivered alarm notifications whose alarm was answered (dismissed or snoozed in the app),
 * turned off or deleted: they should leave the notification shade.
 */
export function staleDeliveredAlarms(deliveredIds: readonly number[], instants: readonly InstantRecord[]): number[] {
  const live = new Set(alarmNotificationIds(instants).values())
  return deliveredIds.filter(id => !live.has(id))
}

// ---------------------------------------------------------------------------
// Live notifications: the running timer and stopwatch

export interface LiveNotification {
  id: number
  /** countdown: to `whenMs`; stopwatch: up from `whenMs`. */
  kind: 'countdown' | 'stopwatch'
  title: string
  text: string
  whenMs: number
  /** The instant a tap goes to. */
  instantId: string
}

/**
 * Running timers and the stopwatch:
 * - a countdown for each future alarmed instant that ends a saved span whose other end is
 *   already past (what the Timer button makes; also spans made by hand, and snoozes), named
 *   after the span (else the alarm). One per alarm: a named span wins, then the latest start.
 * - the stopwatch while it runs, counting up from its start.
 * `nextChangeAt` is the next moment this list changes by itself (a span's start passing).
 */
export function desiredLiveNotifications(
  instants: readonly InstantRecord[],
  spans: readonly SpanRecord[],
  stopwatch: StopwatchState,
  now: number,
): { items: LiveNotification[]; nextChangeAt: number | null } {
  const byId = new Map(instants.map(i => [i.id, i]))
  const timers = new Map<string, { span: SpanRecord; start: InstantRecord; end: InstantRecord }>()
  let nextChangeAt: number | null = null
  const later = (t: number) => { if (nextChangeAt === null || t < nextChangeAt) nextChangeAt = t }

  for (const span of spans) {
    if (span.endIsNow) continue
    const a = byId.get(span.startInstantId)
    const b = byId.get(span.endInstantId)
    if (!a || !b) continue
    const [start, end] = a.tsEpochMs <= b.tsEpochMs ? [a, b] : [b, a]
    if (!end.alarm || end.tsEpochMs <= now) continue
    if (start.tsEpochMs > now) { later(start.tsEpochMs); continue }
    const prev = timers.get(end.id)
    const better = !prev
      || (!!span.label && !prev.span.label)
      || (!!span.label === !!prev.span.label && start.tsEpochMs > prev.start.tsEpochMs)
    if (better) timers.set(end.id, { span, start, end })
  }

  const items: Omit<LiveNotification, 'id'>[] = [...timers.values()]
    .sort((x, y) => x.end.tsEpochMs - y.end.tsEpochMs)
    .map(({ span, end }) => ({
      kind: 'countdown' as const,
      title: displayName(span.label || end.label, 'Timer'),
      text: `Rings at ${formatClockCompact(end.tsEpochMs, true)}`,
      whenMs: end.tsEpochMs,
      instantId: end.id,
    }))

  const marks = stopwatchPhase(stopwatch) === 'running' ? stopwatch.marks.map(id => byId.get(id)) : []
  const start = marks[0]
  const last = marks[marks.length - 1]
  if (start && last) {
    items.push({
      kind: 'stopwatch',
      title: stopwatchStartLabel,
      text: marks.length > 1
        ? `Lap ${marks.length} since ${formatClockCompact(last.tsEpochMs, true)}`
        : `Started ${formatClockCompact(start.tsEpochMs, true)}`,
      whenMs: start.tsEpochMs,
      instantId: start.id,
    })
  }
  const key = (it: Omit<LiveNotification, 'id'>) => `${it.kind}:${it.instantId}`
  const ids = assignNotificationIds(items.map(key))
  return { items: items.map(it => ({ id: ids.get(key(it))!, ...it })), nextChangeAt }
}

// ---------------------------------------------------------------------------
// What Android allows, shown in Settings inside the Android app

export interface ShellStatus {
  notifications: boolean
  /** The "Alarms and timers" channel isn't turned off. */
  alarmChannel: boolean
  exactAlarms: boolean
  /** Live Updates (status-bar chips) for the running timer and stopwatch. */
  liveUpdates: boolean
}

/** Settings' checklist, with what to do about anything that's off. */
export function shellStatusItems(status: ShellStatus): { label: string; ok: boolean; fix?: string }[] {
  return [
    { label: 'Notifications', ok: status.notifications, fix: 'Allow notifications for Timeline Clock in Android Settings › Apps.' },
    { label: 'Alarm sound', ok: status.alarmChannel, fix: 'Turn on the “Alarms and timers” notification category.' },
    { label: 'Exact alarms', ok: status.exactAlarms, fix: 'Allow “Alarms & reminders” in the app’s Android settings.' },
    { label: 'Live Updates', ok: status.liveUpdates, fix: 'Optional: allow Live Updates in the app’s notification settings.' },
  ].map(item => (item.ok ? { label: item.label, ok: true } : item))
}
