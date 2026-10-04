// Vertical layout: a box at the Now line for each saved span that contains Now (a running
// timer, a span you're in), against its bar on the right, showing the span's name and the
// time left (the original length small). One frame listener places all of them so they
// never overlap (domain/nowFlags).
import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatDurationHMS, formatDurationShort, truncateText } from '../../domain/format.ts'
import { resolveTimeRef, spanGeometry } from '../../domain/spans.ts'
import { layoutNowFlags } from '../../domain/nowFlags.ts'
import type { FlagItem, Interval } from '../../domain/nowFlags.ts'
import { useView } from '../../store/view.ts'
import { useEntities } from '../../store/entities.ts'
import type { SavedLayout } from './savedLayout.ts'
import { CHIP_HEIGHT, CLUSTER_WIDTH, estimateChipWidth, useChipWidths } from './savedLayout.ts'
import { GEOMETRY_VERTICAL } from './geometry.ts'
import * as act from '../../store/actions.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, laneHasControls, savedLaneVariant } from './useBottomLanes.ts'

/** A flag's height and the gap kept around it, px. */
const FLAG_SIZE = 26
const FLAG_GAP = 4
/** A span chip already drawn on a lane (lanes with controls), which flags keep clear of. */
const LANE_CHIP_SIZE = 30
const NAME_MAX = 10
/** A flag's width before it has been measured, px. */
const FLAG_WIDTH_GUESS = 150
/** Lanes sit this far in from the right edge (matches .tl-lane in vertical). */
const LANE_EDGE = 12

type SavedLane = Extract<BottomLane, { kind: 'saved' }>

export function NowFlags({ lanes, layout }: { lanes: BottomLane[]; layout: SavedLayout }) {
  const selectedSpanId = useView(s => s.selectedSpanId)
  const moving = useView(s => s.moveMode?.instantId ?? null)
  const instants = useEntities(s => s.instants)
  const widths = useChipWidths(s => s.widths)
  const saved = lanes.filter((l): l is SavedLane => l.kind === 'saved' && !isLiveLane(l))
  const refs = useRef(new Map<string, HTMLDivElement>())
  const shown = useRef(new Map<string, number | null>())

  useFrameListener(f => {
    if (f.orientation !== 'vertical') return
    const nowPos = f.pos(f.now)
    const items: FlagItem[] = []
    const blockers: Interval[] = []
    // Saved chips (where the layout put them, slides included) and "+N" chips: flags keep off them.
    const byId = new Map(instants.map(i => [i.id, i]))
    const posOf = (id: string) => {
      const i = byId.get(id)
      return !i ? null : id === moving ? f.mainSize / 2 : f.pos(i.tsEpochMs)
    }
    for (const id of layout.visibleIds) {
      if (layout.rows[id] === undefined) continue
      const p = posOf(id)
      if (p === null) continue
      const c = p + (layout.shifts[id] ?? 0)
      const xlo = GEOMETRY_VERTICAL.chipStart + (layout.crossOffsets[id] ?? 0)
      blockers.push({ lo: c - CHIP_HEIGHT / 2, hi: c + CHIP_HEIGHT / 2, xlo, xhi: xlo + (widths[id] ?? estimateChipWidth(byId.get(id)?.label ?? '')) })
    }
    for (const k of layout.clusters) {
      const ps = k.memberIds.map(posOf).filter((p): p is number => p !== null)
      if (ps.length === 0) continue
      const c = ps.reduce((a, b) => a + b, 0) / ps.length
      const xlo = GEOMETRY_VERTICAL.chipStart + k.crossOffset
      blockers.push({ lo: c - CHIP_HEIGHT / 2, hi: c + CHIP_HEIGHT / 2, xlo, xhi: xlo + CLUSTER_WIDTH })
    }
    for (const lane of saved) {
      const pa = f.pos(resolveTimeRef(lane.a, f.now, f.center))
      const pb = f.pos(resolveTimeRef(lane.b, f.now, f.center))
      const g = spanGeometry(pa, pb, f.mainSize)
      if (!g.onScreen) continue
      if (laneHasControls(lane, selectedSpanId)) blockers.push({ lo: g.mid - LANE_CHIP_SIZE / 2, hi: g.mid + LANE_CHIP_SIZE / 2 })
      if (Math.min(pa, pb) <= nowPos && nowPos <= Math.max(pa, pb) && nowPos >= 0 && nowPos <= f.mainSize) {
        const laneX = f.crossSize - LANE_EDGE - lane.index * GEOMETRY_VERTICAL.laneGap
        const width = refs.current.get(lane.key)?.offsetWidth || FLAG_WIDTH_GUESS
        items.push({ key: lane.key, lo: g.left, hi: g.right, xlo: laneX - width, xhi: laneX })
      }
    }
    const placed = layoutNowFlags(items, nowPos, FLAG_SIZE, FLAG_GAP, blockers)
    for (const lane of saved) {
      const el = refs.current.get(lane.key)
      if (!el) continue
      const y = placed[lane.key] ?? null
      if (shown.current.get(lane.key) === y) continue
      shown.current.set(lane.key, y)
      el.style.display = y === null ? 'none' : ''
      if (y !== null) el.style.transform = `translate3d(-100%, ${y - FLAG_SIZE / 2}px, 0)`
    }
  })

  return (
    <>
      {saved.map(lane => {
        const r = lane.span
        const name = r.span.label
        // The later end is where the time left runs to.
        const end = (f: { now: number; center: number }) => Math.max(resolveTimeRef(lane.a, f.now, f.center), resolveTimeRef(lane.b, f.now, f.center))
        const start = (f: { now: number; center: number }) => Math.min(resolveTimeRef(lane.a, f.now, f.center), resolveTimeRef(lane.b, f.now, f.center))
        return (
          <div key={lane.key} className={`tl-lane tl-lane--${savedLaneVariant(r)} tl-lane--labels tl-nowflag-lane`} style={{ '--i': lane.index } as CSSProperties}>
            <div
              ref={el => { if (el) refs.current.set(lane.key, el); else { refs.current.delete(lane.key); shown.current.delete(lane.key) } }}
              className="tl-nowflag glow-text"
              style={{ display: 'none', height: FLAG_SIZE }}
              role="button"
              tabIndex={0}
              aria-label={`${name || 'Span'}: time left`}
              onClick={() => act.selectSpan(r.span.id)}
              onKeyDown={e => { if (e.key === 'Enter') act.selectSpan(r.span.id) }}
            >
              {name && <span className="tl-nowflag__name">{truncateText(name, NAME_MAX)}</span>}
              <LiveText className="tl-nowflag__left mono" compute={f => formatDurationHMS(end(f) - f.now)} />
              <LiveText className="tl-nowflag__total mono" compute={f => `/${formatDurationShort(end(f) - start(f))}`} />
            </div>
          </div>
        )
      })}
    </>
  )
}
