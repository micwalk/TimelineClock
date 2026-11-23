// The ✓ Done animation (domain/doneBurst; owner, 2026-11-22), on one short-lived canvas over
// everything, drawn from engine frames (`f.perf`) and gone when it is done, so the timeline's DOM
// and its frame budget are untouched. A tap on a Done box charges it (useUi.charging: motes rush
// in, it fills and greens, a swoosh), then it pops as the todo is done (useUi.celebrating: a green
// ✓ springs out past the box and back, green confetti flies, a ding); the ✓ chip and the Todos row
// flare too (CSS `.is-celebrating`). Without a box (a Done from elsewhere) only the ✓ pops, or just
// the confetti from the ✓ chip. With reduced motion only the flare and the ding.
import { useEffect, useRef, useState } from 'react'
import { travelToNow } from './doneTravel.ts'
import { setDoneTravel } from '../../store/actions.ts'
import { useFrameListener } from '../../engine/hooks.ts'
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import type { Spark } from '../../domain/sparks.ts'
import { confettiBurst, sparkAt } from '../../domain/sparks.ts'
import type { DoneOrigin, Mote } from '../../domain/doneBurst.ts'
import { CHECK_POINTS, doneBoxAt, inflow, moteAt } from '../../domain/doneBurst.ts'
import { useUi } from '../../store/ui.ts'
import { getTunables, useSettings } from '../../store/settings.ts'
import { playDoneSound } from '../../services/AlarmScheduler.ts'

type Rgb = readonly [number, number, number]

interface Burst {
  todoId: string
  origin: DoneOrigin
  /** perf ms of the tap, and of the pop once it came. */
  start: number
  pop: number | null
  chargeS: number
  motes: Mote[]
  confetti: Spark[]
  seconds: number
  spread: number
  glow: number
  from: Rgb
  green: Rgb
  light: Rgb
}

/** How long the box and its ✓ stay after the pop (s). */
const POP_S = 1.05

/** A CSS colour as rgb, through the canvas's own parser (a theme token or a computed colour). */
function rgbOf(ctx: CanvasRenderingContext2D, color: string): Rgb {
  ctx.fillStyle = '#000'
  ctx.fillStyle = color
  const s = String(ctx.fillStyle)
  if (s.startsWith('#') && s.length === 7) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
  const m = s.match(/(\d+(?:\.\d+)?)/g)
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [255, 255, 255]
}

const mix = (a: Rgb, b: Rgb, t: number) => `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`
const css = (c: Rgb) => `rgb(${c.join(',')})`

/** With no box to start from: the ✓ chip, else its Todos row, else the timeline's middle; only the confetti. */
function fallbackOrigin(): DoneOrigin {
  const el = document.querySelector('.chip.is-celebrating') ?? document.querySelector('.todo-row.is-celebrating') ?? document.querySelector('.timeline')
  const r = el?.getBoundingClientRect()
  const at = !r || r.width === 0 ? { x: window.innerWidth / 2, y: window.innerHeight / 2 } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  return { ...at, size: 0, radius: 0, color: 'currentColor', box: false }
}

export function Celebration() {
  // Done ahead of its time: its chip travels to Now first (doneTravel).
  useEffect(() => { setDoneTravel(travelToNow); return () => setDoneTravel(null) }, [])
  const charging = useUi(s => s.charging)
  const celebrating = useUi(s => s.celebrating)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const burst = useRef<Burst | null>(null)
  const [active, setActive] = useState(false)

  // A box starts charging: the motes and the swoosh.
  useEffect(() => {
    if (!charging) {
      // Charged but never done (it was done or deleted meanwhile): let it go. (A charge that
      // ended in its pop is the pop's: celebrating is set in the same update.)
      const b = burst.current
      if (b && b.pop === null && useUi.getState().celebrating?.todoId !== b.todoId) burst.current = null
      return
    }
    const t = getTunables()
    const { doneFanfare, fanfareVolume } = useSettings.getState()
    if (doneFanfare) playDoneSound('charge', fanfareVolume, t.doneChargeMs / 1000)
    if (reducedMotion()) return
    burst.current = makeBurst(charging.todoId, charging.origin, t.doneChargeMs / 1000, charging.n)
    setActive(true)
    engine.requestFrame()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one burst per charge
  }, [charging?.n])

  // The pop: the ding, the ✓ and the confetti (on the charged box, else where it was done).
  useEffect(() => {
    if (!celebrating) return
    const { doneFanfare, fanfareVolume } = useSettings.getState()
    if (doneFanfare) playDoneSound('ding', fanfareVolume)
    const t = getTunables()
    if (reducedMotion()) return
    const b = burst.current
    if (b && b.todoId === celebrating.todoId && b.pop === null) {
      b.pop = performance.now()
      engine.requestFrame()
      return
    }
    // A frame later, so a ✓ chip just made is on the page to start from.
    const raf = requestAnimationFrame(() => {
      const origin = celebrating.origin ?? fallbackOrigin()
      const nb = makeBurst(celebrating.todoId, origin, 0, celebrating.n)
      nb.pop = nb.start
      if (!origin.box && origin.size === 0 && t.sparkCount <= 0) return
      burst.current = nb
      setActive(true)
      engine.requestFrame()
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one pop per celebration
  }, [celebrating?.n])

  useFrameListener(f => {
    const b = burst.current
    if (!b) return
    const canvas = canvasRef.current
    // Not mounted yet (it mounts with the burst): try again next frame.
    if (!canvas) { engine.requestFrame(); return }
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (b.green[0] < 0) {
      // Colours, read once the canvas is there.
      const root = getComputedStyle(document.documentElement)
      b.green = rgbOf(ctx, root.getPropertyValue('--c-ok').trim() || '#22c55e')
      b.from = rgbOf(ctx, b.origin.color)
      b.light = b.green.map(v => Math.round(v + (255 - v) * 0.55)) as unknown as Rgb
    }
    // Time on the animation's own clock: a charge that runs over (the pop comes a little late)
    // holds at its end until the pop.
    const elapsed = (f.perf - b.start) / 1000
    // (A frame's time can be a hair before the pop's own, which was read after the frame began.)
    const sincePop = b.pop === null ? -1 : Math.max(0, (f.perf - b.pop) / 1000)
    const t = b.pop === null ? Math.min(Math.max(0, elapsed), b.chargeS * 0.9999) : b.chargeS + sincePop
    const { origin: o, glow } = b
    const half = o.size / 2
    const box = doneBoxAt(t, { chargeS: b.chargeS, popS: POP_S })
    const confettiOn = sincePop >= 0 && sincePop < b.seconds
    if (!box && !confettiOn && b.pop !== null) {
      burst.current = null
      setActive(false)
      return
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // The motes rushing in, brighter and greener as they near the border.
    if (b.pop === null && b.chargeS > 0) {
      const p = Math.min(1, elapsed / b.chargeS)
      ctx.globalCompositeOperation = 'lighter'
      for (const m of b.motes) {
        const q = moteAt(m, p, half, Math.max(28, b.spread * 0.4))
        if (!q) continue
        const c = mix(b.from, b.light, p)
        ctx.globalAlpha = q.alpha
        ctx.fillStyle = c
        ctx.shadowColor = c
        ctx.shadowBlur = 6 * glow * (0.5 + q.alpha)
        ctx.beginPath()
        ctx.arc(o.x + q.x, o.y + q.y, q.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    if (box) {
      const c = mix(b.from, b.green, box.green)
      if (o.box) {
        const s = o.size * box.scale
        const r = Math.min(s / 2, o.radius * box.scale)
        const x = o.x - s / 2
        const y = o.y - s / 2
        // Its middle filling until opaque.
        ctx.globalAlpha = box.alpha * box.fill
        ctx.fillStyle = c
        ctx.shadowColor = c
        ctx.shadowBlur = 8 * glow * box.glow
        ctx.beginPath()
        ctx.roundRect(x, y, s, s, r)
        ctx.fill()
        // Its border, glowing more and more (drawn twice once it glows hard).
        ctx.globalAlpha = box.alpha
        ctx.strokeStyle = c
        ctx.lineWidth = Math.max(1.5, (o.size * 2.2) / 14.8)
        for (let k = 0; k < (box.glow > 2 ? 2 : 1); k++) {
          ctx.shadowBlur = 5 * glow * box.glow * (k + 1)
          ctx.beginPath()
          ctx.roundRect(x, y, s, s, r)
          ctx.stroke()
        }
      }
      // The ✓ springing out of the fill, past the box, and back.
      if (box.check > 0 && o.size > 0) {
        const size = (o.box ? o.size : Math.max(18, Math.min(28, o.size))) * box.check
        ctx.globalAlpha = box.alpha
        ctx.strokeStyle = mix(b.green, b.light, Math.max(0, Math.min(1, box.check - 1)))
        ctx.shadowColor = css(b.green)
        ctx.shadowBlur = 10 * glow
        ctx.lineWidth = Math.max(2, ((o.box ? o.size : 22) * 2.6) / 14.8) * Math.sqrt(Math.max(1, box.check))
        ctx.beginPath()
        CHECK_POINTS.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(o.x + px * size, o.y + py * size) : ctx.lineTo(o.x + px * size, o.y + py * size)))
        ctx.stroke()
      }
    }

    // Green confetti, thrown out from the box's edge as the ✓ springs, tumbling down and fading.
    if (confettiOn) {
      ctx.globalCompositeOperation = 'lighter'
      for (const s of b.confetti) {
        const p = sparkAt(s, sincePop, b.seconds, b.spread)
        if (!p) continue
        const speed = Math.hypot(s.vx, s.vy) || 1
        const x = o.x + p.x + (s.vx / speed) * half
        const y = o.y + p.y + (s.vy / speed) * half
        const c = css(s.color === 0 ? b.green : b.light)
        ctx.globalAlpha = p.alpha
        ctx.fillStyle = c
        ctx.shadowColor = c
        ctx.shadowBlur = 6 * glow
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(p.turn)
        // A little card that flickers as it tumbles.
        const flip = Math.abs(Math.cos(p.turn * 1.7))
        ctx.fillRect(-p.r * 1.1, -p.r * 0.55 * flip - 0.5, p.r * 2.2, p.r * 1.1 * flip + 1)
        ctx.restore()
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    engine.requestFrame()
  })

  return active ? <canvas ref={canvasRef} className="sparks" aria-hidden /> : null
}

function makeBurst(todoId: string, origin: DoneOrigin, chargeS: number, seed: number): Burst {
  const t = getTunables()
  const glow = Number(getComputedStyle(document.documentElement).getPropertyValue('--glow')) || 1
  const seconds = t.sparkMs / 1000
  return {
    todoId,
    origin,
    start: performance.now(),
    pop: null,
    chargeS,
    motes: origin.box && chargeS > 0 ? inflow(t.doneInflowCount, seed) : [],
    confetti: confettiBurst(t.sparkCount, t.sparkSpreadPx, seconds, 2, seed),
    seconds,
    spread: t.sparkSpreadPx,
    glow,
    // Read on the first frame (rgbOf needs the canvas).
    from: [-1, 0, 0],
    green: [-1, 0, 0],
    light: [-1, 0, 0],
  }
}
