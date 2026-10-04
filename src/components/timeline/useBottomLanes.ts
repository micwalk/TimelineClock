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
import { useQuick } from '../../store/quick.ts'
import { stopwatchPhase } from '../../domain/quickCreate.ts'
import { useView } from '../../store/view.ts'
import type { Orientation } from '../../domain/layoutMode.ts'
import { lanesTop, liveLaneTop } from './geometry.ts'
import { stableSlots } from '../../domain/laneSlots.ts'

const LANE_HEIGHT = 40
const LANES_BOTTOM_PAD = 18

interface LaneBase {
  key: string
  a: TimeRef
  b: TimeRef
  /** Vertical center in px (horizontal); set once the lane is placed. Live lanes: from the top of the live band. */
  top: number
  /** Lane number within its side: from the bottom / right edge for saved lanes, from the top / left edge for live lanes; set once placed. */
  index: number
}

export type BottomLane = LaneBase & (
  | { kind: 'selected-now'; selected: InstantRecord }
  | { kind: 'selected-cursor'; selected: InstantRecord }
  | { kind: 'secondary'; selected: InstantRecord; secondary: InstantRecord }
  | { kind: 'saved'; span: LaneSpan }
)

/**
 * Implied spans for the selection (Selected→Now, Previous→Selected, Selected→Cursor) followed by
 * saved spans, keeping only those on screen (unplaced: see placeLanes). Re-renders only when that set changes.
 */
export function useVisibleLanes(): BottomLane[] {
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
    inMove: !!s.moveMode,
  })))

  const favoriteLanes = useSettings(s => s.favoriteLanes)
  // A running stopwatch's lanes to Now (its start, when kept favorited, and the latest lap) always show.
  const trackedId = useQuick(s => (stopwatchPhase(s.stopwatch) === 'running' ? s.stopwatch.marks[s.stopwatch.marks.length - 1] : null))
  const startId = useQuick(s => (stopwatchPhase(s.stopwatch) === 'running' ? s.stopwatch.marks[0] : null))
  const keepStart = useSettings(s => s.stopwatchKeepStart)

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
      trackedIds: trackedId ? new Set([trackedId, ...(keepStart && startId ? [startId] : [])]) : undefined,
    })
    const out: BottomLane[] = []
    const selected = byId.get(v.selectedId ?? '')
    const secondary = byId.get(v.secondaryId ?? '')
    if (selected && v.showNow && !saved.some(s => s.span.startInstantId === selected.id && s.span.endIsNow)) {
      out.push({ key: 'implied-now', kind: 'selected-now', selected, a: ref(selected), b: 'now', top: 0, index: 0 })
    }
    if (selected && secondary && v.showPrev) {
      const exists = resolved.some(r => !r.span.endIsNow &&
        ((r.span.startInstantId === secondary.id && r.span.endInstantId === selected.id) ||
          (r.span.startInstantId === selected.id && r.span.endInstantId === secondary.id)))
      if (!exists) {
        out.push({ key: 'implied-secondary', kind: 'secondary', selected, secondary, a: ref(secondary), b: ref(selected), top: 0, index: 0 })
      }
    }
    // Free cursor with a selection: the live lane from the selection to the cursor (hidden by geometry while they coincide).
    if (selected && v.mode === 'cursor' && !v.inMove) {
      out.push({ key: 'implied-cursor', kind: 'selected-cursor', selected, a: ref(selected), b: 'center', top: 0, index: 0 })
    }
    for (const s of saved) {
      out.push({
        key: s.span.id,
        kind: 'saved',
        span: s,
        a: ref(s.start),
        b: s.end ? ref(s.end) : 'now',
        top: 0,
        index: 0,
      })
    }
    return out
  }, [instants, spans, v, favoriteLanes, trackedId, startId, keepStart])

  const onScreenKeys = useFrameValue((f: Frame) => candidates
    .filter(c => spanGeometry(f.pos(resolveTimeRef(c.a, f.now, f.center)), f.pos(resolveTimeRef(c.b, f.now, f.center)), f.mainSize).onScreen)
    .map(c => c.key), shallowArrayEqual)

  return useMemo(() => {
    const keys = new Set(onScreenKeys)
    return candidates.filter(c => keys.has(c.key))
  }, [candidates, onScreenKeys])
}

/**
 * A live lane has an endpoint at Now or the cursor: the implied Selected→Now and Selected→Cursor lanes and saved spans ending at Now.
 * A span whose endpoint is merely the instant being moved (it rides the cursor) is not live: it stays on the saved side.
 */
export const isLiveLane = (lane: BottomLane): boolean =>
  lane.kind === 'selected-now' || lane.kind === 'selected-cursor' || (lane.kind === 'saved' && lane.b === 'now')

/** Live lanes take Now's accent (red) or the cursor's. */
export const liveLaneVariant = (lane: BottomLane): 'now' | 'cursor' => (lane.kind === 'selected-cursor' ? 'cursor' : 'now')

/** Splits lanes into the live side (endpoint at Now or the cursor) and the saved side (between saved instants), keeping order. */
export function partitionLanes(lanes: BottomLane[]): { live: BottomLane[]; saved: BottomLane[] } {
  const live: BottomLane[] = []
  const saved: BottomLane[] = []
  for (const l of lanes) (isLiveLane(l) ? live : saved).push(l)
  return { live, saved }
}

/** The slots lanes held last time, per side, so placeLanes can keep them (domain/laneSlots). */
export interface LaneSlots { live: Record<string, number>; saved: Record<string, number> }
export const NO_LANE_SLOTS: LaneSlots = { live: {}, saved: {} }

/**
 * Places the lanes. Live lanes (index 0.. from the top of the horizontal live band, or from the left edge in vertical) come first;
 * saved lanes stack below the chip rows (horizontal, below the band) or from the right edge (vertical).
 * A lane already on screen keeps its slot (`prev`, from the last call) when others come and go; new lanes take free slots.
 * `height` is the horizontal timeline's height; `liveCount` sizes the live band.
 */
export function placeLanes(visible: BottomLane[], rowsUsed: number, orientation: Orientation, prev: LaneSlots = NO_LANE_SLOTS):
  { lanes: BottomLane[]; height: number | undefined; liveCount: number; slots: LaneSlots } {
  const { live, saved } = partitionLanes(visible)
  const slots: LaneSlots = { live: stableSlots(prev.live, live.map(l => l.key)), saved: stableSlots(prev.saved, saved.map(l => l.key)) }
  const span = (m: Record<string, number>) => Math.max(0, ...Object.values(m).map(v => v + 1))
  const liveCount = orientation === 'vertical' ? 0 : span(slots.live)
  const placedLive = live.map(c => ({ ...c, index: slots.live[c.key], top: liveLaneTop(slots.live[c.key]) }))
  const y0 = lanesTop(rowsUsed, liveCount)
  const placedSaved = saved.map(c => ({ ...c, index: slots.saved[c.key], top: y0 + slots.saved[c.key] * LANE_HEIGHT + LANE_HEIGHT / 2 }))
  const height = orientation === 'vertical' ? undefined : y0 + span(slots.saved) * LANE_HEIGHT + LANES_BOTTOM_PAD
  return { lanes: [...placedLive, ...placedSaved], height, liveCount, slots }
}

/** A saved-side lane's colour: the focused span, the selection's spans, or plain. */
export function savedLaneVariant(r: LaneSpan): 'span' | 'focused' | 'selected' {
  return r.focused ? 'span' : r.priority === 0 ? 'focused' : r.priority === 1 ? 'selected' : 'span'
}

/** Lanes with controls (focused, selected, or an implied selection span) show a chip and tools; the rest draw only their bar in vertical. */
export const laneHasControls = (lane: BottomLane, selectedSpanId: string | null): boolean =>
  lane.kind !== 'saved' || lane.span.focused || lane.span.priority <= 1 || selectedSpanId === lane.span.span.id
