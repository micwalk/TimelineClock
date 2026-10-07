// Saved instants' lines, in one "world" layer: a camera over the timeline. Lines sit at fixed
// offsets from an origin time inside one container; a pan moves only the container (one
// transform per frame, one composited layer), and the lines are rewritten only when the zoom
// changes. Managed imperatively like the ticks: lines come and go as instants enter and leave
// the view without React mounting anything.
import { useMemo, useRef } from 'react'
import type { InstantRecord } from '../../domain/entities.ts'
import { useFrameListener } from '../../engine/hooks.ts'
import { savedLayoutAt } from './savedLayout.ts'
import { placeAlong, translateMain as translate } from './axisPlace.ts'

/** Re-base the camera when the container would sit this far off screen (keeps offsets small). */
const REBASE_PX = 20_000
/** Lines are drawn only this far past the screen's edges (the chips' layout looks further). */
const LINE_MARGIN_PX = 24
/** The ghost line of an instant being moved (where it was). */
const GHOST = '\u0000ghost'

interface LineNode { el: HTMLDivElement; x: number; cls: string }

export function InstantLines({ instants, lineClass, movingId, ghostTs }: {
  instants: readonly InstantRecord[]
  /** State class per instant id (is-selected, is-focused, ...); absent = plain. */
  lineClass: Readonly<Record<string, string>>
  /** The instant being moved rides the cursor (the screen center). */
  movingId: string | null
  /** Where the moving instant was: a faint line stays there. */
  ghostTs: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => new Map(instants.map(i => [i.id, i])), [instants])
  const cam = useRef({ origin: NaN, k: NaN, mainSize: NaN, orientation: '' as string, base: NaN, nodes: new Map<string, LineNode>() })

  useFrameListener(f => {
    const world = ref.current
    if (!world) return
    const s = cam.current
    const k = f.dir * f.pxPerMs
    let base = f.pos(s.origin)
    if (k !== s.k || f.orientation !== s.orientation || f.mainSize !== s.mainSize || !(Math.abs(base) < REBASE_PX)) {
      // New zoom (or size, or the camera drifted far): re-base on the center and lay out again.
      s.origin = f.center
      s.k = k
      s.mainSize = f.mainSize
      s.orientation = f.orientation
      base = f.pos(s.origin)
      for (const n of s.nodes.values()) n.x = NaN
    }
    if (base !== s.base) {
      s.base = base
      world.style.transform = translate(f.orientation, base)
    }

    const seen = new Set<string>()
    const place = (key: string, x: number, cls: string) => {
      seen.add(key)
      let n = s.nodes.get(key)
      if (!n) {
        const el = document.createElement('div')
        el.appendChild(document.createElement('div')).className = 'tl-col__line'
        world.appendChild(el)
        n = { el, x: NaN, cls: '\u0000' }
        s.nodes.set(key, n)
      }
      if (cls !== n.cls) { n.cls = cls; n.el.className = `tl-col tl-col--line${cls ? ` ${cls}` : ''}` }
      if (Math.abs(x - n.x) > 0.01 || Number.isNaN(n.x)) { n.x = x; placeAlong(n.el, f.orientation, x) }
    }
    for (const id of savedLayoutAt(f).visibleIds) {
      const inst = byId.get(id)
      if (!inst) continue
      const x = id === movingId ? f.mainSize / 2 - base : (inst.tsEpochMs - s.origin) * k
      // Off screen: no line (a zoom would rewrite it every frame for nothing).
      if (base + x < -LINE_MARGIN_PX || base + x > f.mainSize + LINE_MARGIN_PX) continue
      place(id, x, lineClass[id] ?? '')
    }
    if (ghostTs !== null) place(GHOST, (ghostTs - s.origin) * k, 'is-ghost')
    for (const [key, n] of s.nodes) {
      if (!seen.has(key)) { n.el.remove(); s.nodes.delete(key) }
    }
  })

  return <div ref={ref} className="tl-world tl-world--lines" aria-hidden />
}
