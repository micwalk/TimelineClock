// Overlap layout for the saved-instant chips: builds layout inputs from the visible
// instants and chip widths, and exposes the structural result to React.
import { useLayoutEffect } from 'react'
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
import { useAlarms } from '../../store/alarms.ts'
import { getTunables, useSettings } from '../../store/settings.ts'

/** Chips extend past the line; keep markers mounted this far off screen. */
export const CULL_MARGIN_PX = 400

export const CHIP_HEIGHT = 28
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
}

export const useChipWidths = create<ChipWidthsState>(set => ({
  widths: {},
  setWidth: (id, width) => set(s => (s.widths[id] === width ? s : { widths: { ...s.widths, [id]: width } })),
}))

/**
 * Reports the element's width into the widths store. Entries outlive the element: a
 * chip that folds or clusters unmounts, and the layout must still know how wide it was.
 */
export function useChipWidth(ref: RefObject<HTMLElement | null>, id: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const report = () => {
      const w = Math.ceil(el.getBoundingClientRect().width)
      if (w > 0) useChipWidths.getState().setWidth(id, w)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
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
  /** Set only while the view is focused on that instant. */
  focusedId: string | null
  editingId: string | null
  movingId: string | null
  ringingIds: ReadonlySet<string>
  widths: Readonly<Record<string, number>>
}

/** Layout items for the given instants. Priority: focused 0, selected 1, moving/editing 2, ringing 3, upcoming alarm 4, favorite 5, other 6. */
export function layoutItems(instants: readonly InstantRecord[], c: LayoutContext): LabelItem[] {
  return instants.map(i => {
    const focused = c.focusedId === i.id
    const selected = c.selectedId === i.id
    const moving = c.movingId === i.id
    const editing = c.editingId === i.id
    const ringing = c.ringingIds.has(i.id)
    const priority = focused ? 0 : selected ? 1 : moving || editing ? 2 : ringing ? 3
      : i.alarm && i.tsEpochMs > c.now ? 4 : i.favorite ? 5 : 6
    return {
      id: i.id,
      // A moving instant follows the cursor at the center of the view.
      pos: moving ? c.mainSize / 2 : c.pos(i.tsEpochMs),
      mainExtent: c.widths[i.id] ?? estimateChipWidth(i.label),
      crossExtent: CHIP_HEIGHT,
      priority,
      ...(i.snoozeOriginalId ? { groupId: i.snoozeOriginalId } : {}),
      pinned: focused || selected || moving || editing || ringing,
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
  topPriority: number
}

export interface SavedLayout {
  visibleIds: string[]
  /** Chip row (0 = next to the axis) of every chip that is shown. */
  rows: Record<string, number>
  /** Folded snooze id → the chip showing it. */
  folded: Record<string, string>
  /** Chip id → snoozes it shows. */
  foldCount: Record<string, number>
  clusters: ClusterInfo[]
  /** Rows the chips occupy, at least 1. */
  rowsUsed: number
}

const layoutEqual = (a: SavedLayout, b: SavedLayout) => JSON.stringify(a) === JSON.stringify(b)

export function useSavedLayout(): SavedLayout {
  const instants = useEntities(s => s.instants)
  const v = useView(useShallow(s => ({
    mode: s.viewFocusMode,
    focusedInstantId: s.focusedInstantId,
    selected: s.currentSelectedInstantId,
    secondary: s.secondarySelectedInstantId,
    editing: s.editingInstantId,
    moving: s.moveMode?.instantId ?? null,
  })))
  const ringingList = useAlarms(useShallow(s => s.ringing.map(r => r.instantId)))
  const widths = useChipWidths(s => s.widths)
  useSettings(s => s.tunables) // tunable changes re-run the layout

  return useFrameValue((f: Frame): SavedLayout => {
    const keep = new Set([v.selected, v.secondary, v.focusedInstantId, v.editing, v.moving].filter(Boolean) as string[])
    const margin = CULL_MARGIN_PX / f.pxPerMs
    const lo = f.start - margin
    const hi = f.end + margin
    const visible = instants.filter(i => keep.has(i.id) || (i.tsEpochMs >= lo && i.tsEpochMs <= hi))
    const items = layoutItems(visible, {
      now: f.now,
      pos: f.pos,
      mainSize: f.mainSize,
      selectedId: v.selected,
      focusedId: v.mode === 'instant' ? v.focusedInstantId : null,
      editingId: v.editing,
      movingId: v.moving,
      ringingIds: new Set(ringingList),
      widths,
    })
    const t = getTunables()
    const r = layoutLabels(items, {
      orientation: 'horizontal', // vertical chips arrive with the vertical layout
      crossBudget: Infinity,
      slotGap: t.chipGapPx,
      maxSlots: t.chipRowsMax,
      cluster: { mainExtent: CLUSTER_WIDTH, crossExtent: CHIP_HEIGHT },
      foldBadgeExtent: FOLD_BADGE_WIDTH,
    })
    const rows = Object.fromEntries(Object.entries(r.placed).map(([id, p]) => [id, p.slot]))
    const deepest = Math.max(-1, ...Object.values(rows), ...r.clusters.map(c => c.slot))
    return {
      visibleIds: visible.map(i => i.id),
      rows,
      folded: r.folded,
      foldCount: r.foldCount,
      clusters: r.clusters.map(c => ({ id: c.id, memberIds: c.memberIds, slot: c.slot, crossOffset: c.crossOffset, topPriority: c.topPriority })),
      rowsUsed: Math.max(1, deepest + 1),
    }
  }, layoutEqual)
}
