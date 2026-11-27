// Horizontal: where the saved-side lanes' chips go, once per frame. Spans that don't overlap in
// time share a lane (domain/laneSlots packSlots), so their chips can crowd. Each chip stays on its
// own span (inside it, or covering a span shorter than itself: domain/nowFlags), at the free spot
// nearest the middle of what shows of it. Crowded, it shows its reading alone (`compact`: the
// length, no name); with no room even for that, it is left off and its span shows its bar alone
// (`bare`: a span's smaller states, as a mark is an instant's; a tap on the bar selects it). A
// selected or focused span's chip (with its tools) always shows whole; the others keep off it.
// Longer spans go first.
import type { Frame } from '../../engine/viewportEngine.ts'
import { resolveTimeRef, spanGeometry } from '../../domain/spans.ts'
import type { FlagItem, Interval } from '../../domain/nowFlags.ts'
import { layoutNowFlags } from '../../domain/nowFlags.ts'
import { getTunables } from '../../store/settings.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, laneHasControls } from './useBottomLanes.ts'
import { laneChipWidth, laneChipWidthsVersion } from './rightSideLayout.ts'

/** A chip's width before it has been measured, px: whole, and its reading alone. */
const CHIP_WIDTH_GUESS = 150
const COMPACT_WIDTH_GUESS = 60
/** A pinned chip's tools, each side, px (the pin; pencil, clock, eye, trash). */
const TOOLS_EACH_SIDE = 130
/** Least room between chips on a lane, px. */
export const LANE_CHIP_GAP = 8

export interface LaneChipPlacement {
  /** Chips shown: lane key → center along the time axis, px. */
  shown: Record<string, number>
  /** Chips shown compact: their reading alone (no name). */
  compact: Record<string, true>
  /** Lanes whose chip has no room on its span: their bar shows alone. */
  bare: Record<string, true>
}

interface Inputs { lanes: readonly BottomLane[]; selectedSpanId: string | null }
let inputs: Inputs = { lanes: [], selectedSpanId: null }
let version = 0
let cache: { f: Frame; version: number; widths: number; result: LaneChipPlacement } | null = null
const EMPTY: LaneChipPlacement = { shown: {}, compact: {}, bare: {} }

/** BottomLanes hands over the placed lanes (each render). */
export function setLaneChipInputs(next: Inputs) {
  inputs = next
  version++
}

/** Saved-side lanes' chips this frame (horizontal): where each shows, and which are bare. */
export function laneChipLayout(f: Frame): LaneChipPlacement {
  if (f.orientation !== 'horizontal') return EMPTY
  if (cache && cache.f === f && cache.version === version && cache.widths === laneChipWidthsVersion()) return cache.result
  const pinned: FlagItem[] = []
  const others: (FlagItem & { length: number; short: number })[] = []
  for (const lane of inputs.lanes) {
    if (isLiveLane(lane)) continue
    const pa = f.pos(resolveTimeRef(lane.a, f.now, f.center))
    const pb = f.pos(resolveTimeRef(lane.b, f.now, f.center))
    const g = spanGeometry(pa, pb, f.mainSize)
    if (!g.onScreen) continue
    const pin = laneHasControls(lane, inputs.selectedSpanId)
    const width = laneChipWidth(lane.key) ?? CHIP_WIDTH_GUESS
    // Chips meet only on their own track (lane slot): a track is a band across the axis.
    const item = { key: lane.key, lo: g.left, hi: g.right, prefer: g.mid, size: width + (pin ? 2 * TOOLS_EACH_SIDE : 0), xlo: lane.index, xhi: lane.index + 0.5 }
    if (pin) pinned.push(item)
    else others.push({ ...item, length: Math.abs(pb - pa), short: laneChipWidth(lane.key, true) ?? COMPACT_WIDTH_GUESS })
  }
  // Longer spans first (their whole length, so a pan never reorders them), then by key.
  others.sort((a, b) => b.length - a.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const cover = getTunables().chipLineInsetPx
  const shown = layoutNowFlags(pinned, 0, 0, LANE_CHIP_GAP, [], { cover })
  const box = (c: number, it: FlagItem): Interval => ({ lo: c - it.size! / 2, hi: c + it.size! / 2, xlo: it.xlo, xhi: it.xhi })
  const taken: Interval[] = pinned.map(p => box(shown[p.key], p))
  const compact: Record<string, true> = {}
  const bare: Record<string, true> = {}
  for (const o of others) {
    const looks = o.short < o.size! ? [o, { ...o, size: o.short }] : [o]
    const look = looks.find(l => {
      const c = layoutNowFlags([l], 0, 0, LANE_CHIP_GAP, taken, { cover, drop: true })[o.key]
      if (c === undefined) return false
      shown[o.key] = c
      taken.push(box(c, l))
      return true
    })
    if (!look) bare[o.key] = true
    else if (look !== o) compact[o.key] = true
  }
  const result = { shown, compact, bare }
  cache = { f, version, widths: laneChipWidthsVersion(), result }
  return result
}
