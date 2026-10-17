// The sky behind the timeline (#11): a gradient along the time axis from the sun's altitude
// (domain/sun.ts), so night, twilight and day read at a glance (no AM/PM mix-ups, #22).
// Like the ticks it is laid out once per zoom over a range wider than the screen, and a pan
// only translates it; the stops are computed again only when the range runs out.
import { useRef } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { useSettings } from '../../store/settings.ts'
import type { SkyLocation, SkyMode } from '../../store/settings.ts'
import { fixedSkyStops, skyStops } from '../../domain/sun.ts'
import type { SkyStop } from '../../domain/sun.ts'
import { DAY, smoothstep } from '../../domain/time.ts'
import { translateMain } from './axisPlace.ts'

/** Stops far off the layer are clamped (the colour there barely changes across the screen). */
const STOP_LIMIT_PX = 1e6
/**
 * Zoomed far out (months, a year) days are a few px wide: the sky fades out between these widths
 * of a day (px), and below the first it isn't drawn at all (thousands of stops for stripes).
 */
const FADE_FROM_DAY_PX = 10
const FADE_TO_DAY_PX = 30
/** Narrower than this a day keeps only its main stops (night, horizon, noon): a third of the stops. */
const SIMPLE_DAY_PX = 60
const SIMPLE_KEYS = new Set(['midnight', 'dark', 'horizon', 'noon'])

/** The stops for the sky setting over [start, end], or null when the sky is off. */
function stopsFor(mode: SkyMode, loc: SkyLocation | null, start: number, end: number): SkyStop[] | null {
  if (mode === 'off') return null
  return mode === 'auto' && loc ? skyStops(start, end, loc) : fixedSkyStops(start, end)
}

export function SkyLayer() {
  const mode = useSettings(s => s.sky)
  const loc = useSettings(s => s.skyLocation)
  const bandRef = useRef<HTMLDivElement>(null)
  const s = useRef({
    center: 0, pxPerMs: 0, start: 0, end: 0, mainSize: 0, dir: 1, orientation: 'horizontal' as Frame['orientation'],
    source: null as unknown,
    cache: { from: 0, to: 0, stops: null as SkyStop[] | null },
  }).current

  useFrameListener(f => {
    const band = bandRef.current
    if (!band) return
    const source = `${mode}|${loc?.lat}|${loc?.lon}`
    const sourceChanged = source !== s.source
    if (sourceChanged) { s.source = source; s.cache.from = s.cache.to = 0; s.cache.stops = null }
    const zoomed = s.pxPerMs !== 0 && Math.abs(f.pxPerMs - s.pxPerMs) > s.pxPerMs * 1e-6
    const stale = sourceChanged || s.pxPerMs === 0 || zoomed || f.mainSize !== s.mainSize || f.dir !== s.dir ||
      f.orientation !== s.orientation || f.start < s.start || f.end > s.end
    const dayPx = f.pxPerMs * DAY
    const fade = smoothstep(FADE_FROM_DAY_PX, FADE_TO_DAY_PX, dayPx)
    if (fade <= 0) { band.style.display = 'none'; s.pxPerMs = 0; return }
    const o = fade >= 1 ? '' : String(Math.round(fade * 20) / 20)
    if (band.style.opacity !== o) band.style.opacity = o
    if (stale) {
      const range = f.end - f.start
      const margin = zoomed ? 0.1 : 0.75
      s.start = f.start - range * margin
      s.end = f.end + range * margin
      s.center = f.center
      s.pxPerMs = f.pxPerMs
      s.mainSize = f.mainSize
      s.dir = f.dir
      s.orientation = f.orientation
      // Stops for a little more than the layout, so pans and small zooms reuse them.
      if (s.cache.stops === null || s.start < s.cache.from || s.end > s.cache.to) {
        const extra = Math.max(range, DAY)
        s.cache.from = s.start - extra
        s.cache.to = s.end + extra
        s.cache.stops = stopsFor(mode, loc, s.cache.from, s.cache.to)
      }
      const all = s.cache.stops
      const stops = all && dayPx < SIMPLE_DAY_PX ? all.filter(st => SIMPLE_KEYS.has(st.key)) : all
      if (!stops || stops.length < 2) { band.style.display = 'none'; return }
      band.style.display = ''
      const x = (t: number) => s.mainSize / 2 + s.dir * (t - s.center) * s.pxPerMs
      const a = x(s.dir === 1 ? s.start : s.end)
      const len = Math.abs(x(s.end) - x(s.start))
      // The stops the layout needs: those inside it and one on either side.
      let i0 = 0
      while (i0 + 1 < stops.length && stops[i0 + 1].t <= s.start) i0++
      let i1 = stops.length - 1
      while (i1 - 1 >= 0 && stops[i1 - 1].t >= s.end) i1--
      const parts: string[] = []
      for (let i = i0; i <= i1; i++) {
        const px = Math.max(-STOP_LIMIT_PX, Math.min(STOP_LIMIT_PX, x(stops[i].t) - a))
        parts.push(`var(--sky-${stops[i].key}) ${px.toFixed(1)}px`)
      }
      if (s.dir === -1) parts.reverse()
      const horizontal = f.orientation === 'horizontal'
      band.style.background = `linear-gradient(${horizontal ? 'to right' : 'to bottom'}, ${parts.join(', ')})`
      band.style.left = horizontal ? `${a}px` : '0'
      band.style.top = horizontal ? '0' : `${a}px`
      band.style.width = horizontal ? `${len}px` : '100%'
      band.style.height = horizontal ? '100%' : `${len}px`
    }
    band.style.transform = translateMain(f.orientation, s.dir * (s.center - f.center) * f.pxPerMs)
  })

  return (
    <div className="tl-sky" aria-hidden>
      <div ref={bandRef} className="tl-sky__band" />
    </div>
  )
}
