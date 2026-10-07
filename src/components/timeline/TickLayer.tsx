// Axis ticks, managed imperatively: a pool of DOM nodes keyed by timestamp. Ticks are
// laid out once per zoom level over a range wider than the screen; panning only
// translates the container (along x, or y when vertical), so a drag costs a single transform write per frame.
// Only ticks with a label get a label element.
import { useRef } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { generateTicks, labelSpacingPx } from '../../domain/ticks.ts'
import { placeAlong, translateMain as translate } from './axisPlace.ts'


interface TickNode {
  el: HTMLDivElement
  /** The label's own element, in the labels layer above every line (created once the tick has a label). */
  labelEl: HTMLDivElement | null
  label: HTMLSpanElement | null
  x: number
  h: number
  a: number
  fs: number
  bold: boolean
  text: string
}

export function TickLayer() {
  const innerRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const layout = useRef({ center: 0, pxPerMs: 0, start: 0, end: 0, mainSize: 0, dir: 1, orientation: 'horizontal' as Frame['orientation'], nodes: new Map<number, TickNode>() })

  useFrameListener(f => {
    const inner = innerRef.current
    const labels = labelsRef.current
    if (!inner || !labels) return
    const s = layout.current
    const zoomed = s.pxPerMs !== 0 && Math.abs(f.pxPerMs - s.pxPerMs) > s.pxPerMs * 1e-6
    const stale =
      s.pxPerMs === 0 ||
      zoomed ||
      f.mainSize !== s.mainSize ||
      f.dir !== s.dir ||
      f.orientation !== s.orientation ||
      f.start < s.start ||
      f.end > s.end
    if (stale) {
      // A pan only moves the container, so lay out well past the screen. While zooming every
      // tick is rewritten each frame anyway: then lay out little more than the screen.
      const range = f.end - f.start
      const margin = zoomed ? 0.1 : 0.75
      s.start = f.start - range * margin
      s.end = f.end + range * margin
      s.center = f.center
      s.pxPerMs = f.pxPerMs
      s.mainSize = f.mainSize
      s.dir = f.dir
      if (f.orientation !== s.orientation) {
        // Rewrite along the new axis.
        for (const n of s.nodes.values()) n.x = NaN
      }
      s.orientation = f.orientation
      const seen = new Set<number>()
      for (const tick of generateTicks(s.start, s.end, f.pxPerMs, 600, labelSpacingPx(f.orientation))) {
        seen.add(tick.t)
        let n = s.nodes.get(tick.t)
        if (!n) {
          const el = document.createElement('div')
          el.className = 'tl-tick'
          const line = document.createElement('i')
          line.className = 'tl-tick__line'
          el.appendChild(line)
          inner.appendChild(el)
          n = { el, labelEl: null, label: null, x: NaN, h: NaN, a: NaN, fs: NaN, bold: false, text: '' }
          s.nodes.set(tick.t, n)
        }
        const text = tick.label ?? ''
        if (text && !n.labelEl) {
          const labelEl = document.createElement('div')
          labelEl.className = 'tl-tick'
          const label = document.createElement('span')
          label.className = 'tl-tick__label'
          labelEl.appendChild(label)
          labels.appendChild(labelEl)
          n.labelEl = labelEl
          n.label = label
          n.x = n.h = n.a = n.fs = NaN
          n.bold = false
          n.text = ''
        }
        const x = s.mainSize / 2 + s.dir * (tick.t - s.center) * s.pxPerMs
        if (x !== n.x) { n.x = x; placeAlong(n.el, f.orientation, x); if (n.labelEl) placeAlong(n.labelEl, f.orientation, x) }
        const { halfHeight, labelAlpha, fontSizePx, bold } = tick.style
        // Quantized so a smooth zoom only rewrites styles when they visibly change.
        const h = Math.round(halfHeight * 2) / 2
        if (h !== n.h) { n.h = h; n.el.style.setProperty('--h', String(h)); n.labelEl?.style.setProperty('--h', String(h)) }
        if (!n.labelEl || !n.label) continue
        const a = Math.round(labelAlpha * 20) / 20
        if (a !== n.a) { n.a = a; n.labelEl.style.setProperty('--a', String(a)) }
        const fs = Math.round(fontSizePx * 4) / 4
        if (fs !== n.fs) { n.fs = fs; n.labelEl.style.setProperty('--fs', String(fs)) }
        if (bold !== n.bold) { n.bold = bold; n.labelEl.classList.toggle('is-bold', bold) }
        if (text !== n.text) { n.text = text; n.label.textContent = text }
      }
      for (const [t, n] of s.nodes) {
        if (!seen.has(t)) { n.el.remove(); n.labelEl?.remove(); s.nodes.delete(t) }
      }
    }
    const shift = translate(f.orientation, s.dir * (s.center - f.center) * f.pxPerMs)
    inner.style.transform = shift
    labels.style.transform = shift
  })

  return (
    <>
      <div className="tl-ticks tl-ticks--lines" aria-hidden>
        <div ref={innerRef} className="tl-ticks__inner" />
      </div>
      <div className="tl-ticks tl-ticks--labels" aria-hidden>
        <div ref={labelsRef} className="tl-ticks__inner" />
      </div>
    </>
  )
}
