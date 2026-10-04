// Pure viewport math: projection between time and a position along the timeline's
// main axis (x when horizontal, y when vertical), and the view target
// (center/width) implied by the current focus mode.
import type { InstantRecord, SpanRecord } from './entities.ts'

export type FocusMode = 'now' | 'cursor' | 'instant' | 'span'

export type Dir = 1 | -1

export interface AxisProjection {
  center: number
  width: number
  mainSize: number
  dir: Dir
}

export const pxPerMs = (p: AxisProjection) => p.mainSize / p.width

export const timeToPos = (p: AxisProjection, t: number) => p.mainSize / 2 + (p.dir * (t - p.center) * p.mainSize) / p.width
export const posToTime = (p: AxisProjection, pos: number) => p.center + (p.dir * (pos - p.mainSize / 2) * p.width) / p.mainSize
export function visibleRange(p: AxisProjection): { start: number; end: number } {
  const a = posToTime(p, 0)
  const b = posToTime(p, p.mainSize)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}
/** New center for a content drag of dPx along the main axis (content follows the finger). */
export const panCenterByPixels = (p: AxisProjection, dPx: number) => p.center - (p.dir * dPx * p.width) / p.mainSize

/** The subset of view state that determines where the view wants to be. */
export interface TargetInputs {
  viewFocusMode: FocusMode
  focusedInstantId: string | null
  focusedSpanId: string | null
  timeCenter: number
  timeWidth: number
  cursorLocked: boolean
  cursorLockOffsetMs: number
}

export interface ViewTarget {
  center: number
  width: number
  /** True when the target moves with the clock (needs periodic re-rendering). */
  followsNow: boolean
}

export function resolveViewTarget(v: TargetInputs, instants: InstantRecord[], spans: SpanRecord[], now: number): ViewTarget {
  switch (v.viewFocusMode) {
    case 'now':
      return { center: now, width: v.timeWidth, followsNow: true }
    case 'cursor':
      return v.cursorLocked
        ? { center: now + v.cursorLockOffsetMs, width: v.timeWidth, followsNow: true }
        : { center: v.timeCenter, width: v.timeWidth, followsNow: false }
    case 'instant': {
      const inst = v.focusedInstantId ? instants.find(i => i.id === v.focusedInstantId) : undefined
      return { center: inst ? inst.tsEpochMs : v.timeCenter, width: v.timeWidth, followsNow: false }
    }
    case 'span': {
      const sp = v.focusedSpanId ? spans.find(s => s.id === v.focusedSpanId) : undefined
      const a = sp && instants.find(i => i.id === sp.startInstantId)?.tsEpochMs
      const b = sp && (sp.endIsNow ? now : instants.find(i => i.id === sp.endInstantId)?.tsEpochMs)
      if (typeof a !== 'number' || typeof b !== 'number') {
        return { center: v.timeCenter, width: v.timeWidth, followsNow: false }
      }
      // A span that ends at Now keeps growing: widen the view so it stays in frame.
      const width = sp!.endIsNow ? Math.max(v.timeWidth, Math.abs(b - a) * 1.2) : v.timeWidth
      return { center: (a + b) / 2, width, followsNow: !!sp!.endIsNow }
    }
  }
}

/**
 * Zoom needed so [aTs, bTs] is comfortably in view: fit with 10% margins when an
 * end is off screen, or zoom in when the range covers under 20% of the axis.
 * Returns null when no change is needed.
 */
export function zoomToFitRange(p: AxisProjection, aTs: number, bTs: number): { center: number; width: number } | null {
  const early = Math.min(aTs, bTs)
  const late = Math.max(aTs, bTs)
  if (late === early) return null
  const ends = [timeToPos(p, early), timeToPos(p, late)]
  const lo = Math.min(...ends)
  const hi = Math.max(...ends)
  if (lo < 0 || hi > p.mainSize) return { center: (early + late) / 2, width: (late - early) / 0.8 }
  if (hi - lo < 0.2 * p.mainSize) return { center: (early + late) / 2, width: 2 * (late - early) }
  return null
}

/** Share of the half-axis that `widthToShow` fills: the farthest time sits 80% of the way to the edge. */
export const SHOW_FILL = 0.8

/**
 * The time width that shows every time in `times` with the view centered on `center`
 * (the farthest at 80% of the way to the edge), and at least `minWidth`. Used to show a
 * new timer or a stopwatch's run around Now, wide enough that their chips don't collapse.
 */
export function widthToShow(center: number, times: readonly number[], minWidth: number): number {
  const reach = Math.max(0, ...times.map(t => Math.abs(t - center)))
  return Math.max(minWidth, (2 * reach) / SHOW_FILL)
}
