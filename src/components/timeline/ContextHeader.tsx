// The context header (#22, domain/tickContext.ts): what the tick labels leave out ("Thu, Oct 15 ·
// 8 PM" over minute ticks), one label per boundary, the current one stuck at the timeline's
// earlier edge until the next pushes it off. Horizontal: a row along the top. Vertical: a spine
// down the left edge, reading the way time runs. A pool of plain elements like the ticks; each
// label's length is measured once by a ResizeObserver, never read in a frame.
import { useEffect, useRef } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import { useLayout } from '../../store/layout.ts'
import { contextBoundaries, contextUnitFor, formatContext, stickyPlace } from '../../domain/tickContext.ts'
import { labelSpacingPx } from '../../domain/ticks.ts'
import { placeAlong } from './axisPlace.ts'

/** Space between a label pushed off and the next one's boundary, px. */
const GAP_PX = 10
/** Where the stuck label sits from the earlier edge, px: clear of the ☰ button when it is there. */
const EDGE_PX = 12
const EDGE_WITH_BUTTON_PX = 58
/** A label's length until it has been measured. */
const GUESS_PX = 140
/** How long a label takes to fade out once it is no longer needed (matches the CSS). */
const FADE_MS = 250

interface Label {
  el: HTMLDivElement
  len: number
  pos: number
}

export function ContextHeader() {
  const hasButton = useLayout(s => s.agendaPlacement === 'drawer')
  const rootRef = useRef<HTMLDivElement>(null)
  const s = useRef({ labels: new Map<string, Label>(), byEl: new WeakMap<Element, Label>(), ro: null as ResizeObserver | null, orientation: '', up: false }).current

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const label = s.byEl.get(e.target)
        if (!label) continue
        // The length along the text: inlineSize is logical, so it is the height of a vertical-rl label.
        const box = e.borderBoxSize?.[0]
        label.len = box ? box.inlineSize : (s.orientation === 'vertical' ? e.contentRect.height : e.contentRect.width)
      }
    })
    s.ro = ro
    return () => { ro.disconnect(); s.ro = null }
  }, [s])

  useFrameListener(f => {
    const root = rootRef.current
    if (!root) return
    if (f.orientation !== s.orientation) {
      // Lengths are along the other side now: measure again.
      s.orientation = f.orientation
      for (const l of s.labels.values()) { l.len = GUESS_PX; l.pos = NaN; s.ro?.unobserve(l.el); s.ro?.observe(l.el) }
    }
    const up = f.dir === -1
    if (up !== s.up) { s.up = up; root.classList.toggle('is-up', up) }
    const unit = contextUnitFor(f.pxPerMs, labelSpacingPx(f.orientation))
    const times = unit ? contextBoundaries(f.start, f.end, unit) : []
    const keys = times.map(t => `${unit}:${t}`)
    const keep = new Set(keys)
    for (const [key, l] of s.labels) {
      if (keep.has(key)) continue
      s.labels.delete(key)
      s.ro?.unobserve(l.el)
      l.el.classList.add('is-leaving')
      setTimeout(() => l.el.remove(), FADE_MS)
    }
    const placed: Label[] = []
    times.forEach((t, i) => {
      let l = s.labels.get(keys[i])
      if (!l) {
        const el = document.createElement('div')
        el.className = 'tl-context__label'
        const text = document.createElement('span')
        text.textContent = unit ? formatContext(t, unit, f.now) : ''
        el.appendChild(text)
        root.appendChild(el)
        l = { el, len: GUESS_PX, pos: NaN }
        s.labels.set(keys[i], l)
        s.byEl.set(el, l)
        s.ro?.observe(el)
      }
      placed.push(l)
    })
    // Forward coordinates: px from the earlier edge along the way time runs.
    const forward = (pos: number) => (f.dir === 1 ? pos : f.mainSize - pos)
    const edge = hasButton && f.dir === 1 ? EDGE_WITH_BUTTON_PX : EDGE_PX
    const at = stickyPlace(times.map(t => forward(f.pos(t))), placed.map(l => l.len), edge, GAP_PX)
    placed.forEach((l, i) => {
      // Back to the main axis: the label's leading (left or top) side.
      const lead = f.dir === 1 ? at[i] : f.mainSize - at[i] - l.len
      const pos = Math.round(lead * 2) / 2
      if (pos !== l.pos) { l.pos = pos; placeAlong(l.el, f.orientation, pos) }
    })
  })

  return <div ref={rootRef} className="tl-context" aria-hidden />
}
