// Pure viewport math: projection between time and screen x, and the view target
// (center/width) implied by the current focus mode.
import type { InstantRecord, SpanRecord } from './entities.ts'

export type FocusMode = 'now' | 'cursor' | 'instant' | 'span'

export interface Projection {
  center: number
  width: number
  screenW: number
}

export const pxPerMs = (p: Projection) => p.screenW / p.width
export type Dir = 1 | -1

export interface AxisProjection {
  center: number
  width: number
  mainSize: number
  dir: Dir
}

export const timeToPos = (p: AxisProjection, t: number) => p.mainSize / 2 + (p.dir * (t - p.center) * p.mainSize) / p.width
export const posToTime = (p: AxisProjection, pos: number) => p.center + (p.dir * (pos - p.mainSize / 2) * p.width) / p.mainSize
export function visibleRange(p: AxisProjection): { start: number; end: number } {
  const a = posToTime(p, 0)
  const b = posToTime(p, p.mainSize)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}
/** New center for a content drag of dPx along the main axis (content follows the finger). */
export const panCenterByPixels = (p: AxisProjection, dPx: number) => p.center - (p.dir * dPx * p.width) / p.mainSize

export const timeToX = (p: Projection, t: number) => timeToPos({ center: p.center, width: p.width, mainSize: p.screenW, dir: 1 }, t)
export const xToTime = (p: Projection, x: number) => posToTime({ center: p.center, width: p.width, mainSize: p.screenW, dir: 1 }, x)

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
 * end is off screen, or zoom in when the range covers under 20% of the width.
 * Returns null when no change is needed.
 */
export function zoomToFitRange(p: Projection, aTs: number, bTs: number): { center: number; width: number } | null {
  const early = Math.min(aTs, bTs)
  const late = Math.max(aTs, bTs)
  if (late === early) return null
  const xEarly = timeToX(p, early)
  const xLate = timeToX(p, late)
  if (xEarly < 0 || xLate > p.screenW) return { center: (early + late) / 2, width: (late - early) / 0.8 }
  if (xLate - xEarly < 0.2 * p.screenW) return { center: (early + late) / 2, width: 2 * (late - early) }
  return null
}
