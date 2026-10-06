// Overlap layout for the saved-instant chips: builds layout inputs from the visible
// instants and chip widths, and exposes the structural result to React.
import { useEffect, useLayoutEffect, useMemo } from 'react'
import type { RefObject } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useFrameValue } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { chipName } from '../../domain/format.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import type { LabelItem } from '../../domain/labelLayout.ts'
import { layoutLabels } from '../../domain/labelLayout.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import { useAlarms } from '../../store/alarms.ts'
import { getTunables, useSettings } from '../../store/settings.ts'
import { verticalCrossBudget } from './geometry.ts'

/** Chips extend past the line; keep markers mounted this far off screen. */
export const CULL_MARGIN_PX = 400

export const CHIP_HEIGHT = 28
/** A chip's tool buttons (InstantColumns: .icon-btn 26px, 3px apart), and the gap to the chip: under it in vertical, beside it in horizontal. */
const TOOL_SIZE = 26
const TOOL_GAP = 3
const TOOLS_GAP_VERTICAL = 4
const TOOLS_GAP_HORIZONTAL = 6

/** How many tool buttons a chip shows (as InstantColumns draws them): selected, or moving. */
export function chipToolCount(i: InstantRecord, o: { selected: boolean; focused: boolean; moving: boolean; now: number }): number {
  if (o.moving) return 3 // type the time, confirm, cancel
  if (!o.selected) return 0
  return Number(!i.favorite) + Number(!i.alarm && i.tsEpochMs >= o.now) + Number(o.focused) + 2 // + hide, delete
}

/**
 * The room a chip's tools take: `tail` along the time axis after the chip (a row under it in
 * vertical, also the time while renaming; beside it in horizontal) and the row's width.
 */
export function chipToolsExtent(
  i: InstantRecord,
  o: { selected: boolean; focused: boolean; moving: boolean; editing: boolean; now: number; vertical: boolean },
): { tail: number; toolsWidth: number } {
  const tools = chipToolCount(i, o)
  const toolsWidth = tools > 0 ? tools * TOOL_SIZE + (tools - 1) * TOOL_GAP : 0
  const tail = o.vertical
    ? (tools > 0 || o.editing ? TOOLS_GAP_VERTICAL + TOOL_SIZE : 0)
    : (tools > 0 ? TOOLS_GAP_HORIZONTAL + toolsWidth : 0)
  return { tail, toolsWidth }
}
export const CLUSTER_WIDTH = 46
export const FOLD_BADGE_WIDTH = 34

/** Chip width before the DOM has measured it (and under jsdom, which never does). */
export const estimateChipWidth = (label: string): number => 9 * chipName(label).length + 40

// ---------------------------------------------------------------------------
// Measured chip widths, by instant id. Chips write here; widths change only when
// their content does, so re-running the layout is cheap.

interface ChipWidthsState {
  widths: Record<string, number>
  setWidth: (id: string, width: number) => void
  /** Drops the widths of instants that no longer exist. */
  prune: (existingIds: ReadonlySet<string>) => void
}

export const useChipWidths = create<ChipWidthsState>(set => ({
  widths: {},
  setWidth: (id, width) => set(s => (s.widths[id] === width ? s : { widths: { ...s.widths, [id]: width } })),
  prune: existingIds => set(s => {
    const stale = Object.keys(s.widths).filter(id => !existingIds.has(id))
    if (stale.length === 0) return s
    const widths = { ...s.widths }
    for (const id of stale) delete widths[id]
    return { widths }
  }),
}))

// One ResizeObserver for every chip. It reports border-box sizes after layout, so measuring
// never forces a layout in the middle of a frame (a mount used to read getBoundingClientRect,
// which during a zoom, when chips come and go every few frames, cost a fifth of the frame).
const chipIds = new Map<Element, string>()
const chipObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
  for (const e of entries) {
    const id = chipIds.get(e.target)
    if (id === undefined) continue
    const box = e.borderBoxSize?.[0]
    // Untransformed width: a pulsing (scaled) chip still reports its real size.
    const w = Math.ceil(box ? box.inlineSize : (e.target as HTMLElement).offsetWidth)
    if (w > 0) useChipWidths.getState().setWidth(id, w)
  }
})

/**
 * Reports the element's width into the widths store. Entries outlive the element: a
 * chip that folds or clusters unmounts, and the layout must still know how wide it was.
 */
export function useChipWidth(ref: RefObject<HTMLElement | null>, id: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !chipObserver) return
    chipIds.set(el, id)
    chipObserver.observe(el)
    return () => {
      chipObserver.unobserve(el)
      chipIds.delete(el)
    }
  }, [ref, id])
}

// ---------------------------------------------------------------------------
// Inputs

export interface LayoutContext {
  now: number
  /** Main-axis position of a time. */
  pos: (ts: number) => number
  mainSize: number
  selectedId: string | null
  /** The previously selected instant: an endpoint of the implied span, so it never folds or clusters. */
  secondaryId?: string | null
  /** Set only while the view is focused on that instant. */
  focusedId: string | null
  editingId: string | null
  movingId: string | null
  ringingIds: ReadonlySet<string>
  widths: Readonly<Record<string, number>>
  /** Defaults to horizontal. Vertical swaps the chip's extents: its height runs along time. */
  orientation?: 'horizontal' | 'vertical'
}

/** Layout items for the given instants. Priority: focused 0, selected 1, secondary 1.5, moving/editing 2, ringing 3, upcoming alarm 4, favorite 5, other 6. */
export function layoutItems(instants: readonly InstantRecord[], c: LayoutContext): LabelItem[] {
  const vertical = c.orientation === 'vertical'
  return instants.map(i => {
    const focused = c.focusedId === i.id
    const selected = c.selectedId === i.id
    const secondary = c.secondaryId === i.id
    const moving = c.movingId === i.id
    const editing = c.editingId === i.id
    const ringing = c.ringingIds.has(i.id)
    const width = c.widths[i.id] ?? estimateChipWidth(i.label)
    const priority = focused ? 0 : selected ? 1 : secondary ? 1.5 : moving || editing ? 2 : ringing ? 3
      : i.alarm && i.tsEpochMs > c.now ? 4 : i.favorite ? 5 : 6
    // Its tools take room too, so neighbours keep clear of them.
    const { tail, toolsWidth } = chipToolsExtent(i, { selected, focused, moving, editing, now: c.now, vertical })
    return {
      id: i.id,
      // A moving instant follows the cursor at the center of the view.
      pos: moving ? c.mainSize / 2 : c.pos(i.tsEpochMs),
      mainExtent: vertical ? CHIP_HEIGHT : width,
      crossExtent: vertical ? Math.max(width, toolsWidth) : CHIP_HEIGHT,
      ...(tail > 0 ? { tail } : {}),
      priority,
      ...(i.snoozeOriginalId ? { groupId: i.snoozeOriginalId } : {}),
      pinned: focused || selected || secondary || moving || editing || ringing,
    }
  })
}

// ---------------------------------------------------------------------------
// Structural result: no positions, so a pure pan changes it only when chips enter or leave.

export interface ClusterInfo {
  id: string
  memberIds: string[]
  slot: number
  crossOffset: number
  /** px the chip slid along the time axis from its members' mean time. */
  shift: number
  topPriority: number
}

export interface SavedLayout {
  visibleIds: string[]
  /** Chip row (0 = next to the axis) of every chip that is shown. */
  rows: Record<string, number>
  /** Vertical only: px a chip sits right of chip column 0 (0 in horizontal). */
  crossOffsets: Record<string, number>
  /** px a chip slid along the time axis from its marker to avoid clustering (absent = 0). */
  shifts: Record<string, number>
  /** Folded snooze id → the chip showing it. */
  folded: Record<string, string>
  /** Chip id → snoozes it shows. */
  foldCount: Record<string, number>
  clusters: ClusterInfo[]
  /** Rows the chips occupy, at least 1. */
  rowsUsed: number
}

const sameStrings = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, k) => x === b[k])
const sameRecord = <T,>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>) => {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every(k => k in b && a[k] === b[k])
}

/** Structural equality without serializing: the same chips in the same places. */
export function layoutEqual(a: SavedLayout, b: SavedLayout): boolean {
  if (a === b) return true
  return a.rowsUsed === b.rowsUsed && sameStrings(a.visibleIds, b.visibleIds) &&
    sameRecord(a.rows, b.rows) && sameRecord(a.crossOffsets, b.crossOffsets) && sameRecord(a.shifts, b.shifts) &&
    sameRecord(a.folded, b.folded) && sameRecord(a.foldCount, b.foldCount) &&
    a.clusters.length === b.clusters.length &&
    a.clusters.every((c, k) => {
      const d = b.clusters[k]
      return c.id === d.id && c.slot === d.slot && c.crossOffset === d.crossOffset && c.shift === d.shift && c.topPriority === d.topPriority && sameStrings(c.memberIds, d.memberIds)
    })
}

/** A zoom change smaller than this (relative) reuses the last layout. */
export const ZOOM_REUSE = 0.005

/** Counts real layout runs (cache misses); tests use it to prove a pan reuses the result. */
export const layoutStats = { runs: 0 }

/** Everything except the frame that the layout depends on; each field is compared by identity. */
export interface SavedLayoutInputs {
  orientation: 'horizontal' | 'vertical'
  dir: 1 | -1
  instants: readonly InstantRecord[]
  mode: string
  focusedInstantId: string | null
  selected: string | null
  secondary: string | null
  editing: string | null
  moving: string | null
  ringing: readonly string[]
  widths: Readonly<Record<string, number>>
  tunables: unknown
  laneCount: number
  /** Endpoints of the selected or focused span: shown even when hidden. Absent = none. */
  revealIds?: readonly string[]
}

type FrameLike = Pick<Frame, 'now' | 'pos' | 'start' | 'end' | 'pxPerMs' | 'mainSize' | 'crossSize'>

interface CacheEntry {
  inputs: SavedLayoutInputs
  visible: InstantRecord[]
  upcoming: boolean[]
  pxPerMs: number
  crossSize: number
  result: SavedLayout
}

/**
 * The layout as a function of the frame, memoized. Positions are taken relative to the
 * earliest visible instant, so a pure pan changes nothing the layout reads: the cache key
 * is the visible set (and which alarms are still upcoming), zoom (within ZOOM_REUSE), cross size and the inputs.
 * A moving instant rides the screen center, which a pan does move relative to the others,
 * so that mode skips the cache.
 */
export function createSavedLayoutCache(): (f: FrameLike, inputs: SavedLayoutInputs) => SavedLayout {
  let cache: CacheEntry | null = null
  return (f, c) => {
    const margin = CULL_MARGIN_PX / f.pxPerMs
    const lo = f.start - margin
    const hi = f.end + margin
    // Hidden instants show only while you're working with them (selected, focused, editing,
    // moving) or with a span they end (selected or focused span).
    const revealed = (i: InstantRecord) => !!c.revealIds?.includes(i.id)
    const isVisible = (i: InstantRecord) =>
      i.id === c.selected || i.id === c.secondary || i.id === c.focusedInstantId || i.id === c.editing || i.id === c.moving ||
      ((!i.hidden || revealed(i)) && i.tsEpochMs >= lo && i.tsEpochMs <= hi)
    const prev = cache

    // Cheap probe: walk the instants once against the cached visible set, allocating nothing.
    // A zoom step too small to matter (the tail of zoom smoothing) reuses the layout too: chips
    // glide to their spots anyway, so being off by a pixel or two for a frame doesn't show.
    if (prev && prev.inputs === c && c.moving === null && Math.abs(f.pxPerMs / prev.pxPerMs - 1) < ZOOM_REUSE && prev.crossSize === f.crossSize) {
      let n = 0
      let same = true
      for (const i of c.instants) {
        if (!isVisible(i)) continue
        if (prev.visible[n] !== i || prev.upcoming[n] !== (!!i.alarm && i.tsEpochMs > f.now)) { same = false; break }
        n++
      }
      if (same && n === prev.visible.length) return prev.result
    }

    layoutStats.runs++
    const visible = c.instants.filter(isVisible)
    const origin = visible.reduce((m, i) => Math.min(m, i.tsEpochMs), Infinity)
    const originPos = Number.isFinite(origin) ? f.pos(origin) : 0
    const vertical = c.orientation === 'vertical'
    const items = layoutItems(visible, {
      now: f.now,
      pos: ts => f.pos(ts) - originPos,
      mainSize: f.mainSize,
      selectedId: c.selected,
      secondaryId: c.secondary,
      focusedId: c.mode === 'instant' ? c.focusedInstantId : null,
      editingId: c.editing,
      movingId: c.moving,
      ringingIds: new Set(c.ringing),
      widths: c.widths,
      orientation: c.orientation,
    })
    const t = getTunables()
    const r = layoutLabels(items, {
      orientation: c.orientation,
      crossBudget: vertical ? verticalCrossBudget(f.crossSize, c.laneCount) : Infinity,
      slotGap: t.chipGapPx,
      maxSlots: vertical ? t.chipColumnsMax : t.chipRowsMax,
      cluster: vertical ? { mainExtent: CHIP_HEIGHT, crossExtent: CLUSTER_WIDTH } : { mainExtent: CLUSTER_WIDTH, crossExtent: CHIP_HEIGHT },
      foldBadgeExtent: FOLD_BADGE_WIDTH,
      maxShift: t.chipShiftMaxPx,
    })
    const rows = Object.fromEntries(Object.entries(r.placed).map(([id, p]) => [id, p.slot]))
    const crossOffsets = Object.fromEntries(Object.entries(r.placed).map(([id, p]) => [id, vertical ? p.crossOffset : 0]))
    const shifts = Object.fromEntries(Object.entries(r.placed).filter(([, p]) => p.shift !== 0).map(([id, p]) => [id, Math.round(p.shift)]))
    const deepest = Math.max(-1, ...Object.values(rows), ...r.clusters.map(k => k.slot))
    const next: SavedLayout = {
      visibleIds: visible.map(i => i.id),
      rows,
      crossOffsets,
      shifts,
      folded: r.folded,
      foldCount: r.foldCount,
      clusters: r.clusters.map(k => ({ id: k.id, memberIds: k.memberIds, slot: k.slot, crossOffset: k.crossOffset, shift: Math.round(k.shift), topPriority: k.topPriority })),
      rowsUsed: Math.max(1, deepest + 1),
    }
    // Keep the old object when nothing visible changed, so React skips the render.
    const result = prev && layoutEqual(prev.result, next) ? prev.result : next
    cache = {
      inputs: c,
      visible,
      upcoming: visible.map(i => !!i.alarm && i.tsEpochMs > f.now),
      pxPerMs: f.pxPerMs,
      crossSize: f.crossSize,
      result,
    }
    return result
  }
}

// ---------------------------------------------------------------------------
// Per frame: chips, lines and lane labels read their geometry from savedLayoutAt(frame);
// React sees only the structure, so a zoom (which moves chips every frame) re-renders
// nothing until a chip actually appears, disappears or joins a "+N".

/**
 * What React renders from: which chips exist and what the "+N" and "⟲N" chips hold. Lines
 * (every visible instant, which changes all the time while zooming) are drawn per frame.
 */
export interface SavedLayoutStructure {
  /** Instants that show a chip (the layout placed them), in time-sorted visible order. */
  chipIds: string[]
  folded: Record<string, string>
  foldCount: Record<string, number>
  clusters: { id: string; memberIds: string[]; topPriority: number }[]
  rowsUsed: number
}

const sameKeys = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every(k => k in b)
}

/** Same structure: the same chips, folds and clusters, wherever they sit. */
export function layoutStructureEqual(a: SavedLayout, b: SavedLayout): boolean {
  if (a === b) return true
  return a.rowsUsed === b.rowsUsed && sameKeys(a.rows, b.rows) &&
    sameRecord(a.folded, b.folded) && sameRecord(a.foldCount, b.foldCount) &&
    a.clusters.length === b.clusters.length &&
    a.clusters.every((c, k) => {
      const d = b.clusters[k]
      return c.id === d.id && c.topPriority === d.topPriority && sameStrings(c.memberIds, d.memberIds)
    })
}

export const structureOf = (l: SavedLayout): SavedLayoutStructure => ({
  chipIds: l.visibleIds.filter(id => l.rows[id] !== undefined),
  folded: l.folded,
  foldCount: l.foldCount,
  clusters: l.clusters.map(c => ({ id: c.id, memberIds: c.memberIds, topPriority: c.topPriority })),
  rowsUsed: l.rowsUsed,
})

export const EMPTY_LAYOUT: SavedLayout = { visibleIds: [], rows: {}, crossOffsets: {}, shifts: {}, folded: {}, foldCount: {}, clusters: [], rowsUsed: 1 }

const source: {
  compute: ReturnType<typeof createSavedLayoutCache>
  inputs: SavedLayoutInputs | null
  last: { f: FrameLike; inputs: SavedLayoutInputs; result: SavedLayout } | null
} = { compute: createSavedLayoutCache(), inputs: null, last: null }

/** The saved chips' layout for a frame, computed once per frame from the latest inputs. */
export function savedLayoutAt(f: FrameLike): SavedLayout {
  const inputs = source.inputs
  if (!inputs) return EMPTY_LAYOUT
  const last = source.last
  if (last && last.f === f && last.inputs === inputs) return last.result
  const result = source.compute(f, inputs)
  source.last = { f, inputs, result }
  return result
}

/** Where a cluster is this frame (by id), from the layout's cluster list. */
const clusterIndex = new WeakMap<SavedLayout, Map<string, ClusterInfo>>()
export function clusterAt(l: SavedLayout, id: string): ClusterInfo | undefined {
  let m = clusterIndex.get(l)
  if (!m) { m = new Map(l.clusters.map(c => [c.id, c])); clusterIndex.set(l, m) }
  return m.get(id)
}

/**
 * Feeds the saved chips' layout its inputs (call it in the Timeline, above every reader) and
 * returns how many chip rows are in use. `laneCount`: span lanes on screen, which take width
 * from the chips in vertical.
 */
export function useSavedLayoutSource(laneCount = 0): number {
  const orientation = useLayout(s => s.orientation)
  const dir = useLayout(s => s.dir)
  const instants = useEntities(s => s.instants)
  const v = useView(useShallow(s => ({
    mode: s.viewFocusMode,
    focusedInstantId: s.focusedInstantId,
    selected: s.currentSelectedInstantId,
    secondary: s.secondarySelectedInstantId,
    editing: s.editingInstantId,
    moving: s.moveMode?.instantId ?? null,
  })))
  // The selected or focused span's endpoints, so hidden ones show with it.
  const spanIds = useView(useShallow(s => [s.selectedSpanId, s.viewFocusMode === 'span' ? s.focusedSpanId : null]))
  const spans = useEntities(s => s.spans)
  const revealIds = useMemo(() => spans
    .filter(sp => spanIds.includes(sp.id))
    .flatMap(sp => [sp.startInstantId, sp.endInstantId]), [spans, spanIds])
  const ringing = useAlarms(useShallow(s => s.ringing.map(r => r.instantId)))
  const widths = useChipWidths(s => s.widths)
  const tunables = useSettings(s => s.tunables) // tunable changes re-run the layout
  useEffect(() => { useChipWidths.getState().prune(new Set(instants.map(i => i.id))) }, [instants])
  const inputs = useMemo<SavedLayoutInputs>(
    () => ({ orientation, dir, instants, ...v, ringing, widths, tunables, laneCount, revealIds }),
    [orientation, dir, instants, v, ringing, widths, tunables, laneCount, revealIds],
  )
  // Set during render so the children rendering next (the chips) read these inputs.
  source.inputs = inputs
  return useFrameValue((f: Frame) => {
    source.inputs = inputs
    return savedLayoutAt(f).rowsUsed
  })
}

/** The chips' structure, re-rendering only when a chip appears, goes or joins a "+N" (not when chips move). */
export function useSavedLayoutStructure(): SavedLayoutStructure {
  const layout = useFrameValue((f: Frame) => savedLayoutAt(f), layoutStructureEqual)
  return useMemo(() => structureOf(layout), [layout])
}
