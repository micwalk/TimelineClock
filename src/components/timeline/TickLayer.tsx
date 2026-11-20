// Axis ticks, painted on two canvases (lines under the instant lines, labels above them) rather
// than an element per tick: a zoom frame repaints one band instead of restyling dozens of
// elements. Painted in the engine's frame listener, so they move in the same frame as everything
// else. Ticks are laid out once per zoom level over a little more than the screen; a pan only
// translates the canvases (along x, or y when vertical), so a drag costs a transform write per
// frame and a repaint only once it runs past the margin. Colours, glow and font come from the
// theme tokens (read again when the theme or glow changes); the boxes are domain/tickPaint's.
import { useEffect, useRef } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { generateTicks, labelSpacingPx } from '../../domain/ticks.ts'
import { TICK_LABEL, tickLabelBox, tickLineBox } from '../../domain/tickPaint.ts'
import { translateMain as translate } from './axisPlace.ts'

/** How far past each end of the screen ticks are painted, as a share of the screen's length. */
const MARGIN = 0.25
/** The longest a tick line reaches from the axis (domain/ticks halfHeight), px. */
const MAX_HALF_HEIGHT = 10

interface Tokens { glowColor: string; labelBg: string; glow: number; font: string }

function readTokens(el: Element): Tokens {
  const cs = getComputedStyle(el)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  return { glowColor: v('--c-axis-glow') || '#3b82f6', labelBg: v('--tick-label-bg') || '#000', glow: parseFloat(v('--glow')) || 0, font: v('--font-mono') || 'monospace' }
}

/** Sizes a canvas to `w` × `h` CSS px at the screen's density, placed at (x, y); writes only what changed. */
function fit(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number, dpr: number) {
  const pw = Math.max(1, Math.ceil(w * dpr))
  const ph = Math.max(1, Math.ceil(h * dpr))
  if (canvas.width !== pw) canvas.width = pw
  if (canvas.height !== ph) canvas.height = ph
  const css = `left:${x}px;top:${y}px;width:${pw / dpr}px;height:${ph / dpr}px`
  if (canvas.dataset.box !== css) { canvas.dataset.box = css; canvas.style.cssText = css }
}

export function TickLayer({ axis }: { axis: number }) {
  const linesInner = useRef<HTMLDivElement>(null)
  const labelsInner = useRef<HTMLDivElement>(null)
  const linesCanvas = useRef<HTMLCanvasElement>(null)
  const labelsCanvas = useRef<HTMLCanvasElement>(null)
  const s = useRef({
    center: 0, pxPerMs: 0, start: 0, end: 0, mainSize: 0, crossSize: 0, axis: NaN, dir: 1,
    orientation: 'horizontal' as Frame['orientation'],
    tokens: null as Tokens | null,
    widths: new Map<string, number>(),
    texts: [] as { text: string; font: string; a: number; x: number; y: number }[],
  }).current

  // Theme or glow changed (--glow is written on the root; the sky style is an attribute), or a
  // font finished loading: read the tokens again and repaint.
  useEffect(() => {
    const refresh = () => { s.tokens = null; s.widths.clear(); s.pxPerMs = 0; engine.requestFrame() }
    const mo = new MutationObserver(refresh)
    mo.observe(document.documentElement, { attributes: true })
    document.fonts?.addEventListener('loadingdone', refresh)
    return () => { mo.disconnect(); document.fonts?.removeEventListener('loadingdone', refresh) }
  }, [s])

  useFrameListener(f => {
    const li = linesInner.current, la = labelsInner.current, lc = linesCanvas.current, lb = labelsCanvas.current
    if (!li || !la || !lc || !lb) return
    const zoomed = s.pxPerMs !== 0 && Math.abs(f.pxPerMs - s.pxPerMs) > s.pxPerMs * 1e-6
    const stale =
      s.pxPerMs === 0 || zoomed ||
      f.mainSize !== s.mainSize || f.crossSize !== s.crossSize || axis !== s.axis ||
      f.dir !== s.dir || f.orientation !== s.orientation ||
      f.start < s.start || f.end > s.end
    if (stale) paint(f, lc, lb)
    const shift = translate(f.orientation, s.dir * (s.center - f.center) * f.pxPerMs)
    li.style.transform = shift
    la.style.transform = shift
  })

  function paint(f: Frame, lc: HTMLCanvasElement, lb: HTMLCanvasElement) {
    const range = f.end - f.start
    s.start = f.start - range * MARGIN
    s.end = f.end + range * MARGIN
    s.center = f.center
    s.pxPerMs = f.pxPerMs
    s.mainSize = f.mainSize
    s.crossSize = f.crossSize
    s.axis = axis
    s.dir = f.dir
    s.orientation = f.orientation
    if (!s.tokens) s.tokens = readTokens(lc)
    const tk = s.tokens
    const horizontal = f.orientation === 'horizontal'
    const dpr = window.devicePixelRatio || 1
    const margin = f.mainSize * MARGIN
    const mainLen = f.mainSize + 2 * margin
    const blur = 4 * tk.glow
    // Lines: a band across the axis, as far as the longest line and its glow reach.
    const linePad = MAX_HALF_HEIGHT + 2 * blur + 2
    // Labels: everything on the live side of the axis (above it, or left of it).
    const at = (main: number, cross: number, mainSz: number, crossSz: number) =>
      horizontal ? [main, cross, mainSz, crossSz] as const : [cross, main, crossSz, mainSz] as const
    fit(lc, ...at(-margin, axis - linePad, mainLen, linePad * 2), dpr)
    fit(lb, ...at(-margin, 0, mainLen, axis), dpr)
    const lctx = lc.getContext('2d')
    const bctx = lb.getContext('2d')
    if (!lctx || !bctx) return
    // Draw in the timeline's px: x along the main axis from its start edge (as the tick
    // elements were placed), y across it from its top edge.
    const origin = (ctx: CanvasRenderingContext2D, crossOrigin: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, horizontal ? margin * dpr : -crossOrigin * dpr, horizontal ? -crossOrigin * dpr : margin * dpr)
    }
    origin(lctx, axis - linePad)
    origin(bctx, 0)

    // Every line in one path and one fill (one glow); every pill in one fill, then the texts.
    // Canvas state changes cost (a font is parsed each time it is set), so each is set once
    // where it can be and only on a change otherwise.
    lctx.beginPath()
    bctx.beginPath()
    if (s.widths.size > 4000) s.widths.clear()
    let font = ''
    const texts = s.texts
    texts.length = 0
    for (const tick of generateTicks(s.start, s.end, f.pxPerMs, 600, labelSpacingPx(f.orientation))) {
      const along = s.mainSize / 2 + s.dir * (tick.t - s.center) * s.pxPerMs
      // Quantized as the elements' styles were, so the picture matches what it replaced.
      const { halfHeight, labelAlpha, fontSizePx, bold } = tick.style
      const h = Math.round(halfHeight * 2) / 2
      const line = tickLineBox(f.orientation, along, axis, h)
      lctx.rect(line.x, line.y, line.w, line.h)
      const text = tick.label
      if (!text) continue
      const fs = Math.round(fontSizePx * 4) / 4
      const f2 = `${bold ? 700 : 500} ${fs}px ${tk.font}`
      const key = `${f2}|${text}`
      let w = s.widths.get(key)
      if (w === undefined) {
        if (f2 !== font) { font = f2; bctx.font = font }
        w = bctx.measureText(text).width
        s.widths.set(key, w)
      }
      const box = tickLabelBox(f.orientation, along, axis, h, w, fs)
      // An opaque pill so no line shows through; the fade is on the text, not the pill.
      bctx.roundRect(box.x, box.y, box.w, box.h, TICK_LABEL.radius)
      const a = Math.round(labelAlpha * 20) / 20
      if (a > 0) texts.push({ text, font: f2, a, x: box.x + box.w / 2, y: box.y + box.h / 2 })
    }
    lctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    lctx.shadowColor = tk.glowColor
    lctx.shadowBlur = blur * dpr
    lctx.fill()
    bctx.shadowBlur = 0
    bctx.globalAlpha = 1
    bctx.fillStyle = tk.labelBg
    bctx.fill()
    bctx.textAlign = 'center'
    bctx.textBaseline = 'middle'
    bctx.fillStyle = '#fff'
    bctx.shadowColor = tk.glowColor
    bctx.shadowBlur = 6 * tk.glow * dpr
    let alpha = -1
    for (const t of texts) {
      if (t.font !== font) { font = t.font; bctx.font = font }
      if (t.a !== alpha) { alpha = t.a; bctx.globalAlpha = alpha }
      bctx.fillText(t.text, t.x, t.y)
    }
  }

  return (
    <>
      <div className="tl-ticks tl-ticks--lines" aria-hidden>
        <div ref={linesInner} className="tl-ticks__inner"><canvas ref={linesCanvas} className="tl-ticks__canvas" /></div>
      </div>
      <div className="tl-ticks tl-ticks--labels" aria-hidden>
        <div ref={labelsInner} className="tl-ticks__inner"><canvas ref={labelsCanvas} className="tl-ticks__canvas" /></div>
      </div>
    </>
  )
}
