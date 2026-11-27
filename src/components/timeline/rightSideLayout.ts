// Vertical layout: where every span lane's chip and label goes, computed once per frame and
// shared. Saved-side lane chips (selected/focused saved spans and implied selection spans,
// with their tools) go first, near the middle of their visible span; then live lanes' chips
// (left side); then flags at Now for spans containing Now; then label boxes for the other
// spans, longer spans first. None of them overlap (domain/nowFlags); flags also keep clear of
// saved instant chips. A label box stays on its span: with no room there it is left off and its
// span shows its bar alone (a tap on the bar selects it). A block (a todo's plan) follows its
// todo's chip (domain/blocks planLook): folded into it (in vertical, always while it shows) its
// bar draws alone; with the chip a Mark, nothing; with it off screen, its own chip (its length,
// no tools) is placed like a label box, on its span or not at all.
import type { Frame } from '../../engine/viewportEngine.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { resolveTimeRef, spanGeometry } from '../../domain/spans.ts'
import { layoutNowFlags } from '../../domain/nowFlags.ts'
import type { FlagItem, Interval } from '../../domain/nowFlags.ts'
import type { SavedLayout } from './savedLayout.ts'
import { CHIP_HEIGHT, CLUSTER_WIDTH, chipToolsExtent, estimateChipWidth, savedLayoutAt } from './savedLayout.ts'
import { GEOMETRY_VERTICAL, verticalLiveLaneX } from './geometry.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { getTunables } from '../../store/settings.ts'
import { createLookWidths } from './lookWidths.ts'
import type { TagSize } from '../../domain/tagAvoid.ts'
import { cursorPush } from '../../domain/tagAvoid.ts'
import { captureFlowAt } from './capture.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, laneHasControls } from './useBottomLanes.ts'
import { planLook } from '../../domain/blocks.ts'

/** A flag's height and the gap kept around boxes, px. */
export const FLAG_SIZE = 26
const GAP = 4
/** A lane chip with its tools above and/or below it, px along the time axis. */
const LANE_CHIP_SIZE = 32
const LANE_TOOLS_SIZE = 36
/** A flag's width before it has been measured, px: with its name, and its reading alone. */
const FLAG_WIDTH_GUESS = 150
const COMPACT_FLAG_WIDTH_GUESS = 56
/** Gap between a live lane's bar and its chip (matches .tl-lane--live .tl-lane__chip-wrap in vertical). */
const CHIP_OFFSET = 10
/** A saved-side chip runs into its bar, like a label box (matches .tl-lane__chip-wrap in vertical). */
const SAVED_CHIP_OFFSET = 1.5
/** A lane chip's width before it has been measured, px. */
const CHIP_WIDTH_GUESS = 160
/** The tools row under or over a saved-side chip (pencil, eye, trash / pin), px wide. */
const TOOLS_WIDTH = 120

// Measured lane chip widths, kept current by one ResizeObserver (no layout reads mid-frame). A
// saved-side chip may show compact (its reading alone: lookWidths), so both widths are known.
const laneChips = createLookWidths(() => { version++; engine.requestFrame() })

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

/** A live tag box's size before it has been measured, px. */
const TAG_GUESS = { w: 128, h: 52 }

/** The Now and Cursor tags' boxes along and across the time axis (domain/tagAvoid), measured or guessed. */
export function liveTagSizes(orientation: 'horizontal' | 'vertical'): { now: TagSize; cursor: TagSize } {
  const size = (key: 'now' | 'cursor') => {
    const s = tagSizes.get(key) ?? TAG_GUESS
    return orientation === 'horizontal' ? { main: s.w, cross: s.h } : { main: s.h, cross: s.w }
  }
  return { now: size('now'), cursor: size('cursor') }
}

/** Where the Cursor tag's box is centered along the time axis this frame, px: on the cursor's line (leaning onto what it is capturing), pushed out of the Now tag's way (vertical), merged into Now's while the cursor merges into Now. */
export function cursorTagPos(f: Frame): number {
  const flow = captureFlowAt(f)
  const mid = f.mainSize / 2 + flow.lean
  if (f.orientation === 'horizontal') return mid
  const { now, cursor } = liveTagSizes('vertical')
  return mid + cursorPush(mid - f.pos(f.now), now, cursor) * (1 - (flow.kind === 'now' ? flow.s : 0))
}

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
// layout every frame. Crowded, a box shows its reading alone (compact).
const flagBoxes = createLookWidths(() => { version++; engine.requestFrame() })

/** A lane label box registers itself while it is mounted; returns the cleanup. */
export const observeFlag = (key: string, el: HTMLElement): (() => void) => flagBoxes.observe(key, el)

/** A lane chip's measured width (`compact`: its reading alone), if it has been measured. */
export const laneChipWidth = (key: string, compact = false): number | undefined => laneChips.width(key, compact)
/** Changes whenever a measured width changes (for per-frame caches). */
export const laneChipWidthsVersion = (): number => version

/** SpanLane registers its chip so the layout knows how wide it is; returns the cleanup. */
export const observeLaneChip = (key: string, el: HTMLElement): (() => void) => laneChips.observe(key, el)

export interface RightSideInputs {
  lanes: readonly BottomLane[]
  selectedSpanId: string | null
  instants: readonly InstantRecord[]
  widths: Readonly<Record<string, number>>
  /** Chips taller than CHIP_HEIGHT (a focused chip's wrapped name). Absent = none. */
  heights?: Readonly<Record<string, number>>
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
  /** Lane key → center of its flag, px; absent: no room on its span (its bar shows alone). */
  flags: Record<string, number>
  /** Flags and block chips shown compact (their reading alone, no name): no room on their span for the whole box, or (a block) its instant's chip names it. */
  compact: Record<string, true>
  /** Block chips with no room on their span, or folded into their todo's chip: their bar shows alone. */
  bare: Record<string, true>
  /** Blocks (todos' plans) not drawn: their todo's chip doesn't show. */
  hidden: Record<string, true>
}

let inputs: RightSideInputs | null = null
let version = 0
let cache: { frame: Frame; version: number; result: RightSidePlacement } | null = null

/** NowFlags hands over the current lanes and chips (each render). */
export function setRightSideInputs(next: RightSideInputs) {
  inputs = next
  version++
}

const EMPTY: RightSidePlacement = { chips: {}, flags: {}, compact: {}, bare: {}, hidden: {} }

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
    const half = (c.heights?.[id] ?? CHIP_HEIGHT) / 2
    const box = { lo: mid - half, hi: mid + half + tail, xlo, xhi: xlo + Math.max(c.widths[id] ?? estimateChipWidth(inst.label), toolsWidth) }
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
  /** A label box, and the same box compact (its reading alone: narrower, hugging its bar). A block's chip (`block`) is placed the same way. */
  type Flag = FlagItem & { short: FlagItem; block?: boolean }
  const bare: Record<string, true> = {}
  const hidden: Record<string, true> = {}
  const running: Flag[] = []
  const others: (Flag & { length: number })[] = []
  for (const lane of c.lanes) {
    const pa = f.pos(resolveTimeRef(lane.a, f.now, f.center))
    const pb = f.pos(resolveTimeRef(lane.b, f.now, f.center))
    const g = spanGeometry(pa, pb, f.mainSize)
    if (!g.onScreen) continue
    // Across the axis: live chips sit right of their bar at the left; saved-side chips hang
    // left of their bar at the right, with their tools row under or over them.
    const width = laneChips.width(lane.key, false) ?? CHIP_WIDTH_GUESS
    if (isLiveLane(lane)) {
      const x = verticalLiveLaneX(lane.index) + CHIP_OFFSET
      liveItems.push({ key: lane.key, lo: g.left, hi: g.right, prefer: g.mid, xlo: x, xhi: x + width })
      continue
    }
    const laneX = f.crossSize - GEOMETRY_VERTICAL.laneEdge - lane.index * GEOMETRY_VERTICAL.laneGap
    const containsNow = lane.kind === 'saved' && Math.min(pa, pb) <= nowPos && nowPos <= Math.max(pa, pb) && nowPos >= 0 && nowPos <= f.mainSize
    // A span with its own chip (selected or focused) gets no label box: the chip reads the same
    // (SpanReading), at the same spot (at Now while it contains Now).
    if (chipLane(lane, c.selectedSpanId)) {
      chipItems.push({ key: lane.key, lo: g.left, hi: g.right, prefer: containsNow ? nowPos : g.mid, xlo: laneX - SAVED_CHIP_OFFSET - Math.max(width, TOOLS_WIDTH), xhi: laneX - SAVED_CHIP_OFFSET })
      continue
    }
    if (lane.kind === 'block') {
      const at = lane.block.instantId
      const look = at === undefined ? 'chip' : planLook({ chip: saved.rows[at] !== undefined, folded: saved.planFolded[at] !== undefined, mark: !!saved.marks[at], onScreen: pa >= 0 && pa <= f.mainSize })
      if (look === 'hidden') { hidden[lane.key] = true; continue }
      if (look === 'bar') { bare[lane.key] = true; continue }
      const xhi = laneX - SAVED_CHIP_OFFSET
      const full = { key: lane.key, lo: g.left, hi: g.right, prefer: g.mid, size: LANE_CHIP_SIZE, xlo: xhi - width, xhi }
      others.push({ ...full, short: full, block: true, length: Math.abs(pb - pa) })
      continue
    }
    if (lane.kind !== 'saved') continue
    // Compact or whole, a box wants the same spot (its span's middle, or Now).
    const full = { key: lane.key, lo: g.left, hi: g.right, prefer: containsNow ? undefined : g.mid, xlo: laneX - (flagBoxes.width(lane.key, false) || FLAG_WIDTH_GUESS), xhi: laneX }
    const item = { ...full, short: { ...full, xlo: laneX - (flagBoxes.width(lane.key, true) || COMPACT_FLAG_WIDTH_GUESS) } }
    if (containsNow) running.push(item)
    else others.push({ ...item, length: Math.abs(pb - pa) })
  }

  // Lane chips (with their tools) first: they are what you're working with. Lane chips draw
  // over saved instant chips, so they don't avoid those (their tools draw over them), except the
  // selected or focused one, which draws over them; and each other, where they meet across the
  // axis too. A chip stays on its span (covering a span shorter than itself); only where the
  // selected instant's chip or another lane chip leaves it no room there does it step past its
  // span's end, to the nearest free spot (escape).
  const chipSize = LANE_CHIP_SIZE + 2 * LANE_TOOLS_SIZE
  const cover = getTunables().chipLineInsetPx
  const chips = layoutNowFlags(chipItems, nowPos, chipSize, GAP, onTop, { escape: true, cover })
  const chipBoxes: Interval[] = chipItems.map(it => ({ lo: chips[it.key] - chipSize / 2, hi: chips[it.key] + chipSize / 2, xlo: it.xlo, xhi: it.xhi }))
  // Live lanes' chips (left side) next, clear of those they would actually touch: a wide
  // selected chip can reach across the axis; the Now and Cursor tags sit on the live side.
  const tags: Interval[] = []
  for (const [key, size] of tagSizes) {
    // As CursorTag places itself: pushed along the axis, away from Now, as the two meet.
    const mid = key === 'now' ? nowPos : cursorTagPos(f)
    const xhi = GEOMETRY_VERTICAL.axis - GEOMETRY_VERTICAL.tagArrow
    tags.push({ lo: mid - size.h / 2, hi: mid + size.h / 2, xlo: xhi - size.w, xhi })
  }
  const live = layoutNowFlags(liveItems, nowPos, LANE_CHIP_SIZE, GAP, [...chipBoxes, ...onTop, ...tags], { escape: true })
  Object.assign(chips, live)
  // Then flags at Now (nearest Now), then the other labels (longer spans first: their whole
  // length, so a pan never reorders them), clear of chips and each other, each on its span or
  // not at all: whole where there is room, else compact (its reading alone, clear of most
  // instant chips), else its bar alone. Blocks' chips go with them, by length.
  others.sort((a, b) => b.length - a.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const taken: Interval[] = [...blockers, ...chipBoxes]
  const flags: Record<string, number> = {}
  const compact: Record<string, true> = {}
  for (const it of [...running, ...others]) {
    const size = it.size ?? FLAG_SIZE
    for (const look of it.block ? [it] : [it, it.short]) {
      const y = layoutNowFlags([look], nowPos, size, GAP, taken, { drop: true, cover })[it.key]
      if (y === undefined) continue
      ;(it.block ? chips : flags)[it.key] = y
      if (look === it.short) compact[it.key] = true
      taken.push({ lo: y - size / 2, hi: y + size / 2, xlo: look.xlo, xhi: look.xhi })
      break
    }
    if (it.block && chips[it.key] === undefined) bare[it.key] = true
  }
  const result = { chips, flags, compact, bare, hidden }
  cache = { frame: f, version, result }
  return result
}
