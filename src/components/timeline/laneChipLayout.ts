// Horizontal: where the saved-side lanes' chips go, once per frame. Spans that don't overlap in
// time share a lane (domain/laneSlots packSlots), so their chips can crowd: chips on a lane that
// would touch fold into one "N spans" chip (domain/labelGroups). A selected or focused span's
// chip (with its tools) always shows; the others move off it.
import type { Frame } from '../../engine/viewportEngine.ts'
import { resolveTimeRef, spanGeometry } from '../../domain/spans.ts'
import type { LabelGroup, TrackLabel } from '../../domain/labelGroups.ts'
import { groupTrackLabels } from '../../domain/labelGroups.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, laneHasControls } from './useBottomLanes.ts'
import { laneChipWidth, laneChipWidthsVersion } from './rightSideLayout.ts'

/** A chip's width before it has been measured, px. */
const CHIP_WIDTH_GUESS = 150
/** A pinned chip's tools, each side, px (the pin; pencil, clock, eye, trash). */
const TOOLS_EACH_SIDE = 130
/** Least room between chips on a lane, px. */
export const LANE_CHIP_GAP = 8
/** An "N spans" chip, px. */
export const GROUP_CHIP_WIDTH = 92

export interface LaneChipPlacement {
  /** Chips shown on their own: lane key → center along the time axis, px. */
  shown: Record<string, number>
  groups: LabelGroup[]
  /** Lane key → the group its chip folded into. */
  groupOf: Record<string, string>
}

interface Inputs { lanes: readonly BottomLane[]; selectedSpanId: string | null }
let inputs: Inputs = { lanes: [], selectedSpanId: null }
let version = 0
let cache: { f: Frame; version: number; widths: number; result: LaneChipPlacement } | null = null
const EMPTY: LaneChipPlacement = { shown: {}, groups: [], groupOf: {} }

/** BottomLanes hands over the placed lanes (each render). */
export function setLaneChipInputs(next: Inputs) {
  inputs = next
  version++
}

/** Saved-side lanes' chips this frame (horizontal): shown ones by key, and the groups. */
export function laneChipLayout(f: Frame): LaneChipPlacement {
  if (f.orientation !== 'horizontal') return EMPTY
  if (cache && cache.f === f && cache.version === version && cache.widths === laneChipWidthsVersion()) return cache.result
  const items: TrackLabel[] = []
  for (const lane of inputs.lanes) {
    if (isLiveLane(lane)) continue
    const g = spanGeometry(f.pos(resolveTimeRef(lane.a, f.now, f.center)), f.pos(resolveTimeRef(lane.b, f.now, f.center)), f.mainSize)
    if (!g.onScreen) continue
    const pinned = laneHasControls(lane, inputs.selectedSpanId)
    const width = laneChipWidth(lane.key) ?? CHIP_WIDTH_GUESS
    items.push({ key: lane.key, track: lane.index, want: g.mid, size: width + (pinned ? 2 * TOOLS_EACH_SIDE : 0), pinned })
  }
  const { shown, groups } = groupTrackLabels(items, { gap: LANE_CHIP_GAP, groupSize: GROUP_CHIP_WIDTH })
  const groupOf: Record<string, string> = {}
  for (const g of groups) for (const m of g.members) groupOf[m] = g.key
  const result = { shown, groups, groupOf }
  cache = { f, version, widths: laneChipWidthsVersion(), result }
  return result
}
