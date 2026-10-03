// Which lanes appear below the timeline, in order, with vertical positions.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { shallowArrayEqual, useFrameValue } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import type { LaneSpan, ResolvedSpan, TimeRef } from '../../domain/spans.ts'
import { resolveSpan, resolveTimeRef, savedSpanLanes, spanGeometry } from '../../domain/spans.ts'
import { useEntities } from '../../store/entities.ts'
import { useSettings } from '../../store/settings.ts'
import { useView } from '../../store/view.ts'
import { lanesTop } from './geometry.ts'

const LANE_HEIGHT = 40
const LANES_BOTTOM_PAD = 18

interface LaneBase {
  key: string
  a: TimeRef
  b: TimeRef
  /** Vertical center in px; set once the lane is placed. */
  top: number
}

export type BottomLane = LaneBase & (
  | { kind: 'selected-now'; selected: InstantRecord }
  | { kind: 'secondary'; selected: InstantRecord; secondary: InstantRecord }
  | { kind: 'saved'; span: LaneSpan }
)

/**
 * Implied spans for the selection (Selected→Now, Secondary→Selected) followed by
 * saved spans, keeping only those on screen. Re-renders only when that set changes.
 */
export function useBottomLanes(rowsUsed: number): { lanes: BottomLane[]; height: number } {
  const instants = useEntities(s => s.instants)
  const spans = useEntities(s => s.spans)
  const v = useView(useShallow(s => ({
    mode: s.viewFocusMode,
    focusedInstantId: s.focusedInstantId,
    focusedSpanId: s.focusedSpanId,
    selectedId: s.currentSelectedInstantId,
    secondaryId: s.secondarySelectedInstantId,
    showNow: s.showImpliedSelectedNow,
    showPrev: s.showImpliedSelectedPrev,
    moving: s.moveMode?.instantId ?? null,
  })))

  const favoriteLanes = useSettings(s => s.favoriteLanes)

  const candidates = useMemo(() => {
    // An instant being moved follows the cursor, and so do its spans.
    const ref = (i: InstantRecord): TimeRef => (i.id === v.moving ? 'center' : i.tsEpochMs)
    const byId = new Map(instants.map(i => [i.id, i]))
    const resolved = spans.map(sp => resolveSpan(sp, byId)).filter((r): r is ResolvedSpan => !!r)
    const saved = savedSpanLanes({
      resolved,
      focusMode: v.mode,
      focusedInstantId: v.focusedInstantId,
      focusedSpanId: v.focusedSpanId,
      selectedInstantId: v.selectedId,
      now: Date.now(),
      favoriteLanes,
    })
    const out: BottomLane[] = []
    const selected = byId.get(v.selectedId ?? '')
    const secondary = byId.get(v.secondaryId ?? '')
    if (selected && v.showNow && !saved.some(s => s.span.startInstantId === selected.id && s.span.endIsNow)) {
      out.push({ key: 'implied-now', kind: 'selected-now', selected, a: ref(selected), b: 'now', top: 0 })
    }
    if (selected && secondary && v.showPrev) {
      const exists = resolved.some(r => !r.span.endIsNow &&
        ((r.span.startInstantId === secondary.id && r.span.endInstantId === selected.id) ||
          (r.span.startInstantId === selected.id && r.span.endInstantId === secondary.id)))
      if (!exists) {
        out.push({ key: 'implied-secondary', kind: 'secondary', selected, secondary, a: ref(secondary), b: ref(selected), top: 0 })
      }
    }
    for (const s of saved) {
      out.push({
        key: s.span.id,
        kind: 'saved',
        span: s,
        a: ref(s.start),
        b: s.end ? ref(s.end) : 'now',
        top: 0,
      })
    }
    return out
  }, [instants, spans, v, favoriteLanes])

  const onScreenKeys = useFrameValue((f: Frame) => candidates
    .filter(c => spanGeometry(f.pos(resolveTimeRef(c.a, f.now, f.center)), f.pos(resolveTimeRef(c.b, f.now, f.center)), f.mainSize).onScreen)
    .map(c => c.key), shallowArrayEqual)

  return useMemo(() => {
    const keys = new Set(onScreenKeys)
    let y = lanesTop(rowsUsed)
    const lanes: BottomLane[] = []
    for (const c of candidates) {
      if (!keys.has(c.key)) continue
      const h = LANE_HEIGHT
      lanes.push({ ...c, top: y + h / 2 })
      y += h
    }
    return { lanes, height: y + LANES_BOTTOM_PAD }
  }, [candidates, onScreenKeys, rowsUsed])
}
