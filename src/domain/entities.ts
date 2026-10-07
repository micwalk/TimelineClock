// Persisted domain records. Field names match the original localStorage format
// ('timeline.saved.v1' / 'timeline.spans.v1') so existing data keeps loading.

export interface InstantRecord {
  id: string
  tsEpochMs: number
  label: string
  favorite?: boolean
  /** Rings when Now reaches tsEpochMs. */
  alarm?: boolean
  /** Set on snoozes: the alarm this snooze descends from. */
  snoozeOriginalId?: string
  /** Hidden from the timeline (no line or chip) by the user; its spans and Agenda row stay. */
  hidden?: boolean
}

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

export const displayName = (label: string | undefined | null, fallback = '?') =>
  label && label.length > 0 ? label : fallback

/** Keeps the well-formed instant records from untrusted JSON (storage or an imported file). */
export function sanitizeInstants(data: unknown): InstantRecord[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((x): x is InstantRecord => !!x && typeof x.id === 'string' && typeof x.tsEpochMs === 'number' && Number.isFinite(x.tsEpochMs))
    .map(x => ({ ...x, label: typeof x.label === 'string' ? x.label : '' }))
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
  const alarmOnly = (i: InstantRecord) => !!i.favorite && !!i.alarm && !withSpan.has(i.id)
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
