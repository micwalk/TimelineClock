// Pure span logic: label text, on-screen geometry, and which saved spans get a lane.
import { formatDurationHMS } from './format.ts'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { displayName } from './entities.ts'

/** A time that may be fixed or follow the live clock / the view center (cursor). */
export type TimeRef = number | 'now' | 'center'

export function resolveTimeRef(ref: TimeRef, now: number, center: number): number {
  return ref === 'now' ? now : ref === 'center' ? center : ref
}

/** "{end} {duration} AFTER|BEFORE|until {start}" as shown on span chips. */
export function spanDescription(aTs: number, bTs: number, startName: string, endName: string): string {
  const diff = bTs - aTs
  const dir = diff >= 0 ? 'AFTER' : endName === 'Now' ? 'until' : 'BEFORE'
  return `${endName} ${formatDurationHMS(Math.abs(diff))} ${dir} ${startName}`
}

export interface SpanGeometry {
  /** Clamped to the screen. */
  left: number
  right: number
  /** Midpoint of the visible segment, where the chip sits. */
  mid: number
  leftOffscreen: boolean
  rightOffscreen: boolean
  onScreen: boolean
}

export function spanGeometry(xA: number, xB: number, screenW: number): SpanGeometry {
  const lo = Math.min(xA, xB)
  const hi = Math.max(xA, xB)
  const left = Math.max(0, lo)
  const right = Math.min(screenW, hi)
  const onScreen = hi >= 0 && lo <= screenW && xA !== xB
  return { left, right, mid: (left + right) / 2, leftOffscreen: lo < 0, rightOffscreen: hi > screenW, onScreen }
}

export interface ResolvedSpan {
  span: SpanRecord
  start: InstantRecord
  /** Undefined when the span ends at Now. */
  end?: InstantRecord
}

export function resolveSpan(span: SpanRecord, byId: Map<string, InstantRecord>): ResolvedSpan | null {
  const start = byId.get(span.startInstantId)
  if (!start) return null
  if (span.endIsNow) return { span, start }
  const end = byId.get(span.endInstantId)
  return end ? { span, start, end } : null
}

export const spanEndTs = (r: ResolvedSpan, now: number) => (r.end ? r.end.tsEpochMs : now)

/** Favorite instants own a hidden-label span to Now; it shows a star instead of a header. */
export const isFavoriteNowSpan = (r: ResolvedSpan) => !!r.span.endIsNow && !!r.start.favorite

export const spanHeader = (r: ResolvedSpan): string | undefined =>
  isFavoriteNowSpan(r) || !r.span.label ? undefined : r.span.label

export const spanEndName = (r: ResolvedSpan) => (r.span.endIsNow ? 'Now' : displayName(r.end?.label))

/** 0 = involves the focused instant, 1 = involves the selected instant, 2 = merely visible. */
export type SpanPriority = 0 | 1 | 2

export interface LaneSpan extends ResolvedSpan {
  priority: SpanPriority
}

/**
 * Saved spans that get a lane below the timeline, in display order. Mirrors the
 * original renderer: spans tied to the focused (instant mode) or selected instant
 * are always included; others only when marked visible.
 */
export function savedSpanLanes(opts: {
  resolved: ResolvedSpan[]
  focusMode: string
  focusedInstantId: string | null
  focusedSpanId: string | null
  selectedInstantId: string | null
  now: number
}): LaneSpan[] {
  const { resolved, focusMode, focusedInstantId, focusedSpanId, selectedInstantId, now } = opts
  const out: LaneSpan[] = []
  for (const r of resolved) {
    if (focusMode === 'span' && focusedSpanId === r.span.id) continue // drawn in the top lane
    const involves = (id: string | null) => !!id && (r.span.startInstantId === id || r.span.endInstantId === id)
    let priority: SpanPriority | -1 = -1
    if (focusMode === 'instant' && focusedInstantId) priority = involves(focusedInstantId) ? 0 : r.span.visible ? 2 : -1
    else if (selectedInstantId) priority = involves(selectedInstantId) ? 1 : r.span.visible ? 2 : -1
    else if (r.span.visible) priority = 2
    if (priority === -1) continue
    out.push({ ...r, priority })
  }
  const mid = (s: LaneSpan) => (s.start.tsEpochMs + spanEndTs(s, now)) / 2
  return out.sort((x, y) => x.priority - y.priority || mid(x) - mid(y))
}
