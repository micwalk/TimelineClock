// The celebration on ✓ Done (docs/prd_todos.md §7.2): the ✓ chip and its Todos row flare (CSS,
// `.is-celebrating`, from useUi.celebrating), sparks burst from the ✓, and a short fanfare plays.
// The sparks are drawn on one short-lived canvas over everything from engine frames (`f.perf`),
// and it is gone when they are, so the timeline's DOM and its frame budget are untouched. With
// reduced motion there are no sparks (the glow still fades in and out); the fanfare follows its
// setting (Settings › Alarms).
import { useEffect, useRef, useState } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import type { Spark } from '../../domain/sparks.ts'
import { sparkAt, sparkBurst } from '../../domain/sparks.ts'
import { useUi } from '../../store/ui.ts'
import { getTunables, useSettings } from '../../store/settings.ts'
import { playFanfare } from '../../services/AlarmScheduler.ts'

/** The theme colours sparks take (theme.css), read once per burst. */
const SPARK_TOKENS = ['--c-ok', '--c-favorite', '--c-cursor', '--c-alarm', '--c-sun']

interface Burst { start: number; x: number; y: number; sparks: Spark[]; colors: string[]; seconds: number; spread: number; glow: number }

/** Where the sparks start: the ✓ chip, else its Todos row (the Agenda over the timeline), else the timeline's middle. */
function origin(): { x: number; y: number } {
  const el = document.querySelector('.chip.is-celebrating') ?? document.querySelector('.todo-row.is-celebrating') ?? document.querySelector('.timeline')
  const r = el?.getBoundingClientRect()
  if (!r || r.width === 0) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export function Celebration() {
  const n = useUi(s => s.celebrating?.n ?? 0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const burst = useRef<Burst | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!n) return
    const { doneFanfare, fanfareVolume } = useSettings.getState()
    if (doneFanfare) playFanfare(fanfareVolume)
    const t = getTunables()
    if (reducedMotion() || t.sparkCount <= 0) return
    // A frame later, so the ✓ chip (just made) is on the page.
    const raf = requestAnimationFrame(() => {
      const css = getComputedStyle(document.documentElement)
      const colors = SPARK_TOKENS.map(k => css.getPropertyValue(k).trim()).filter(Boolean)
      const { x, y } = origin()
      const seconds = t.sparkMs / 1000
      const glow = Number(css.getPropertyValue('--glow')) || 1
      burst.current = { start: performance.now(), x, y, sparks: sparkBurst(t.sparkCount, t.sparkSpreadPx, seconds, Math.max(1, colors.length), n), colors: colors.length ? colors : ['#fff'], seconds, spread: t.sparkSpreadPx, glow }
      setActive(true)
      engine.requestFrame()
    })
    return () => cancelAnimationFrame(raf)
  }, [n])

  useFrameListener(f => {
    const b = burst.current
    const canvas = canvasRef.current
    if (!b || !canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const t = (f.perf - b.start) / 1000
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (t >= b.seconds) {
      burst.current = null
      setActive(false)
      return
    }
    ctx.globalCompositeOperation = 'lighter'
    for (const s of b.sparks) {
      const p = sparkAt(s, t, b.seconds, b.spread)
      if (!p) continue
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = b.colors[s.color % b.colors.length]
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 8 * b.glow
      ctx.beginPath()
      ctx.arc(b.x + p.x, b.y + p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    engine.requestFrame()
  })

  return active ? <canvas ref={canvasRef} className="sparks" aria-hidden /> : null
}
