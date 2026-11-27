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
import { GEOMETRY, GEOMETRY_VERTICAL, verticalCrossBudget } from './geometry.ts'
import type { PushBox } from '../../domain/pushClear.ts'
import { pushClear } from '../../domain/pushClear.ts'
import { hasArmedAlarm, parseRingKey, ringKey } from '../../domain/alarms.ts'
import { bellItemId, bellsToShow } from '../../domain/bells.ts'
import type { Stage, Visibility } from '../../domain/displayGroups.ts'
import { groupVisibility, markFade, recurringGroupOf, stageAt } from '../../domain/displayGroups.ts'
import { HOUR } from '../../domain/time.ts'
import { instantVisibility, longestSpans } from '../../domain/reach.ts'
import { doneFolds, instantsByTodo, plannedBlocks } from '../../domain/todos.ts'
import type { TimeBlock } from '../../domain/blocks.ts'
import { planFolds } from '../../domain/blocks.ts'
import type { SpanRecord } from '../../domain/entities.ts'
import { useUi } from '../../store/ui.ts'
import { bellDragAt } from './bellDrag.ts'
import { setDrawnSource } from '../../store/actions.ts'
import { useTimelineInstants } from './timelineInstants.ts'

/** Chips extend past the line; keep markers mounted this far off screen. */
export const CULL_MARGIN_PX = 400

export const CHIP_HEIGHT = 28
/** Horizontal: a chip being named shows its time in a box under it (.tl-col__below), this much taller. */
export const EDIT_TIME_EXTRA = 26
/** Vertical: a chip being named has a row under it (its time, and its tools) this much taller (a tool button 26px and its gap). */
const TOOL_SIZE = 26
const TOOLS_GAP_BELOW = 4

/** A bell before its instant (BellMarker): its button (its tools, while selected, take no room). */
export const BELL_SIZE = 26

/** A bell's box: the bell alone. Its tools (while selected) draw over whatever is under them and take no room (owner 2026-11-22). */
function bellExtent(vertical: boolean): { mainExtent: number; crossExtent: number } {
  return vertical ? { mainExtent: CHIP_HEIGHT, crossExtent: BELL_SIZE } : { mainExtent: BELL_SIZE, crossExtent: CHIP_HEIGHT }
}

/** Whether a chip's tools sit in the row under it (.tl-col__below): always, but beside a moving chip in horizontal (its "Moving" badge is under it). */
export const chipToolsBelow = (o: { moving: boolean; vertical: boolean }) => o.vertical || !o.moving

/**
 * The room the row under a chip takes in the layout: only the time shown while it is being named
 * (`tail` along the time axis in vertical, `below` across it in horizontal). Its tools take none:
 * they draw over the chips under them, never pushing them aside (owner 2026-11-22). `toolsWidth`
 * is always 0 here (kept so callers read one shape).
 */
export function chipToolsExtent(
  _i: InstantRecord,
  o: { selected: boolean; focused: boolean; moving: boolean; editing: boolean; now: number; vertical: boolean; selectedBell?: string | null },
): { tail: number; below: number; toolsWidth: number } {
  const row = o.editing ? (o.vertical ? TOOLS_GAP_BELOW + TOOL_SIZE : EDIT_TIME_EXTRA) : 0
  return o.vertical ? { tail: row, below: 0, toolsWidth: 0 } : { tail: 0, below: row, toolsWidth: 0 }
}
export const CLUSTER_WIDTH = 46
export const FOLD_BADGE_WIDTH = 34

/** Chip width before the DOM has measured it (and under jsdom, which never does). */
export const estimateChipWidth = (label: string): number => 9 * chipName(label).length + 40

// ---------------------------------------------------------------------------
// Measured chip widths, by instant id. Chips write here; widths change only when
// their content does, so re-running the layout is cheap. Heights only for chips taller than
// CHIP_HEIGHT (a focused chip's name wrapping onto more lines); the rest are CHIP_HEIGHT.

interface ChipWidthsState {
  widths: Record<string, number>
  heights: Record<string, number>
  setWidth: (id: string, width: number) => void
  /** A chip's height: kept only while it is taller than CHIP_HEIGHT. */
  setHeight: (id: string, height: number) => void
  /** Drops the widths of instants that no longer exist. */
  prune: (existingIds: ReadonlySet<string>) => void
}

export const useChipWidths = create<ChipWidthsState>(set => ({
  widths: {},
  heights: {},
  setWidth: (id, width) => set(s => (s.widths[id] === width ? s : { widths: { ...s.widths, [id]: width } })),
  setHeight: (id, height) => set(s => {
    const tall = height > CHIP_HEIGHT + 1
    if (tall ? s.heights[id] === height : s.heights[id] === undefined) return s
    const heights = { ...s.heights }
    if (tall) heights[id] = height
    else delete heights[id]
    return { heights }
  }),
  prune: existingIds => set(s => {
    // Series summary chips (series:<id>) aren't instants: their widths stay.
    const gone = (id: string) => !existingIds.has(id) && !id.startsWith('series:')
    const stale = Object.keys(s.widths).filter(gone)
    const staleTall = Object.keys(s.heights).filter(gone)
    if (stale.length === 0 && staleTall.length === 0) return s
    const widths = { ...s.widths }
    for (const id of stale) delete widths[id]
    const heights = { ...s.heights }
    for (const id of staleTall) delete heights[id]
    return { widths, heights }
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
    const h = Math.ceil(box ? box.blockSize : (e.target as HTMLElement).offsetHeight)
    if (h > 0) useChipWidths.getState().setHeight(id, h)
  }
})

/**
 * Reports the element's width into the widths store. Entries outlive the element: a
 * chip that folds or clusters unmounts, and the layout must still know how wide it was.
 * Not while `active` is false: a chip shrinking away into a mark loses what was folded into it
 * (its ✓, its bells), and measuring it narrower would fit it again, a frame later, folds and all.
 */
export function useChipWidth(ref: RefObject<HTMLElement | null>, id: string, active = true) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !chipObserver || !active) return
    chipIds.set(el, id)
    chipObserver.observe(el)
    return () => {
      chipObserver.unobserve(el)
      chipIds.delete(el)
    }
  }, [ref, id, active])
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
  /** The alarm whose bell is selected, when it is on its chip (at the instant, or folded in): its tools show under the chip. */
  selectedBell?: string | null
  widths: Readonly<Record<string, number>>
  /** Measured heights of chips taller than CHIP_HEIGHT (a focused chip's wrapped name). */
  heights?: Readonly<Record<string, number>>
  /** Defaults to horizontal. Vertical swaps the chip's extents: its height runs along time. */
  orientation?: 'horizontal' | 'vertical'
}

/**
 * An instant that says least on its own: unnamed (a timer's start, a quick drop), or a todo's
 * ▶ start, ⏸ pause, ✓ done or earlier plan (its `at` chip and its stretch's lane tell its story).
 * Crowded, it is the first to become a mark.
 */
export const isMinorInstant = (i: InstantRecord): boolean => !i.label || (!!i.todo && i.todo.role !== 'at')

/** Layout items for the given instants. Priority: focused 0, selected 1, secondary 1.5, moving/editing 2, ringing 3, (bells 3.5), upcoming alarm 4, favorite 5, other 6, minor 6.5 (isMinorInstant). */
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
    const height = c.heights?.[i.id] ?? CHIP_HEIGHT
    const priority = focused ? 0 : selected ? 1 : secondary ? 1.5 : moving || editing ? 2 : ringing ? 3
      : hasArmedAlarm(i, c.now) ? 4 : i.favorite ? 5 : isMinorInstant(i) ? 6.5 : 6
    // Its tools take room too, so neighbours keep clear of them.
    const { tail, below, toolsWidth } = chipToolsExtent(i, { selected, focused, moving, editing, now: c.now, vertical, selectedBell: c.selectedBell })
    const rowWidth = below > 0 ? toolsWidth : 0
    return {
      id: i.id,
      // A moving instant follows the cursor at the center of the view.
      pos: moving ? c.mainSize / 2 : c.pos(i.tsEpochMs),
      mainExtent: vertical ? height : Math.max(width, rowWidth),
      crossExtent: vertical ? Math.max(width, toolsWidth) : height + below,
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
  /** px a chip sits from the first row (horizontal: below it) or column (vertical: right of it). */
  crossOffsets: Record<string, number>
  /** px a chip slid along the time axis from its marker to avoid clustering (absent = 0). */
  shifts: Record<string, number>
  /** Folded snooze id → the chip showing it. */
  folded: Record<string, string>
  /** Chip id → snoozes it shows. */
  foldCount: Record<string, number>
  clusters: ClusterInfo[]
  /** Bells before their instants that are drawn (alarm ids, in time order); placed under `bell:<id>` in rows/crossOffsets/shifts. */
  bellIds: string[]
  /** Instant id → live bells folded into its chip (too close to stand apart): alarm ids, comma-joined, earliest first. */
  bellFolded: Record<string, string>
  /** A todo's `at` id → its ✓ (`done`) instant folded into its chip (too close to stand apart; domain/todos doneFolds). The ✓ draws as a mark. */
  doneFolded: Record<string, string>
  /** A todo's `at` id → its plan's length, ms, folded into its chip (domain/blocks planFolds): close to its start, or vertical. Its plan draws its bar alone. */
  planFolded: Record<string, number>
  /** Instants shown as a Mark (a line from the axis, no chip): past their Label zoom (domain/displayGroups), or crowded (no room for their chip). */
  marks: Record<string, true>
  /** Marks fading out before their zoom hides them (id → opacity, absent = 1); not structure. */
  markFade: Record<string, number>
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
    sameStrings(a.bellIds, b.bellIds) && sameRecord(a.bellFolded, b.bellFolded) && sameRecord(a.doneFolded, b.doneFolded) &&
    sameRecord(a.planFolded, b.planFolded) && sameRecord(a.marks, b.marks) &&
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
  /** Ring keys of the ringing alarms. */
  ringing: readonly string[]
  /** The alarm whose bell is selected (its tools show) or dragged. */
  selectedBell: string | null
  draggingBell: string | null
  widths: Readonly<Record<string, number>>
  /** Chips taller than CHIP_HEIGHT (useChipWidths heights). Absent = none. */
  heights?: Readonly<Record<string, number>>
  tunables: unknown
  /** How each group shows by zoom (settings), by group key. */
  groupVisibility: Readonly<Record<string, Visibility>>
  laneCount: number
  /** Endpoints of the selected or focused span: shown even when hidden. Absent = none. */
  revealIds?: readonly string[]
  /** The spans (an instant reaches further when it ends a long span: domain/reach). Absent = none. */
  spans?: readonly SpanRecord[]
  /** Todos' plans (domain/todos plannedBlocks): close to their start they fold into their `at` chips. Absent = none. */
  plans?: readonly TimeBlock[]
}

type FrameLike = Pick<Frame, 'now' | 'pos' | 'start' | 'end' | 'pxPerMs' | 'mainSize' | 'crossSize'>

interface CacheEntry {
  inputs: SavedLayoutInputs
  visible: InstantRecord[]
  upcoming: boolean[]
  /** The bells drawn and folded, as one string ("id,id|instant:n"). */
  bells: string
  pxPerMs: number
  crossSize: number
  result: SavedLayout
}

/** The longest span each instant ends, per inputs (they change only when the data does). */
const longestCache = new WeakMap<SavedLayoutInputs, Map<string, number>>()
function longestSpansOf(c: SavedLayoutInputs): Map<string, number> {
  let m = longestCache.get(c)
  if (!m) {
    const ts = new Map(c.instants.map(i => [i.id, i.tsEpochMs]))
    m = longestSpans(c.spans ?? [], id => ts.get(id))
    longestCache.set(c, m)
  }
  return m
}

/**
 * The layout as a function of the frame, memoized. Positions are taken relative to the
 * earliest visible instant, so a pure pan changes nothing the layout reads: the cache key
 * is the visible set (and which alarms are still upcoming), the bells drawn and folded, zoom
 * (within ZOOM_REUSE), cross size and the inputs. A moving instant rides the screen center,
 * which a pan does move relative to the others, and a dragged bell the pointer, so those skip the cache.
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
    // Every instant's stage at this zoom (domain/displayGroups): Label (its chip), Mark (a line from
    // the axis, no chip) or Hidden, by its own visibility, else its group's, else its reach
    // (domain/reach). Ringing ones keep their labels.
    const visibleMs = f.end - f.start
    const ringingInstants = new Set(c.ringing.map(k => parseRingKey(k).instantId))
    const longest = longestSpansOf(c)
    const unnamedReachMs = getTunables().unnamedReachHours * HOUR
    const visibilityOf = (i: InstantRecord): Visibility => {
      const g = recurringGroupOf(i)
      const group = g ? groupVisibility(g, c.groupVisibility) : null
      return instantVisibility(i, { now: f.now, countdown: !!i.favorite || hasArmedAlarm(i, f.now), longestSpanMs: longest.get(i.id) ?? 0, unnamedReachMs, group })
    }
    const stageOf = (i: InstantRecord): Stage => (ringingInstants.has(i.id) ? 'label' : stageAt(visibilityOf(i), visibleMs))
    const zoomHidden = (i: InstantRecord) => stageOf(i) === 'hidden'
    const isVisible = (i: InstantRecord) =>
      i.id === c.selected || i.id === c.secondary || i.id === c.focusedInstantId || i.id === c.editing || i.id === c.moving ||
      ((!i.hidden || revealed(i)) && i.tsEpochMs >= lo && i.tsEpochMs <= hi && !zoomHidden(i))
    const prev = cache
    const ringingKeys = new Set(c.ringing)
    const drag = c.draggingBell ? bellDragAt() : null
    const revealPast = new Set([c.selected, c.mode === 'instant' ? c.focusedInstantId : null].filter((x): x is string => !!x))
    const bells = bellsToShow(c.instants, {
      now: f.now, pos: f.pos, lo, hi, ringingKeys, revealPast,
      collapsePx: getTunables().bellCollapsePx,
      dragging: drag && drag.alarmId === c.draggingBell ? drag : null,
    })
    const bellKey = `${bells.shown.map(b => b.alarm.id).join(',')}|${Object.entries(bells.folded).map(([k, n]) => `${k}:${n}`).join(',')}`

    // Cheap probe: walk the instants once against the cached visible set, allocating nothing.
    // A zoom step too small to matter (the tail of zoom smoothing) reuses the layout too: chips
    // glide to their spots anyway, so being off by a pixel or two for a frame doesn't show.
    if (prev && prev.inputs === c && c.moving === null && !c.draggingBell && prev.bells === bellKey && Math.abs(f.pxPerMs / prev.pxPerMs - 1) < ZOOM_REUSE && prev.crossSize === f.crossSize) {
      let n = 0
      let same = true
      for (const i of c.instants) {
        if (!isVisible(i)) continue
        if (prev.visible[n] !== i || prev.upcoming[n] !== hasArmedAlarm(i, f.now)) { same = false; break }
        n++
      }
      if (same && n === prev.visible.length) return prev.result
    }

    layoutStats.runs++
    const visible = c.instants.filter(isVisible)
    const origin = visible.reduce((m, i) => Math.min(m, i.tsEpochMs), Infinity)
    const originPos = Number.isFinite(origin) ? f.pos(origin) : 0
    const vertical = c.orientation === 'vertical'
    const t = getTunables()
    const ringingIds = new Set(c.ringing.map(k => parseRingKey(k).instantId))
    const worked = new Set([c.selected, c.secondary, c.mode === 'instant' ? c.focusedInstantId : null, c.editing, c.moving].filter(Boolean))
    // Marks: past its Label zoom an instant is a line from the axis, no chip; it fades out before
    // it is Hidden. What you are working with keeps its label. Crowded labels become marks too
    // (the overlap layout's `marked`), rather than sliding far from their lines.
    const marks: Record<string, true> = {}
    const fades: Record<string, number> = {}
    for (const i of visible) {
      if (worked.has(i.id) || ringingIds.has(i.id)) continue
      const v = visibilityOf(i)
      if (stageAt(v, visibleMs) !== 'mark') continue
      marks[i.id] = true
      const fade = markFade(v, visibleMs)
      if (fade < 1) fades[i.id] = Math.round(fade * 50) / 50
    }
    // A todo's ✓ close to its todo folds into its chip (as bells do): the ✓ draws as a mark (a
    // stub from the axis), its `at` chip says when ("✓ Feed cats · +12m"). Zoom in and it is back.
    const doneFolded = doneFolds(visible.filter(i => !marks[i.id]), f.pos, t.doneFoldPx, id => worked.has(id) || ringingIds.has(id))
    for (const d of Object.values(doneFolded)) marks[d] = true
    const items = layoutItems(visible.filter(i => !marks[i.id]), {
      now: f.now,
      pos: ts => f.pos(ts) - originPos,
      mainSize: f.mainSize,
      selectedId: c.selected,
      secondaryId: c.secondary,
      focusedId: c.mode === 'instant' ? c.focusedInstantId : null,
      editingId: c.editing,
      movingId: c.moving,
      ringingIds,
      selectedBell: c.selectedBell && !bells.shown.some(b => b.alarm.id === c.selectedBell) ? c.selectedBell : null,
      widths: c.widths,
      heights: c.heights,
      orientation: c.orientation,
    })
    // Bells before their instants share the chips' room. A live one is never hidden (pinned:
    // it always gets a place, never a "+N"); they sit next to the axis before ordinary chips.
    const shownIds = new Set(visible.map(i => i.id))
    const shownBells = bells.shown.filter(b => !marks[b.inst.id] && (shownIds.has(b.inst.id) || !zoomHidden(b.inst)))
    for (const b of shownBells) {
      items.push({
        id: bellItemId(b.alarm.id),
        pos: f.pos(b.ringTs) - originPos,
        ...bellExtent(vertical),
        priority: 3.5,
        pinned: true,
      })
    }
    const r = layoutLabels(items, {
      orientation: c.orientation,
      crossBudget: vertical ? verticalCrossBudget(f.crossSize, c.laneCount) : Infinity,
      slotGap: t.chipGapPx,
      maxSlots: vertical ? t.chipColumnsMax : t.chipRowsMax,
      cluster: vertical ? { mainExtent: CHIP_HEIGHT, crossExtent: CLUSTER_WIDTH } : { mainExtent: CLUSTER_WIDTH, crossExtent: CHIP_HEIGHT },
      foldBadgeExtent: FOLD_BADGE_WIDTH,
      maxShift: t.chipShiftMaxPx,
      lineInset: t.chipLineInsetPx,
      overflow: 'mark',
      // Ties go to the chip nearer Now (pan-invariant: positions are relative to the origin).
      centerPos: f.pos(f.now) - originPos,
    })
    // Crowded: no room for its chip, so a mark (its bells and ✓ fold with it).
    for (const id of r.marked) marks[id] = true
    const rows = Object.fromEntries(Object.entries(r.placed).map(([id, p]) => [id, p.slot]))
    const crossOffsets = Object.fromEntries(Object.entries(r.placed).map(([id, p]) => [id, p.crossOffset]))
    const shifts = Object.fromEntries(Object.entries(r.placed).filter(([, p]) => p.shift !== 0).map(([id, p]) => [id, Math.round(p.shift)]))
    // Rows in use: in horizontal, as many row pitches as the deepest box reaches (a chip being
    // named is taller: its time shows under it).
    const crossOf = new Map(items.map(it => [it.id, it.crossExtent]))
    const deepestEnd = Math.max(0, ...Object.entries(r.placed).map(([id, p]) => p.crossOffset + (crossOf.get(id) ?? CHIP_HEIGHT)),
      ...r.clusters.map(k => k.crossOffset + CHIP_HEIGHT))
    const deepest = vertical
      ? Math.max(-1, ...Object.values(rows), ...r.clusters.map(k => k.slot))
      : Math.ceil((deepestEnd + t.chipGapPx) / GEOMETRY.chipRow) - 1
    const next: SavedLayout = {
      visibleIds: visible.map(i => i.id),
      rows,
      crossOffsets,
      shifts,
      folded: r.folded,
      foldCount: r.foldCount,
      clusters: r.clusters.map(k => ({ id: k.id, memberIds: k.memberIds, slot: k.slot, crossOffset: k.crossOffset, shift: Math.round(k.shift), topPriority: k.topPriority })),
      bellIds: shownBells.filter(b => r.placed[bellItemId(b.alarm.id)]).sort((a, b) => a.ringTs - b.ringTs).map(b => b.alarm.id),
      bellFolded: Object.fromEntries(Object.entries(bells.folded).filter(([id]) => !marks[id])),
      doneFolded: Object.fromEntries(Object.entries(doneFolded).filter(([id]) => !marks[id])),
      // A plan close to its start (or any, in vertical) says its length in its todo's chip.
      planFolded: Object.fromEntries(Object.entries(planFolds(c.plans ?? [], f.pos, t.planFoldPx, vertical)).filter(([id]) => r.placed[id] && !marks[id])),
      marks,
      markFade: fades,
      rowsUsed: Math.max(1, deepest + 1),
    }
    // Keep the old object when nothing visible changed, so React skips the render. The fade isn't
    // structure (it is read per frame), so it is updated in place.
    const same = !!prev && layoutEqual(prev.result, next)
    if (same) prev.result.markFade = fades
    const result = same ? prev.result : next
    cache = {
      inputs: c,
      visible,
      upcoming: visible.map(i => hasArmedAlarm(i, f.now)),
      bells: bellKey,
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
  bellIds: string[]
  bellFolded: Record<string, string>
  doneFolded: Record<string, string>
  planFolded: Record<string, number>
  /** Instants shown as marks (they leave the chips, so the chips' change covers it). */
  marks: Record<string, true>
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
    sameStrings(a.bellIds, b.bellIds) && sameRecord(a.bellFolded, b.bellFolded) && sameRecord(a.doneFolded, b.doneFolded) &&
    sameRecord(a.planFolded, b.planFolded) && sameRecord(a.folded, b.folded) && sameRecord(a.foldCount, b.foldCount) &&
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
  bellIds: l.bellIds,
  bellFolded: l.bellFolded,
  doneFolded: l.doneFolded,
  planFolded: l.planFolded,
  marks: l.marks,
  rowsUsed: l.rowsUsed,
})

export const EMPTY_LAYOUT: SavedLayout = { visibleIds: [], rows: {}, crossOffsets: {}, shifts: {}, folded: {}, foldCount: {}, clusters: [], bellIds: [], bellFolded: {}, doneFolded: {}, planFolded: {}, marks: {}, markFade: {}, rowsUsed: 1 }

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
  const result = keepClearOfPlus(f, inputs, source.compute(f, inputs))
  source.last = { f, inputs, result }
  return result
}

const drawnIndex = new WeakMap<readonly string[], ReadonlySet<string>>()
/** The instants whose lines are drawn this frame (a Label or a Mark), or null with no timeline mounted. */
export function drawnIdsAt(f: FrameLike): ReadonlySet<string> | null {
  if (!source.inputs) return null
  const ids = savedLayoutAt(f).visibleIds
  let set = drawnIndex.get(ids)
  if (!set) drawnIndex.set(ids, set = new Set(ids))
  return set
}
setDrawnSource(drawnIdsAt)

// ---------------------------------------------------------------------------
// The Cursor ＋ is an obstacle: it never moves, so chips in its row (column) are pushed along
// the time axis out of its way, each pushing the next on (domain/pushClear). Applied per frame
// on top of the layout, so the layout itself (and its cache) doesn't depend on the pan; chips
// glide there on their springs (chipPlacement.ts). The chip the cursor is on takes the ＋ in
// instead (plusMorph.ts), so while the ＋ is in or flowing into a chip there is no obstacle.

/** The ＋ (.tl-tag__drop): 30px, starting this far from the first chip row (column) across the axis. */
const PLUS_SIZE = 30
const PLUS_ACROSS = { horizontal: GEOMETRY.tagArrow + 5 - (GEOMETRY.chipTop - GEOMETRY.axis), vertical: GEOMETRY_VERTICAL.tagArrow + 5 - (GEOMETRY_VERTICAL.chipStart - GEOMETRY_VERTICAL.axis) }

let plusOut: (f: FrameLike) => boolean = () => false
/** plusMorph says whether the ＋ is out (drawn on the cursor line), per frame. */
export function setPlusObstacle(isOut: (f: FrameLike) => boolean) { plusOut = isOut }

function keepClearOfPlus(f: FrameLike, c: SavedLayoutInputs, l: SavedLayout): SavedLayout {
  if (l.visibleIds.length === 0 || !plusOut(f)) return l
  const vertical = c.orientation === 'vertical'
  const across = PLUS_ACROSS[vertical ? 'vertical' : 'horizontal']
  const inBand = (offset: number, extent: number) => offset < across + PLUS_SIZE && offset + extent > across
  const cursor = f.mainSize / 2
  const byId = new Map(c.instants.map(i => [i.id, i]))
  const boxes: PushBox[] = []
  for (const id of l.visibleIds) {
    const offset = l.crossOffsets[id]
    const inst = byId.get(id)
    if (offset === undefined || !inst) continue
    const w = c.widths[id] ?? estimateChipWidth(inst.label)
    const { tail, below, toolsWidth } = chipToolsExtent(inst, {
      selected: c.selected === id, focused: c.mode === 'instant' && c.focusedInstantId === id,
      moving: c.moving === id, editing: c.editing === id, now: f.now, vertical, selectedBell: c.selectedBell,
    })
    const h = c.heights?.[id] ?? CHIP_HEIGHT
    if (!inBand(offset, vertical ? Math.max(w, toolsWidth) : h)) continue
    const at = (c.moving === id ? cursor : f.pos(inst.tsEpochMs)) + (l.shifts[id] ?? 0)
    const half = vertical ? h / 2 : (Math.max(w, below > 0 ? toolsWidth : 0) + (l.foldCount[id] ? FOLD_BADGE_WIDTH : 0)) / 2
    boxes.push({ id, at, lo: at - half, hi: at + half + tail })
  }
  for (const k of l.clusters) {
    if (!inBand(k.crossOffset, vertical ? CLUSTER_WIDTH : CHIP_HEIGHT)) continue
    const ps = k.memberIds.map(id => byId.get(id)).filter((i): i is InstantRecord => !!i).map(i => f.pos(i.tsEpochMs))
    if (ps.length === 0) continue
    const at = ps.reduce((a, b) => a + b, 0) / ps.length + k.shift
    const half = (vertical ? CHIP_HEIGHT : CLUSTER_WIDTH) / 2
    boxes.push({ id: `cluster:${k.id}`, at, lo: at - half, hi: at + half })
  }
  const pushed = pushClear(boxes, { lo: cursor - PLUS_SIZE / 2, hi: cursor + PLUS_SIZE / 2 }, getTunables().chipGapPx)
  if (Object.keys(pushed).length === 0) return l
  const shifts = { ...l.shifts }
  for (const [id, d] of Object.entries(pushed)) if (!id.startsWith('cluster:')) shifts[id] = Math.round((shifts[id] ?? 0) + d)
  const clusters = l.clusters.map(k => (pushed[`cluster:${k.id}`] ? { ...k, shift: Math.round(k.shift + pushed[`cluster:${k.id}`]) } : k))
  return { ...l, shifts, clusters }
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
  const instants = useTimelineInstants()
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
  // Todos' plans: what changes them is the data, not the clock (as the lanes' plans: useBottomLanes).
  const todos = useEntities(s => s.todos)
  const plans = useMemo(() => (todos?.length ? plannedBlocks(todos, instantsByTodo(instants), Date.now()) : undefined), [todos, instants])
  const revealIds = useMemo(() => spans
    .filter(sp => spanIds.includes(sp.id))
    .flatMap(sp => [sp.startInstantId, sp.endInstantId]), [spans, spanIds])
  const ringing = useAlarms(useShallow(s => s.ringing.map(r => ringKey(r.instantId, r.alarmId))))
  const bellUi = useUi(useShallow(s => ({ selectedBell: s.selectedBell, draggingBell: s.draggingBell })))
  const widths = useChipWidths(s => s.widths)
  const heights = useChipWidths(s => s.heights)
  const tunables = useSettings(s => s.tunables) // tunable changes re-run the layout
  const groupVisibility = useSettings(s => s.groupVisibility) // so do the groups' visibility
  useEffect(() => { useChipWidths.getState().prune(new Set(instants.map(i => i.id))) }, [instants])
  const inputs = useMemo<SavedLayoutInputs>(
    () => ({ orientation, dir, instants, ...v, ringing, ...bellUi, widths, heights, tunables, groupVisibility, laneCount, revealIds, spans, plans }),
    [orientation, dir, instants, v, ringing, bellUi, widths, heights, tunables, groupVisibility, laneCount, revealIds, spans, plans],
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
