// Span names that crowd a track fold into one "N spans" label (like "+N" for instants). Pure.
//
// Each label belongs to a track (a lane slot: spans on one track never overlap in time, but
// their names can) and wants to sit at a spot along the time axis (its span's middle). Labels
// on a track whose boxes would touch merge into a group label at their members' mean spot;
// a group that then touches a neighbour takes it in too. Pinned labels (a selected or focused
// span, with its tools) always show where they want to be; the others move off them.

export interface TrackLabel {
  key: string
  /** Labels only collide with labels on the same track. */
  track: number
  /** Where its center wants to be along the time axis, px. */
  want: number
  /** Its length along the time axis, px. */
  size: number
  pinned?: boolean
}

export interface LabelGroup {
  /** Stable while its first member stays first. */
  key: string
  track: number
  /** Member keys, in time order. */
  members: string[]
  /** Center along the time axis, px. */
  center: number
}

export interface TrackLabelLayout {
  /** Labels shown on their own: key → center, px. */
  shown: Record<string, number>
  groups: LabelGroup[]
}

interface Unit { members: TrackLabel[]; center: number; size: number }

const lo = (u: { center: number; size: number }) => u.center - u.size / 2
const hi = (u: { center: number; size: number }) => u.center + u.size / 2
const mean = (xs: readonly TrackLabel[]) => xs.reduce((s, x) => s + x.want, 0) / xs.length

/** `gap`: least room between labels, px; `groupSize`: a group label's length, px. */
export function groupTrackLabels(items: readonly TrackLabel[], o: { gap: number; groupSize: number }): TrackLabelLayout {
  const shown: Record<string, number> = {}
  const groups: LabelGroup[] = []
  const tracks = [...new Set(items.map(i => i.track))].sort((a, b) => a - b)
  for (const track of tracks) {
    const on = items.filter(i => i.track === track)
    const pinned = on.filter(i => i.pinned)
    for (const p of pinned) shown[p.key] = p.want
    const obstacles = pinned.map(p => ({ center: p.want, size: p.size }))
    let units: Unit[] = on.filter(i => !i.pinned).map(i => ({ members: [i], center: i.want, size: i.size }))
    const group = (members: TrackLabel[]): Unit => ({ members, center: mean(members), size: o.groupSize })
    // Each pass merges two units, so it ends; the cap is a guard.
    for (let pass = 0; pass <= on.length; pass++) {
      // Off the pinned labels, to whichever side is nearer.
      for (const u of units) {
        for (const ob of obstacles) {
          if (lo(u) >= hi(ob) + o.gap || hi(u) <= lo(ob) - o.gap) continue
          const before = lo(ob) - o.gap - u.size / 2
          const after = hi(ob) + o.gap + u.size / 2
          u.center = Math.abs(before - u.center) <= Math.abs(after - u.center) ? before : after
        }
      }
      units.sort((a, b) => a.center - b.center)
      const k = units.findIndex((u, i) => i + 1 < units.length && hi(u) + o.gap > lo(units[i + 1]))
      if (k < 0) break
      const merged = group([...units[k].members, ...units[k + 1].members].sort((a, b) => a.want - b.want))
      units = [...units.slice(0, k), merged, ...units.slice(k + 2)]
    }
    for (const u of units) {
      if (u.members.length === 1) shown[u.members[0].key] = u.center
      else groups.push({ key: `group:${u.members[0].key}`, track, members: u.members.map(m => m.key), center: u.center })
    }
  }
  return { shown, groups }
}

/** Same groups with the same members (where they sit aside), for re-rendering only on change. */
export const sameLabelGroups = (a: readonly LabelGroup[], b: readonly LabelGroup[]): boolean =>
  a.length === b.length && a.every((g, k) => g.key === b[k].key && g.track === b[k].track &&
    g.members.length === b[k].members.length && g.members.every((m, i) => m === b[k].members[i]))
