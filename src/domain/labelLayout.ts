// Overlap layout for timeline chips (spec 5.7). Pure: positions in, placements out.
//
// "Main" is the time axis and "cross" the axis across it (rows below a horizontal
// timeline, columns beside a vertical one). Each chip is a box centered on its
// marker's main-axis position; the layout picks how far from the axis it sits.
//
//   1. Snoozes that collide with their original (or with each other) fold into
//      one chip, which gets a "⟲N" badge.
//   2. Chips are placed greedily, most important first, at the nearest free
//      cross offset within the slot limit and the cross budget.
//   3. Chips that don't fit collapse into "+N" clusters. A cluster with no room
//      takes the place of the least important chip it overlaps, absorbing it.
//
// Nothing disappears: every item ends up placed, folded or in a cluster, and
// markers are always drawn whatever happens to their chips.

export interface LabelItem {
  id: string
  /** Main-axis position of the marker, px. */
  pos: number
  /** Chip size along the time axis (its width in horizontal, height in vertical). */
  mainExtent: number
  /** Chip size across the time axis. */
  crossExtent: number
  /** Lower is more important. */
  priority: number
  /** Snooze group: the id of the original alarm. */
  groupId?: string
  /** Pinned chips (focused, selected, ringing, editing, moving) always get a place. */
  pinned: boolean
}

export interface LabelLayoutOptions {
  orientation: 'horizontal' | 'vertical'
  /** Room across the axis, px (Infinity when slots are the only limit). */
  crossBudget: number
  /** Gap between neighbouring chips across the axis, px. */
  slotGap: number
  /** Most chips stacked at one time position (rows or columns). */
  maxSlots: number
  /** Main-axis position of the screen center; breaks priority ties. Omitted: ties go to the earlier chip, so a pan never reorders them. */
  centerPos?: number
  /** Size of a "+N" cluster chip. */
  cluster: { mainExtent: number; crossExtent: number }
  /** How much a "⟲N" badge widens a chip, px. */
  foldBadgeExtent: number
}

export interface LabelPlacement {
  /** 0 next to the axis; n = n chips stacked between this one and the axis. */
  slot: number
  /** Distance from the axis, px. */
  crossOffset: number
}

export interface LabelCluster {
  id: string
  /** Members in time order. */
  memberIds: string[]
  /** Main-axis position of the cluster chip, px. */
  pos: number
  slot: number
  crossOffset: number
  /** Priority of the most important member, for the chip's color. */
  topPriority: number
}

export interface LabelLayoutResult {
  placed: Record<string, LabelPlacement>
  /** Folded snooze id → id of the chip that shows it. */
  folded: Record<string, string>
  /** Chip id → how many snoozes it shows. */
  foldCount: Record<string, number>
  /** In time order. */
  clusters: LabelCluster[]
}

interface Box {
  kind: 'chip' | 'cluster'
  id: string
  lo: number
  hi: number
  crossStart: number
  crossEnd: number
  slot: number
  priority: number
  pinned: boolean
  pos: number
}

/** Tie-break: nearer the center, or (no center) earlier in time, so panning never reorders chips. */
const nearer = (centerPos: number | undefined) => (a: { pos: number }, b: { pos: number }) =>
  centerPos === undefined ? a.pos - b.pos : Math.abs(a.pos - centerPos) - Math.abs(b.pos - centerPos)

const byImportance = (centerPos: number | undefined) => (a: LabelItem, b: LabelItem) =>
  Number(b.pinned) - Number(a.pinned) ||
  a.priority - b.priority ||
  nearer(centerPos)(a, b) ||
  compareIds(a.id, b.id)

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const byPos = (a: LabelItem, b: LabelItem) => a.pos - b.pos || compareIds(a.id, b.id)

const mainOverlap = (aLo: number, aHi: number, bLo: number, bHi: number) => aLo < bHi && bLo < aHi

export function layoutLabels(items: readonly LabelItem[], o: LabelLayoutOptions): LabelLayoutResult {
  const importance = byImportance(o.centerPos)
  const byId = new Map(items.map(i => [i.id, i]))

  // --- 1. Fold snooze groups -------------------------------------------------
  const folded: Record<string, string> = {}
  const foldCount: Record<string, number> = {}
  const groups = new Map<string, LabelItem[]>()
  for (const it of items) {
    if (!it.groupId || it.groupId === it.id) continue
    const members = groups.get(it.groupId) ?? []
    members.push(it)
    groups.set(it.groupId, members)
  }
  for (const groupId of [...groups.keys()].sort(compareIds)) {
    const members = groups.get(groupId)!
    // The original carries the group; without it, the most important snooze does.
    const anchor = byId.get(groupId) ?? [...members].sort(importance)[0]
    const covered = [anchor]
    let changed = true
    while (changed) {
      changed = false
      for (const m of [...members].sort(byPos)) {
        if (m === anchor || m.pinned || folded[m.id]) continue
        const touches = covered.some(c => mainOverlap(m.pos - m.mainExtent / 2, m.pos + m.mainExtent / 2, c.pos - c.mainExtent / 2, c.pos + c.mainExtent / 2))
        if (!touches) continue
        folded[m.id] = anchor.id
        foldCount[anchor.id] = (foldCount[anchor.id] ?? 0) + 1
        covered.push(m)
        changed = true
      }
    }
  }

  // A badge widens the chip: along the time axis in horizontal, across it in vertical.
  const extents = (it: LabelItem) => {
    const badge = foldCount[it.id] ? o.foldBadgeExtent : 0
    return o.orientation === 'horizontal'
      ? { main: it.mainExtent + badge, cross: it.crossExtent }
      : { main: it.mainExtent, cross: it.crossExtent + badge }
  }

  // --- 2. Place chips ----------------------------------------------------------
  const boxes: Box[] = []

  /** First free cross offset for a box at [lo, hi], or null. `strict` applies the slot and budget limits. */
  const findSpot = (lo: number, hi: number, cross: number, strict: boolean): { offset: number; slot: number } | null => {
    const blockers = boxes.filter(b => mainOverlap(lo, hi, b.lo, b.hi))
    const offsets = [...new Set([0, ...blockers.map(b => b.crossEnd + o.slotGap)])].sort((a, b) => a - b)
    for (const offset of offsets) {
      const end = offset + cross
      if (blockers.some(b => b.crossStart < end && offset < b.crossEnd)) continue
      const inner = blockers.filter(b => b.crossEnd <= offset)
      const slot = inner.length === 0 ? 0 : Math.max(...inner.map(b => b.slot)) + 1
      if (strict && (slot >= o.maxSlots || end > o.crossBudget)) continue
      return { offset, slot }
    }
    return null
  }

  const unplaced: LabelItem[] = []
  for (const it of items.filter(i => !folded[i.id]).sort(importance)) {
    const { main, cross } = extents(it)
    const lo = it.pos - main / 2
    const hi = it.pos + main / 2
    const spot = findSpot(lo, hi, cross, !it.pinned)
    if (!spot) {
      unplaced.push(it)
      continue
    }
    boxes.push({ kind: 'chip', id: it.id, lo, hi, crossStart: spot.offset, crossEnd: spot.offset + cross, slot: spot.slot, priority: it.priority, pinned: it.pinned, pos: it.pos })
  }

  // --- 3. Collapse the rest into clusters ---------------------------------------
  // Sweep in time order; neighbours whose chips overlap (within a gap) share a cluster.
  const runs: LabelItem[][] = []
  let runEnd = -Infinity
  for (const it of [...unplaced].sort(byPos)) {
    const { main } = extents(it)
    const lo = it.pos - main / 2
    const hi = it.pos + main / 2
    const run = runs[runs.length - 1]
    if (run && lo < runEnd + o.slotGap) {
      run.push(it)
      runEnd = Math.max(runEnd, hi)
    } else {
      runs.push([it])
      runEnd = hi
    }
  }

  const clusters: LabelCluster[] = []
  for (const run of runs) {
    const memberIds = new Set<string>()
    // An anchor in a cluster brings its folded snoozes along.
    const absorb = (id: string) => {
      memberIds.add(id)
      for (const [snooze, anchor] of Object.entries(folded)) {
        if (anchor !== id) continue
        memberIds.add(snooze)
        delete folded[snooze]
      }
      delete foldCount[id]
    }
    run.forEach(it => absorb(it.id))

    const pos = run.reduce((sum, it) => sum + it.pos, 0) / run.length
    const lo = pos - o.cluster.mainExtent / 2
    const hi = pos + o.cluster.mainExtent / 2
    let spot = findSpot(lo, hi, o.cluster.crossExtent, true)
    while (!spot) {
      // No room: take over the least important chip under the cluster.
      const victims = boxes
        .filter(b => !b.pinned && mainOverlap(lo, hi, b.lo, b.hi))
        .sort((a, b) => b.priority - a.priority || nearer(o.centerPos)(b, a) || compareIds(a.id, b.id))
      if (victims.length === 0) break
      boxes.splice(boxes.indexOf(victims[0]), 1)
      absorb(victims[0].id)
      spot = findSpot(lo, hi, o.cluster.crossExtent, true)
    }
    // Only pinned chips left in the way: overflow rather than hide the cluster. Without
    // limits a spot always exists (past the outermost blocker).
    spot ??= findSpot(lo, hi, o.cluster.crossExtent, false)!
    const id = `cluster:${run[0].id}`
    boxes.push({ kind: 'cluster', id, lo, hi, crossStart: spot.offset, crossEnd: spot.offset + o.cluster.crossExtent, slot: spot.slot, priority: Infinity, pinned: true, pos })

    const members = [...memberIds].map(m => byId.get(m)!).sort(byPos)
    clusters.push({
      id,
      memberIds: members.map(m => m.id),
      pos,
      slot: spot.slot,
      crossOffset: spot.offset,
      topPriority: Math.min(...members.map(m => m.priority)),
    })
  }

  const placed: Record<string, LabelPlacement> = {}
  for (const b of boxes) {
    if (b.kind === 'chip') placed[b.id] = { slot: b.slot, crossOffset: b.crossStart }
  }
  return { placed, folded, foldCount, clusters }
}
