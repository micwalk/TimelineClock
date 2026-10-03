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
