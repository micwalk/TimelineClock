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
