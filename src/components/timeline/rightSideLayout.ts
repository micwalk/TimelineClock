// Vertical layout: where every span lane's chip and label goes, computed once per frame and
// shared. Saved-side lane chips (selected/focused saved spans and implied selection spans,
// with their tools) go first, near the middle of their visible span; then live lanes' chips
// (left side); then flags at Now for spans containing Now; then label boxes for the other
// spans. None of them overlap (domain/nowFlags); flags also keep clear of saved instant chips.
import type { Frame } from '../../engine/viewportEngine.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { resolveTimeRef, spanGeometry } from '../../domain/spans.ts'
import { layoutNowFlags } from '../../domain/nowFlags.ts'
import type { LabelGroup } from '../../domain/labelGroups.ts'
import { groupTrackLabels } from '../../domain/labelGroups.ts'
import type { FlagItem, Interval } from '../../domain/nowFlags.ts'
import type { SavedLayout } from './savedLayout.ts'
import { CHIP_HEIGHT, CLUSTER_WIDTH, chipToolsExtent, estimateChipWidth, savedLayoutAt } from './savedLayout.ts'
import { GEOMETRY_VERTICAL, verticalLiveLaneX } from './geometry.ts'
import { engine } from '../../engine/viewportEngine.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, laneHasControls } from './useBottomLanes.ts'

/** A flag's height and the gap kept around boxes, px. */
export const FLAG_SIZE = 26
const GAP = 4
/** A lane chip with its tools above and/or below it, px along the time axis. */
const LANE_CHIP_SIZE = 32
const LANE_TOOLS_SIZE = 36
/** A flag's width before it has been measured, px. */
const FLAG_WIDTH_GUESS = 150
/** An "N spans" box's width before it has been measured, px. */
const GROUP_FLAG_WIDTH_GUESS = 80
/** Lanes sit this far in from the right edge (matches .tl-lane in vertical). */
const LANE_EDGE = 12
/** Gap between a lane's bar and its chip (matches .tl-lane__chip-wrap in vertical). */
const CHIP_OFFSET = 10
/** A lane chip's width before it has been measured, px. */
const CHIP_WIDTH_GUESS = 160
/** The tools row under or over a saved-side chip (pencil, eye, trash / pin), px wide. */
const TOOLS_WIDTH = 120

// Measured lane chip widths, kept current by one ResizeObserver (no layout reads mid-frame).
const chipWidths = new Map<string, number>()
const observed = new Map<Element, string>()
const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
  for (const e of entries) {
    const key = observed.get(e.target)
    if (key === undefined) continue
    const w = Math.round((e.target as HTMLElement).offsetWidth)
    if (chipWidths.get(key) !== w) { chipWidths.set(key, w); version++ }
  }
  engine.requestFrame()
})

// The Now and Cursor tags' boxes (vertical), measured the same way: live chips keep clear of them.
const tagSizes = new Map<'now' | 'cursor', { w: number; h: number }>()
const observedTags = new Map<Element, 'now' | 'cursor'>()
const tagObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
  for (const e of entries) {
    const key = observedTags.get(e.target)
    if (key === undefined) continue
    const el = e.target as HTMLElement
    const size = { w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) }
    const old = tagSizes.get(key)
    if (!old || old.w !== size.w || old.h !== size.h) { tagSizes.set(key, size); version++ }
  }
  engine.requestFrame()
})

/** The Now or Cursor tag registers its box while it shows; returns the cleanup. */
export function observeTag(key: 'now' | 'cursor', el: HTMLElement): () => void {
  observedTags.set(el, key)
  tagObserver?.observe(el)
  return () => {
    tagObserver?.unobserve(el)
    observedTags.delete(el)
    tagSizes.delete(key)
    version++
  }
}

// Lane label boxes (NowFlags), measured the same way: reading their width mid-frame forced a
// layout every frame.
const flagWidths = new Map<string, number>()
const observedFlags = new Map<Element, string>()
const flagObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
  for (const e of entries) {
    const key = observedFlags.get(e.target)
    if (key === undefined) continue
    const box = e.borderBoxSize?.[0]
    const w = Math.round(box ? box.inlineSize : (e.target as HTMLElement).offsetWidth)
    if (w > 0 && flagWidths.get(key) !== w) { flagWidths.set(key, w); version++ }
  }
  engine.requestFrame()
})

/** A lane label box registers itself while it is mounted; returns the cleanup. */
export function observeFlag(key: string, el: HTMLElement): () => void {
  observedFlags.set(el, key)
  flagObserver?.observe(el)
  return () => {
    flagObserver?.unobserve(el)
    observedFlags.delete(el)
    if (![...observedFlags.values()].includes(key)) flagWidths.delete(key)
  }
}

/** A lane chip's measured width, if it has been measured. */
export const laneChipWidth = (key: string): number | undefined => chipWidths.get(key)
/** Changes whenever a measured width changes (for per-frame caches). */
export const laneChipWidthsVersion = (): number => version

/** SpanLane registers its chip so the layout knows how wide it is; returns the cleanup. */
export function observeLaneChip(key: string, el: HTMLElement): () => void {
  observed.set(el, key)
  resizeObserver?.observe(el)
  return () => {
    resizeObserver?.unobserve(el)
    observed.delete(el)
    if (![...observed.values()].includes(key)) chipWidths.delete(key)
  }
}

export interface RightSideInputs {
  lanes: readonly BottomLane[]
  selectedSpanId: string | null
  instants: readonly InstantRecord[]
  widths: Readonly<Record<string, number>>
  moving: string | null
  /** The selected and focused instants: their chips (and tools) draw over the lanes, so lane chips keep clear of them. */
  selectedInstantId?: string | null
  focusedInstantId?: string | null
  /** The saved chips' layout per frame (default: the timeline's, savedLayoutAt). */
  savedAt?: (f: Frame) => SavedLayout
}

export interface RightSidePlacement {
  /** Lane key → center of its chip along the time axis, px (saved-side and live lanes). */
  chips: Record<string, number>
  /** Labels on one bar that would crowd it, folded into one "N spans" box (its key is in `flags`). */
  flagGroups: LabelGroup[]
  /** Lane key → center of its flag, px. */
  flags: Record<string, number>
}

let inputs: RightSideInputs | null = null
let version = 0
let cache: { frame: Frame; version: number; result: RightSidePlacement } | null = null

/** NowFlags hands over the current lanes and chips (each render). */
export function setRightSideInputs(next: RightSideInputs) {
  inputs = next
  version++
}

const EMPTY: RightSidePlacement = { chips: {}, flags: {}, flagGroups: [] }

/** Lanes that draw a chip with tools on the saved side (vertical). */
const chipLane = (lane: BottomLane, selectedSpanId: string | null) =>
  !isLiveLane(lane) && (lane.kind === 'secondary' || (lane.kind === 'saved' && laneHasControls(lane, selectedSpanId)))

export function rightSideLayout(f: Frame): RightSidePlacement {
  if (f.orientation !== 'vertical' || !inputs) return EMPTY
  if (cache && cache.frame === f && cache.version === version) return cache.result
  const c = inputs
  const saved = (c.savedAt ?? savedLayoutAt)(f)
  const nowPos = f.pos(f.now)

  // Saved instant chips (where their layout put them, with their tools) and "+N" chips: flags
  // keep off them. The selected and focused chips draw over the lanes, so lane chips keep off those.
  const blockers: Interval[] = []
  const onTop: Interval[] = []
  const byId = new Map(c.instants.map(i => [i.id, i]))
  const posOf = (id: string) => {
    const i = byId.get(id)
    return !i ? null : id === c.moving ? f.mainSize / 2 : f.pos(i.tsEpochMs)
  }
  for (const id of saved.visibleIds) {
    if (saved.rows[id] === undefined) continue
    const p = posOf(id)
    const inst = byId.get(id)
    if (p === null || !inst) continue
    const mid = p + (saved.shifts[id] ?? 0)
    const xlo = GEOMETRY_VERTICAL.chipStart + (saved.crossOffsets[id] ?? 0)
    const selected = id === c.selectedInstantId
    const focused = id === c.focusedInstantId
    const { tail, toolsWidth } = chipToolsExtent(inst, { selected, focused, moving: id === c.moving, editing: false, now: f.now, vertical: true })
    const box = { lo: mid - CHIP_HEIGHT / 2, hi: mid + CHIP_HEIGHT / 2 + tail, xlo, xhi: xlo + Math.max(c.widths[id] ?? estimateChipWidth(inst.label), toolsWidth) }
    blockers.push(box)
    if (selected || focused || id === c.moving) onTop.push(box)
  }
  for (const k of saved.clusters) {
    const ps = k.memberIds.map(posOf).filter((p): p is number => p !== null)
    if (ps.length === 0) continue
    // Where the "+N" chip is drawn: its members' mean time, slid as the layout slid it.
    const mid = ps.reduce((a, b) => a + b, 0) / ps.length + k.shift
    const xlo = GEOMETRY_VERTICAL.chipStart + k.crossOffset
    blockers.push({ lo: mid - CHIP_HEIGHT / 2, hi: mid + CHIP_HEIGHT / 2, xlo, xhi: xlo + CLUSTER_WIDTH })
  }

  const chipItems: FlagItem[] = []
  const liveItems: FlagItem[] = []
  const running: FlagItem[] = []
  const others: (FlagItem & { track: number })[] = []
  for (const lane of c.lanes) {
    const pa = f.pos(resolveTimeRef(lane.a, f.now, f.center))
    const pb = f.pos(resolveTimeRef(lane.b, f.now, f.center))
    const g = spanGeometry(pa, pb, f.mainSize)
    if (!g.onScreen) continue
    // Across the axis: live chips sit right of their bar at the left; saved-side chips hang
    // left of their bar at the right, with their tools row under or over them.
    const width = chipWidths.get(lane.key) ?? CHIP_WIDTH_GUESS
    if (isLiveLane(lane)) {
      const x = verticalLiveLaneX(lane.index) + CHIP_OFFSET
      liveItems.push({ key: lane.key, lo: g.left, hi: g.right, prefer: g.mid, xlo: x, xhi: x + width })
      continue
    }
    const laneX = f.crossSize - LANE_EDGE - lane.index * GEOMETRY_VERTICAL.laneGap
    const hasChip = chipLane(lane, c.selectedSpanId)
    if (hasChip) chipItems.push({ key: lane.key, lo: g.left, hi: g.right, prefer: g.mid, xlo: laneX - CHIP_OFFSET - Math.max(width, TOOLS_WIDTH), xhi: laneX - CHIP_OFFSET })
    if (lane.kind !== 'saved') continue
    const containsNow = Math.min(pa, pb) <= nowPos && nowPos <= Math.max(pa, pb) && nowPos >= 0 && nowPos <= f.mainSize
    // Spans with their own chip only get a flag for Now; the chip already names them.
    if (!containsNow && hasChip) continue
    const flagWidth = flagWidths.get(lane.key) || FLAG_WIDTH_GUESS
    const item = { key: lane.key, lo: g.left, hi: g.right, xlo: laneX - flagWidth, xhi: laneX }
    if (containsNow) running.push(item)
    else others.push({ ...item, prefer: g.mid, track: lane.index })
  }

  // Lane chips (with their tools) first: they are what you're working with. Lane chips draw
  // over saved instant chips, so they don't avoid those, except the selected or focused one,
  // which draws over them; and each other, where they meet across the axis too.
  const chipSize = LANE_CHIP_SIZE + 2 * LANE_TOOLS_SIZE
  // A span too short to hold its box clear of the others lets it out past its ends (escape).
  const chips = layoutNowFlags(chipItems, nowPos, chipSize, GAP, onTop, { escape: true })
  // A chip that had to leave its span isn't tied to a spot there any more: place it clear of
  // every instant chip too, so its tools don't land on them.
  const half = chipSize / 2
  const escaped = chipItems.filter(it => chips[it.key] - half < it.lo || chips[it.key] + half > it.hi)
  if (escaped.length > 0) {
    const stay: Interval[] = chipItems
      .filter(it => !escaped.includes(it))
      .map(it => ({ lo: chips[it.key] - half, hi: chips[it.key] + half, xlo: it.xlo, xhi: it.xhi }))
    Object.assign(chips, layoutNowFlags(escaped, nowPos, chipSize, GAP, [...blockers, ...stay], { escape: true }))
  }
  const chipBoxes: Interval[] = chipItems.map(it => ({ lo: chips[it.key] - chipSize / 2, hi: chips[it.key] + chipSize / 2, xlo: it.xlo, xhi: it.xhi }))
  // Live lanes' chips (left side) next, clear of those they would actually touch: a wide
  // selected chip can reach across the axis; the Now and Cursor tags sit on the live side.
  const tags: Interval[] = []
  const cursorPos = f.mainSize / 2
  for (const [key, size] of tagSizes) {
    // As CursorTag places itself: a step along the axis, away from Now, when the two would meet.
    const slot = key === 'cursor' && Math.abs(nowPos - cursorPos) < GEOMETRY_VERTICAL.tagSlotV ? (cursorPos < nowPos ? -1 : 1) : 0
    const mid = (key === 'now' ? nowPos : cursorPos) + slot * GEOMETRY_VERTICAL.tagSlotV
    const xhi = GEOMETRY_VERTICAL.axis - GEOMETRY_VERTICAL.tagArrow
    tags.push({ lo: mid - size.h / 2, hi: mid + size.h / 2, xlo: xhi - size.w, xhi })
  }
  const live = layoutNowFlags(liveItems, nowPos, LANE_CHIP_SIZE, GAP, [...chipBoxes, ...onTop, ...tags], { escape: true })
  Object.assign(chips, live)
  // Then flags at Now (nearest Now), then the other labels, clear of chips and each other.
  // Labels on one bar (spans sharing a lane, like laps) that would touch fold into one box first.
  const folded = groupTrackLabels(others.map(o => ({ key: o.key, track: o.track, want: o.prefer ?? (o.lo + o.hi) / 2, size: FLAG_SIZE })), { gap: GAP, groupSize: FLAG_SIZE })
  const byKey = new Map(others.map(o => [o.key, o]))
  const singles = others.filter(o => o.key in folded.shown).map(o => ({ ...o, prefer: folded.shown[o.key] }))
  const groupItems: FlagItem[] = folded.groups.map(g => {
    const ms = g.members.map(k => byKey.get(k)!)
    const xhi = ms[0].xhi
    const width = flagWidths.get(g.key) || GROUP_FLAG_WIDTH_GUESS
    return { key: g.key, prefer: g.center, lo: Math.min(...ms.map(m => m.lo)), hi: Math.max(...ms.map(m => m.hi)), xlo: (xhi ?? 0) - width, xhi }
  })
  const flags = layoutNowFlags([...running, ...groupItems, ...singles], nowPos, FLAG_SIZE, GAP, [...blockers, ...chipBoxes], { escape: true })
  const result = { chips, flags, flagGroups: folded.groups }
  cache = { frame: f, version, result }
  return result
}
