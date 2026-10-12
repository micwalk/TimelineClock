// What the Android app (docs/android.md) should have scheduled, ringing or showing, decided from
// the entities alone. services/native applies it: alarms through the app's Alarms plugin, the
// running timer and stopwatch through LiveNotifications.
import { displayName } from './entities.ts'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { alarmLabel, ringKey, ringTime } from './alarms.ts'
import { formatClockCompact, formatDuration } from './format.ts'
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

/** Notification ids for every alarm, past or future, by ring key. */
export const alarmNotificationIds = (instants: readonly InstantRecord[]) =>
  assignNotificationIds(instants.flatMap(i => (i.alarms ?? []).map(a => ringKey(i.id, a.id))))

/** A timer's end: an open (unanswered) alarm at the instant itself. */
const hasOpenAlarmAtInstant = (i: InstantRecord) => !!i.alarms?.some(a => !a.done && a.offsetMs === 0)

/**
 * A live notification's id: stable for its kind and instant, so the native side can replace a
 * timer's countdown with its ringing alarm (AlarmSpec.liveId) without asking the page.
 */
export const liveIdFor = (kind: LiveNotification['kind'], instantId: string) => notificationIdFor(`${kind}:${instantId}`)

/**
 * The timer an instant ends: a saved span (not to Now) whose later end is this instant (what
 * the Timer button makes; also spans made by hand, and snoozes). One per instant: a named span
 * wins, then the latest start. Null when it ends none.
 */
export function timerSpanFor(
  endId: string,
  instants: readonly InstantRecord[],
  spans: readonly SpanRecord[],
): { span: SpanRecord; start: InstantRecord; end: InstantRecord } | null {
  const byId = new Map(instants.map(i => [i.id, i]))
  const end = byId.get(endId)
  if (!end) return null
  let best: { span: SpanRecord; start: InstantRecord; end: InstantRecord } | null = null
  for (const span of spans) {
    if (span.endIsNow) continue
    const otherId = span.endInstantId === endId ? span.startInstantId : span.startInstantId === endId ? span.endInstantId : null
    const start = otherId ? byId.get(otherId) : undefined
    if (!start || start.tsEpochMs > end.tsEpochMs) continue
    const better = !best
      || (!!span.label && !best.span.label)
      || (!!span.label === !!best.span.label && start.tsEpochMs > best.start.tsEpochMs)
    if (better) best = { span, start, end }
  }
  return best
}

/** What the native side rings (AlarmSpec.java). */
export interface NativeAlarm {
  id: number
  /** The alarm's ring key (domain/alarms): the native side passes it back as is. */
  instantId: string
  /** When it rings (epoch ms). */
  at: number
  /** "5m timer", "Wake up". */
  title: string
  /** The line under the time while it rings. */
  ringText: string
  /** The timer's countdown notification, replaced when it rings (0: not a timer). */
  liveId: number
}

/**
 * Alarms as native alarms, soonest first: those ahead, and those that came due within `ringMs`
 * and are still unanswered (ringing, or about to). An alarm at a timer's end is named after the
 * timer's span; one before its instant says how long is left ("Wake up in 15m").
 */
export function desiredNativeAlarms(
  instants: readonly InstantRecord[],
  spans: readonly SpanRecord[],
  now: number,
  ringMs: number,
): NativeAlarm[] {
  const ids = alarmNotificationIds(instants)
  return instants
    .flatMap(inst => (inst.alarms ?? []).filter(a => !a.done && ringTime(inst, a) > now - ringMs).map(alarm => ({ inst, alarm, at: ringTime(inst, alarm) })))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_NATIVE_ALARMS)
    .map(({ inst, alarm, at }) => {
      const key = ringKey(inst.id, alarm.id)
      const clock = formatClockCompact(inst.tsEpochMs, true)
      if (alarm.offsetMs > 0) {
        return { id: ids.get(key)!, instantId: key, at, title: alarmLabel(inst, alarm), ringText: `${formatDuration(alarm.offsetMs, { exact: true })} to go · ${clock}`, liveId: 0 }
      }
      const timer = timerSpanFor(inst.id, instants, spans)
      return {
        id: ids.get(key)!,
        instantId: key,
        at,
        title: timer ? displayName(timer.span.label || inst.label, 'Timer') : displayName(inst.label, 'Alarm'),
        ringText: timer ? `Time's up · ${clock}` : `Due ${clock}`,
        liveId: timer ? liveIdFor('countdown', inst.id) : 0,
      }
    })
}

// ---------------------------------------------------------------------------
// Answers given from a ringing notification, replayed into the entities

/** Recorded by the native side (Alarms.java) while the page may have been frozen. */
export interface NativeAlarmAction {
  type: 'dismiss' | 'snooze'
  /** The alarm's ring key (NativeAlarm.instantId). */
  instantId: string
  /** Snooze: when it rings again. */
  at?: number
}

/** Untrusted actions from the native side, with junk dropped. */
export function sanitizeAlarmActions(raw: unknown): NativeAlarmAction[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x): NativeAlarmAction[] => {
    if (!x || typeof x !== 'object') return []
    const r = x as Record<string, unknown>
    if ((r.type !== 'dismiss' && r.type !== 'snooze') || typeof r.instantId !== 'string') return []
    const at = typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : undefined
    return [{ type: r.type, instantId: r.instantId, ...(at !== undefined ? { at } : {}) }]
  })
}

/**
 * Replays answers in order, by ring key. The native side keeps naming an alarm by its first
 * key even after snoozing it, so a snooze's new alarm takes over that name for the later
 * answers. An answer for an alarm that is already off (answered in the app too) is skipped.
 */
export function replayAlarmActions(
  actions: readonly NativeAlarmAction[],
  ops: {
    isOn: (key: string) => boolean
    dismiss: (key: string) => void
    /** Returns the snooze's new alarm's key. */
    snooze: (key: string, at: number | undefined) => string | undefined
  },
): void {
  const now = new Map<string, string>()
  for (const a of actions) {
    const id = now.get(a.instantId) ?? a.instantId
    if (!ops.isOn(id)) continue
    if (a.type === 'dismiss') ops.dismiss(id)
    else {
      const next = ops.snooze(id, a.at)
      if (next) now.set(a.instantId, next)
    }
  }
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
  /** The instant a tap is about (see liveTapTarget). */
  instantId: string
}

/**
 * Running timers and the stopwatch:
 * - a countdown for each future instant with an alarm at it that ends a timer span (timerSpanFor) that has
 *   started, named after the span (else the alarm). At zero the native side replaces it with
 *   the ringing alarm.
 * - the stopwatch while it runs, counting up from its start.
 * `nextChangeAt` is the next moment this list changes by itself (a timer's start passing).
 */
export function desiredLiveNotifications(
  instants: readonly InstantRecord[],
  spans: readonly SpanRecord[],
  stopwatch: StopwatchState,
  now: number,
): { items: LiveNotification[]; nextChangeAt: number | null } {
  const byId = new Map(instants.map(i => [i.id, i]))
  let nextChangeAt: number | null = null
  const items: LiveNotification[] = []

  const ends = instants.filter(i => hasOpenAlarmAtInstant(i) && i.tsEpochMs > now).sort((a, b) => a.tsEpochMs - b.tsEpochMs)
  for (const end of ends) {
    const timer = timerSpanFor(end.id, instants, spans)
    if (!timer) continue
    if (timer.start.tsEpochMs > now) {
      if (nextChangeAt === null || timer.start.tsEpochMs < nextChangeAt) nextChangeAt = timer.start.tsEpochMs
      continue
    }
    items.push({
      id: liveIdFor('countdown', end.id),
      kind: 'countdown',
      title: displayName(timer.span.label || end.label, 'Timer'),
      text: `Rings at ${formatClockCompact(end.tsEpochMs, true)}`,
      whenMs: end.tsEpochMs,
      instantId: end.id,
    })
  }

  const marks = stopwatchPhase(stopwatch) === 'running' ? stopwatch.marks.map(id => byId.get(id)) : []
  const start = marks[0]
  const last = marks[marks.length - 1]
  if (start && last) {
    items.push({
      id: liveIdFor('stopwatch', start.id),
      kind: 'stopwatch',
      title: stopwatchStartLabel,
      text: marks.length > 1
        ? `Lap ${marks.length} since ${formatClockCompact(last.tsEpochMs, true)}`
        : `Started ${formatClockCompact(start.tsEpochMs, true)}`,
      whenMs: start.tsEpochMs,
      instantId: start.id,
    })
  }
  return { items, nextChangeAt }
}

/** What a notification is about, from its tap: a live notification's kind, or a ringing alarm. */
export type NotificationKind = LiveNotification['kind'] | 'alarm'

/**
 * Where a tap on a notification goes:
 * - the stopwatch: its run so far, the start's span to Now;
 * - a timer or alarm still ahead: the timer's span (else the instant);
 * - one that has come due: its overtime, the instant's span to Now (else the instant).
 */
export function liveTapTarget(
  kind: NotificationKind,
  instantId: string,
  instants: readonly InstantRecord[],
  spans: readonly SpanRecord[],
  now: number,
): { spanId: string } | { instantId: string } | null {
  const inst = instants.find(i => i.id === instantId)
  if (!inst) return null
  const nowSpan = spans.find(sp => sp.startInstantId === instantId && sp.endIsNow)
  if (kind === 'stopwatch') return nowSpan ? { spanId: nowSpan.id } : { instantId }
  if (now < inst.tsEpochMs) {
    const timer = timerSpanFor(instantId, instants, spans)
    return timer ? { spanId: timer.span.id } : { instantId }
  }
  return nowSpan ? { spanId: nowSpan.id } : { instantId }
}

// ---------------------------------------------------------------------------
// What Android allows, shown in Settings inside the Android app

export interface ShellStatus {
  notifications: boolean
  /** The "Alarms and timers" channel isn't turned off. */
  alarmChannel: boolean
  exactAlarms: boolean
  /**
   * Live Updates: the timer, stopwatch and ringing alarm pinned on the lock screen and as a
   * status-bar chip. Missing from early test builds of the app.
   */
  liveUpdates?: boolean
  /** Android's version ("16"). Missing from early test builds of the app. */
  android?: string
}

/** Settings' checklist, with what to do about anything that's off. */
export function shellStatusItems(status: ShellStatus): { label: string; ok: boolean; fix?: string }[] {
  const items = [
    { label: 'Notifications', ok: status.notifications, fix: 'Allow notifications for TimelineClock in Android Settings › Apps.' },
    { label: 'Alarm sound', ok: status.alarmChannel, fix: 'Turn on both “Alarms and timers” notification categories.' },
    { label: 'Exact alarms', ok: status.exactAlarms, fix: 'Allow “Alarms & reminders” in the app’s Android settings.' },
  ]
  if (status.liveUpdates !== undefined) {
    items.push({ label: 'Live Updates', ok: status.liveUpdates, fix: 'Allow Live Updates in the app’s notification settings, to pin timers to the lock screen.' })
  }
  return items.map(item => (item.ok ? { label: item.label, ok: true } : item))
}
