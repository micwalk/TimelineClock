// Axis ticks, managed imperatively: a pool of DOM nodes keyed by timestamp. Ticks are
// laid out once per zoom level over a range wider than the screen; panning only
// translates the container (along x, or y when vertical), so a drag costs a single transform write per frame.
import { useRef } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { generateTicks } from '../../domain/ticks.ts'

const translate = (orientation: Frame['orientation'], px: number) =>
  orientation === 'horizontal' ? `translate3d(${px}px,0,0)` : `translate3d(0,${px}px,0)`

interface TickNode {
  el: HTMLDivElement
  label: HTMLSpanElement
  x: number
  h: number
  a: number
  fs: number
  bold: boolean
  text: string
}

export function TickLayer() {
  const innerRef = useRef<HTMLDivElement>(null)
  const layout = useRef({ center: 0, pxPerMs: 0, start: 0, end: 0, mainSize: 0, dir: 1, orientation: 'horizontal' as Frame['orientation'], nodes: new Map<number, TickNode>() })

  useFrameListener(f => {
    const inner = innerRef.current
    if (!inner) return
    const s = layout.current
    const stale =
      s.pxPerMs === 0 ||
      Math.abs(f.pxPerMs - s.pxPerMs) > s.pxPerMs * 1e-6 ||
      f.mainSize !== s.mainSize ||
      f.dir !== s.dir ||
      f.orientation !== s.orientation ||
      f.start < s.start ||
      f.end > s.end
    if (stale) {
      const range = f.end - f.start
      s.start = f.start - range * 0.75
      s.end = f.end + range * 0.75
      s.center = f.center
      s.pxPerMs = f.pxPerMs
      s.mainSize = f.mainSize
      s.dir = f.dir
      if (f.orientation !== s.orientation) for (const n of s.nodes.values()) n.x = NaN // rewrite along the new axis
      s.orientation = f.orientation
      const seen = new Set<number>()
      for (const tick of generateTicks(s.start, s.end, f.pxPerMs)) {
        seen.add(tick.t)
        let n = s.nodes.get(tick.t)
        if (!n) {
          const el = document.createElement('div')
          el.className = 'tl-tick'
          const line = document.createElement('i')
          line.className = 'tl-tick__line'
          const label = document.createElement('span')
          label.className = 'tl-tick__label'
          el.append(line, label)
          inner.appendChild(el)
          n = { el, label, x: NaN, h: NaN, a: NaN, fs: NaN, bold: false, text: '' }
          s.nodes.set(tick.t, n)
        }
        const x = s.mainSize / 2 + s.dir * (tick.t - s.center) * s.pxPerMs
        if (x !== n.x) { n.x = x; n.el.style.transform = translate(f.orientation, x) }
        const { halfHeight, labelAlpha, fontSizePx, bold } = tick.style
        // Quantized so a smooth zoom only rewrites styles when they visibly change.
        const h = Math.round(halfHeight * 2) / 2
        if (h !== n.h) { n.h = h; n.el.style.setProperty('--h', String(h)) }
        const a = Math.round(labelAlpha * 20) / 20
        if (a !== n.a) { n.a = a; n.el.style.setProperty('--a', String(a)) }
        const fs = Math.round(fontSizePx * 4) / 4
        if (fs !== n.fs) { n.fs = fs; n.el.style.setProperty('--fs', String(fs)) }
        if (bold !== n.bold) { n.bold = bold; n.el.classList.toggle('is-bold', bold) }
        const text = tick.label ?? ''
        if (text !== n.text) { n.text = text; n.label.textContent = text }
      }
      for (const [t, n] of s.nodes) {
        if (!seen.has(t)) { n.el.remove(); s.nodes.delete(t) }
      }
    }
    inner.style.transform = translate(f.orientation, s.dir * (s.center - f.center) * f.pxPerMs)
  })

  return (
    <div className="tl-ticks" aria-hidden>
      <div ref={innerRef} className="tl-ticks__inner" />
    </div>
  )
}
