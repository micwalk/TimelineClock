// Persisted domain records. Field names match the original localStorage format
// ('timeline.saved.v1' / 'timeline.spans.v1') so existing data keeps loading.
import type { SunAnchor } from './sunEvents.ts'
import { sanitizeSunAnchor } from './sunEvents.ts'
import type { Visibility } from './displayGroups.ts'
import { sanitizeVisibility } from './displayGroups.ts'

export interface InstantRecord {
  id: string
  tsEpochMs: number
  label: string
  favorite?: boolean
  /** Its alarms: each rings `offsetMs` before the instant (0 = at it). */
  alarms?: AlarmRecord[]
  /** Set on snoozes: the alarm this snooze descends from. */
  snoozeOriginalId?: string
  /** Hidden from the timeline (no line or chip) by the user; its spans and Agenda row stay. */
  hidden?: boolean
  /** The group it is in (domain/collections); absent = Default. An occurrence is in its series' group instead. */
  collectionId?: string
  /** An occurrence of a repeating series (domain/series): the series, and its date ("YYYY-MM-DD"). */
  seriesId?: string
  occurrence?: string
  /** Changed on its own (name, time, alarms): the series' rule changes leave it alone. */
  seriesEdited?: boolean
  /** When it was made (domain/reach: how far ahead you made it sets how far out it stays visible). Absent on instants from before. */
  createdAt?: number
  /** Its own visibility by zoom (the eye: Label / Mark / Hidden); absent = Auto (its group's, or domain/reach). */
  visibility?: Visibility
  /** At a sunrise or sunset (domain/sunEvents): it follows the sun while it stays there (isAtSun). */
  sun?: SunAnchor
  /**
   * A virtual instant: computed, never stored. A repeat's occurrence past the horizon (domain/series
   * virtualOccurrences) or a sunrise or sunset (domain/sunEvents). Selected or focused, it is held
   * in the instants list (store/entities holdInstant) but never saved or listed; any change to it
   * makes it real (saved, same id).
   */
  virtual?: true
}

/** The instants that are stored: without virtual ones held while selected or focused (the same list when there are none). */
export const storedInstants = (list: readonly InstantRecord[]): InstantRecord[] =>
  (list.some(i => i.virtual) ? list.filter(i => !i.virtual) : (list as InstantRecord[]))

/** How an alarm that rang was answered: kept as history, it never rings again. (Cancelling one before it rings deletes it.) */
export type AlarmAnswer = 'dismissed' | 'snoozed'

/**
 * One alarm on an instant. It rings `offsetMs` before the instant: when the instant's span to
 * Now shrinks below the offset. Answered alarms stay as history and never ring again.
 */
export interface AlarmRecord {
  id: string
  /**
   * How long before its instant it rings, ms: > 0 a warning before it, 0 at it, < 0 after it
   * (only a snooze of the alarm at the instant rings after it).
   */
  offsetMs: number
  /** A snooze: the alarm it snoozed (which is answered 'snoozed'). */
  snoozeOf?: string
  /** Answered after it rang: dismissed, or snoozed (another alarm rings later). */
  answered?: AlarmAnswer
}

const ANSWERS: readonly string[] = ['dismissed', 'snoozed'] satisfies AlarmAnswer[]

export const NOW_SENTINEL = '__NOW__'

export interface SpanRecord {
  id: string
  startInstantId: string
  /** NOW_SENTINEL when endIsNow. */
  endInstantId: string
  label: string
  visible?: boolean
  endIsNow?: boolean
}

const randomId = () => Math.random().toString(36).slice(2, 11)
export const newInstantId = () => `i_${randomId()}`
export const newSpanId = () => `s_${randomId()}`
export const newAlarmId = () => `a_${randomId()}`
/** The id an alarm from before offset alarms gets: stable, so every load names it alike. */
export const legacyAlarmId = (instantId: string) => `a_${instantId}`

export const displayName = (label: string | undefined | null, fallback = '?') =>
  label && label.length > 0 ? label : fallback

/** The well-formed alarms in untrusted JSON, with distinct ids. */
function sanitizeAlarms(data: unknown): AlarmRecord[] {
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  return data.flatMap((x): AlarmRecord[] => {
    if (!x || typeof x !== 'object') return []
    const r = x as Record<string, unknown>
    if (typeof r.id !== 'string' || seen.has(r.id) || typeof r.offsetMs !== 'number' || !Number.isFinite(r.offsetMs)) return []
    // 'skipped' (a test build): cancelled before it rang, which now deletes it.
    if (r.answered === 'skipped') return []
    seen.add(r.id)
    // `done: true` was 0.3's answered alarm.
    const answered = typeof r.answered === 'string' && ANSWERS.includes(r.answered) ? r.answered as AlarmAnswer : r.done === true ? 'dismissed' : undefined
    const snoozeOf = typeof r.snoozeOf === 'string' ? r.snoozeOf : undefined
    // Only a snooze rings after its instant.
    const offsetMs = snoozeOf ? r.offsetMs : Math.max(0, r.offsetMs)
    return [{ id: r.id, offsetMs, ...(snoozeOf ? { snoozeOf } : {}), ...(answered ? { answered } : {}) }]
  })
}

/**
 * Keeps the well-formed instant records from untrusted JSON (storage or an imported file).
 * Records from before offset alarms had `alarm: true` for one alarm at the instant.
 */
export function sanitizeInstants(data: unknown): InstantRecord[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((x): x is InstantRecord => !!x && typeof x.id === 'string' && typeof x.tsEpochMs === 'number' && Number.isFinite(x.tsEpochMs))
    .map(x => {
      const { alarm, alarms, sun, createdAt, visibility, collectionId, ...rest } = x as InstantRecord & { alarm?: unknown }
      const list = alarms !== undefined ? sanitizeAlarms(alarms) : alarm === true ? [{ id: legacyAlarmId(x.id), offsetMs: 0 }] : []
      const anchor = sanitizeSunAnchor(sun)
      return { ...rest, label: typeof x.label === 'string' ? x.label : '', ...(list.length > 0 ? { alarms: list } : {}), ...(anchor ? { sun: anchor } : {}),
        ...(typeof createdAt === 'number' && Number.isFinite(createdAt) ? { createdAt } : {}),
        ...(typeof collectionId === 'string' && collectionId && collectionId !== 'default' ? { collectionId } : {}),
        ...(sanitizeVisibility(visibility) ? { visibility: sanitizeVisibility(visibility)! } : {}) }
    })
}

/** Keeps the well-formed span records from untrusted JSON (storage or an imported file). */
export function sanitizeSpans(data: unknown): SpanRecord[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((x): x is SpanRecord => !!x && typeof x.id === 'string' && typeof x.startInstantId === 'string' && typeof x.endInstantId === 'string')
    .map(x => ({ ...x, label: typeof x.label === 'string' ? x.label : '' }))
}

/**
 * A favorite is an instant whose span to Now is tracked: every favorite has one span to Now,
 * shown, and nothing else has one. Repairs data saved before that rule (unfavoriting used to
 * hide the span, and an alarm used to make its instant a favorite, sometimes without a span:
 * those stop being favorites). Returns the inputs unchanged when they already follow it.
 */
export function syncFavorites(instants: InstantRecord[], spans: SpanRecord[]): { instants: InstantRecord[]; spans: SpanRecord[] } {
  const withSpan = new Set(spans.filter(sp => sp.endIsNow).map(sp => sp.startInstantId))
  // Favorited by an alarm alone (setting a favorite always made its span).
  const alarmOnly = (i: InstantRecord) => !!i.favorite && !!i.alarms?.length && !withSpan.has(i.id)
  const nextInstants = instants.some(alarmOnly) ? instants.map(i => (alarmOnly(i) ? { ...i, favorite: false } : i)) : instants
  const favorites = new Set(nextInstants.filter(i => i.favorite).map(i => i.id))
  const seen = new Set<string>()
  let changed = false
  const nextSpans: SpanRecord[] = []
  for (const sp of spans) {
    if (!sp.endIsNow) nextSpans.push(sp)
    else if (!favorites.has(sp.startInstantId) || seen.has(sp.startInstantId)) changed = true
    else {
      seen.add(sp.startInstantId)
      if (sp.visible) nextSpans.push(sp)
      else {
        nextSpans.push({ ...sp, visible: true })
        changed = true
      }
    }
  }
  for (const id of favorites) {
    if (seen.has(id)) continue
    nextSpans.push({ id: newSpanId(), startInstantId: id, endInstantId: NOW_SENTINEL, label: '', visible: true, endIsNow: true })
    changed = true
  }
  return { instants: nextInstants, spans: changed ? nextSpans : spans }
}
