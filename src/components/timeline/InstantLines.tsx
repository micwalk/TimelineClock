// Saved instants' lines, in one "world" layer: a camera over the timeline. Lines sit at fixed
// offsets from an origin time inside one container; a pan moves only the container (one
// transform per frame, one composited layer), and the lines are rewritten only when the zoom
// changes. Managed imperatively like the ticks: lines come and go as instants enter and leave
// the view without React mounting anything.
import { useMemo, useRef } from 'react'
import type { InstantRecord } from '../../domain/entities.ts'
import { useFrameListener } from '../../engine/hooks.ts'
import { savedLayoutAt } from './savedLayout.ts'
import * as act from '../../store/actions.ts'
import { placeAlong, translateMain as translate } from './axisPlace.ts'

/** Re-base the camera when the container would sit this far off screen (keeps offsets small). */
const REBASE_PX = 20_000
/** Lines are drawn only this far past the screen's edges (the chips' layout looks further). */
const LINE_MARGIN_PX = 24
/** The ghost line of an instant being moved (where it was). */
const GHOST = '\u0000ghost'

interface LineNode { el: HTMLDivElement; x: number; cls: string; op: string }

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
  // Every line carries the shape that morphs into a mark (timeline.css is-morph), so any instant
  // becoming a mark animates the same way: the line shrinks to a stub from the axis and, with an
  // alarm to come, amber grows in it (the sun's colour for computed sun times).
  const morphClass = useMemo(() => {
    const out = new Map<string, string>()
    for (const i of instants) {
      const sun = i.virtual && i.sun
      out.set(i.id, sun ? ' is-morph is-alarmed is-sun' : i.alarms?.some(a => !a.answered) ? ' is-morph is-alarmed' : ' is-morph')
    }
    return out
  }, [instants])
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
    const place = (key: string, x: number, cls: string, op = '') => {
      seen.add(key)
      let n = s.nodes.get(key)
      if (!n) {
        const el = document.createElement('div')
        el.appendChild(document.createElement('div')).className = 'tl-col__line'
        // A mark's hit area (timeline.css: only a mark's takes taps): a tap selects it, so it is a Label again.
        const hit = el.appendChild(document.createElement('div'))
        hit.className = 'tl-col__hit'
        hit.dataset.id = key
        hit.setAttribute('role', 'button')
        hit.setAttribute('aria-label', 'Show this instant')
        world.appendChild(el)
        n = { el, x: NaN, cls: '\u0000', op: '' }
        s.nodes.set(key, n)
      }
      if (cls !== n.cls) { n.cls = cls; n.el.className = `tl-col tl-col--line${cls ? ` ${cls}` : ''}` }
      if (op !== n.op) { n.op = op; n.el.style.opacity = op }
      if (Math.abs(x - n.x) > 0.01 || Number.isNaN(n.x)) { n.x = x; placeAlong(n.el, f.orientation, x) }
    }
    const layout = savedLayoutAt(f)
    for (const id of layout.visibleIds) {
      const inst = byId.get(id)
      if (!inst) continue
      const x = id === movingId ? f.mainSize / 2 - base : (inst.tsEpochMs - s.origin) * k
      // Off screen: no line (a zoom would rewrite it every frame for nothing).
      if (base + x < -LINE_MARGIN_PX || base + x > f.mainSize + LINE_MARGIN_PX) continue
      // A mark (past its Label zoom: domain/displayGroups): a short tapered line from the axis, fading before it is Hidden.
      const mark = !!layout.marks[id]
      const fade = mark ? layout.markFade[id] : undefined
      place(id, x, `${mark ? 'is-mark' : lineClass[id] ?? ''}${morphClass.get(id) ?? ' is-morph'}`, fade === undefined ? '' : String(fade))
    }
    if (ghostTs !== null) place(GHOST, (ghostTs - s.origin) * k, 'is-ghost')
    for (const [key, n] of s.nodes) {
      if (!seen.has(key)) { n.el.remove(); s.nodes.delete(key) }
    }
  })

  // Taps on a mark (its hit area): select it (a Label again while selected); a double tap focuses it.
  const instantOf = (e: React.MouseEvent) => {
    const id = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.tl-col__hit')?.dataset.id : undefined
    return id ? byId.get(id) : undefined
  }
  return (
    <div ref={ref} className="tl-world tl-world--lines"
      onClick={e => { const inst = instantOf(e); if (inst) act.tapInstant(inst) }}
      onDoubleClick={e => { const inst = instantOf(e); if (inst) act.activateInstant(inst.id) }} />
  )
}
