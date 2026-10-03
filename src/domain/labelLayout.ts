export interface LabelItem {
  id: string
  pos: number
  mainExtent: number
  crossExtent: number
  priority: number
  groupId?: string
  pinned: boolean
}

export interface LabelLayoutOptions {
  orientation: 'horizontal' | 'vertical'
  crossBudget: number
  slotGap: number
  maxSlots: number
  centerPos: number
}

export interface LabelCluster {
  id: string
  memberIds: string[]
  pos: number
  accentPriority: number
}

export interface LabelPlacement {
  slot: number
  crossOffset: number
}

export interface LabelLayoutResult {
  placed: Record<string, LabelPlacement>
  folded: Record<string, string>
  clusters: LabelCluster[]
  foldCount: Record<string, number>
}

interface Box {
  lo: number
  hi: number
  cross: number
  crossEnd: number
}

export function layoutLabels(items: LabelItem[], o: LabelLayoutOptions): LabelLayoutResult {
  const order = [...items].sort(
    (a, b) =>
      a.priority - b.priority ||
      Math.abs(a.pos - o.centerPos) - Math.abs(b.pos - o.centerPos) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const boxes: Box[] = []
  const placed: Record<string, LabelPlacement> = {}
  const unplaced: LabelItem[] = []
  const horiz = o.orientation === 'horizontal'

  for (const item of order) {
    const lo = item.pos - item.mainExtent / 2
    const hi = item.pos + item.mainExtent / 2
    const blockers = boxes.filter((b) => b.lo < hi && lo < b.hi)
    const step = item.crossExtent + o.slotGap
    let cands: number[]
    if (horiz) {
      cands = []
      for (let k = 0; k < Math.max(o.maxSlots, blockers.length + 1); k++) cands.push(k * step)
    } else {
      cands = [0, ...blockers.map((b) => b.crossEnd + o.slotGap)].sort((a, b) => a - b)
    }
    let chosen: number | null = null
    let chosenSlot = 0
    for (const c of cands) {
      const end = c + item.crossExtent
      if (blockers.some((b) => b.cross < end && c < b.crossEnd)) continue
      const slot = horiz ? Math.round(c / step) : blockers.filter((b) => b.crossEnd <= c).length
      if (!item.pinned) {
        if (slot >= o.maxSlots) continue
        if (!horiz && end > o.crossBudget) continue
      }
      chosen = c
      chosenSlot = slot
      break
    }
    if (chosen === null) {
      unplaced.push(item)
      continue
    }
    boxes.push({ lo, hi, cross: chosen, crossEnd: chosen + item.crossExtent })
    placed[item.id] = { slot: chosenSlot, crossOffset: chosen }
  }

  const folded: Record<string, string> = {}
  const foldCount: Record<string, number> = {}
  const rest: LabelItem[] = []
  for (const u of unplaced) {
    if (u.groupId && u.groupId !== u.id && placed[u.groupId]) {
      folded[u.id] = u.groupId
      foldCount[u.groupId] = (foldCount[u.groupId] ?? 0) + 1
    } else rest.push(u)
  }

  const acc: { members: LabelItem[]; pos: number }[] = []
  for (const u of rest) {
    const c = acc.find((x) => Math.abs(x.pos - u.pos) <= u.mainExtent)
    if (c) {
      c.members.push(u)
      c.pos = c.members.reduce((s, m) => s + m.pos, 0) / c.members.length
    } else acc.push({ members: [u], pos: u.pos })
  }
  const clusters: LabelCluster[] = acc.map((c) => ({
    id: `cluster:${c.members[0].id}`,
    memberIds: c.members.map((m) => m.id),
    pos: c.pos,
    accentPriority: Math.min(...c.members.map((m) => m.priority)),
  }))
  return { placed, folded, clusters, foldCount }
}
