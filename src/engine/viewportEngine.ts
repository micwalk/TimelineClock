// Frame scheduler for the timeline. It does not draw anything: it computes the
// displayed viewport (center/width, including focus transitions and zoom
// smoothing) and hands each frame to subscribers, which write CSS transforms or
// text directly. React renders structure; this keeps per-frame work out of React.
// Positions are along the main axis; orientation and time direction come from the layout store.
//
// Frames run only when needed: on state changes, during animations/gestures, when
// a subscriber asks for continuous frames, otherwise just often enough that Now
// moves by <= 1/4 px, and at each wall-clock second for the clocks.
import { useEntities } from '../store/entities.ts'
import { useView } from '../store/view.ts'
import { useLayout } from '../store/layout.ts'
import type { Orientation } from '../domain/layoutMode.ts'
import type { AxisProjection } from '../domain/viewport.ts'
import { posToTime, pxPerMs, resolveViewTarget, timeToPos, visibleRange } from '../domain/viewport.ts'
import { clamp, easeInOutCubic, lerp } from '../domain/time.ts'

export interface Frame extends AxisProjection {
  /** Wall clock for this frame; use it instead of Date.now() for consistency. */
  now: number
  /** Monotonic time of this frame (performance.now()), for animations. */
  perf: number
  orientation: Orientation
  /** Size across the time axis, px (the timeline's height when horizontal). */
  crossSize: number
  pxPerMs: number
  /** Earliest and latest visible times, whatever the direction. */
  start: number
  end: number
  /** True while a focus transition or zoom smoothing is in flight. */
  animating: boolean
  /** Position of a time along the main axis, px from the timeline's start edge. */
  pos: (t: number) => number
  /** Time at a main-axis position. */
  time: (pos: number) => number
  seq: number
}

export type FrameListener = (f: Frame) => void

/** Phase 0 writes DOM geometry/text; phase 1 feeds React (may trigger re-renders). */
export type FramePhase = 0 | 1

const TRANSITION_MS = 350
const ZOOM_SMOOTHING_TAU_MS = 70
const RAF_THRESHOLD_MS = 20

// Falls back to a timer where rAF is unavailable (tests, some embedded contexts).
const scheduleAnimationFrame: (cb: () => void) => unknown =
  typeof requestAnimationFrame === 'function' ? cb => requestAnimationFrame(cb) : cb => setTimeout(cb, 16)

let reducedMotionQuery: MediaQueryList | null | undefined
/** The user asked for less motion (live; cheap enough to call every frame). */
export function reducedMotion(): boolean {
  if (reducedMotionQuery === undefined) {
    reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)') ?? null
      : null
  }
  return !!reducedMotionQuery?.matches
}
const prefersReducedMotion = reducedMotion

class ViewportEngine {
  private listeners: [Set<FrameListener>, Set<FrameListener>] = [new Set(), new Set()]
  private frame: Frame
  private size = { w: typeof window !== 'undefined' ? window.innerWidth : 1200, h: 400 }
  private displayedWidth: number | null = null
  private transition: { fromCenter: number; fromWidth: number; start: number; duration: number } | null = null
  private lastPerf = 0
  private seq = 0
  private rafId: unknown = null
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private timeoutDue = Infinity
  private wantsFrame = false
  private started = false

  constructor() {
    this.frame = this.compute(Date.now(), 0, false)
  }

  start() {
    if (this.started) return
    this.started = true
    useView.subscribe(() => this.invalidate())
    useEntities.subscribe(() => this.invalidate())
    useLayout.subscribe(() => this.invalidate())
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.invalidate() })
    this.invalidate()
  }

  /** The last rendered frame (what listeners last drew). */
  getFrame(): Frame {
    return this.frame
  }

  /**
   * The viewport as it would render right now, including in-flight transitions.
   * Use this when acting on user input: the last frame can be up to a second old
   * while idle.
   */
  sample(): Frame {
    return this.compute(Date.now(), performance.now(), false)
  }

  onFrame(fn: FrameListener, phase: FramePhase = 0): () => void {
    this.listeners[phase].add(fn)
    return () => { this.listeners[phase].delete(fn) }
  }

  /** For useSyncExternalStore. */
  subscribe = (cb: () => void) => this.onFrame(cb, 1)

  setSize(w: number, h: number) {
    if (w === this.size.w && h === this.size.h) return
    this.size = { w: Math.max(1, w), h: Math.max(1, h) }
    this.invalidate()
  }

  /** Called by listeners that need the next frame too (e.g. a millisecond readout). */
  requestFrame() {
    this.wantsFrame = true
  }

  private momentumStoppers = new Set<() => void>()

  /** Registers something (the glide) that must stop when navigation starts. Returns the cleanup. */
  onNavigate(stop: () => void): () => void {
    this.momentumStoppers.add(stop)
    return () => { this.momentumStoppers.delete(stop) }
  }

  /** Stops momentum (a running glide): call when any other navigation begins. */
  stopMomentum() {
    for (const stop of [...this.momentumStoppers]) stop()
  }

  /** Animate from what is on screen now to wherever the (just changed) state points. */
  beginTransition(duration = TRANSITION_MS) {
    this.stopMomentum()
    if (prefersReducedMotion()) duration = 0
    // Call before changing state: the sample is what's on screen at this moment.
    const from = this.sample()
    this.transition = { fromCenter: from.center, fromWidth: from.width, start: performance.now(), duration }
    this.invalidate()
  }

  /** Stop any transition, keeping the current on-screen zoom as the smoothing start point. */
  cancelTransition() {
    if (!this.transition) return
    this.displayedWidth = this.sample().width
    this.transition = null
  }

  invalidate = () => {
    this.schedule(0)
  }

  private schedule(delayMs: number) {
    if (delayMs < RAF_THRESHOLD_MS) {
      if (this.rafId !== null) return
      if (this.timeoutId !== null) { clearTimeout(this.timeoutId); this.timeoutId = null; this.timeoutDue = Infinity }
      this.rafId = scheduleAnimationFrame(this.run)
      return
    }
    if (this.rafId !== null) return
    const due = performance.now() + delayMs
    if (this.timeoutId !== null) {
      if (this.timeoutDue <= due) return
      clearTimeout(this.timeoutId)
    }
    this.timeoutDue = due
    this.timeoutId = setTimeout(this.run, delayMs)
  }

  private compute(now: number, perf: number, advance: boolean): Frame {
    const v = useView.getState()
    const e = useEntities.getState()
    const target = resolveViewTarget(v, e.instants, e.spans, now)
    let center = target.center
    let width = target.width
    let animating = false

    if (this.transition) {
      const tr = this.transition
      const p = tr.duration > 0 ? clamp((perf - tr.start) / tr.duration, 0, 1) : 1
      const k = easeInOutCubic(p)
      center = lerp(tr.fromCenter, target.center, k)
      width = Math.exp(lerp(Math.log(tr.fromWidth), Math.log(target.width), k))
      if (advance) {
        if (p >= 1) this.transition = null
        this.displayedWidth = width
      }
      animating = p < 1
    } else if (this.displayedWidth !== null && this.displayedWidth !== target.width) {
      const dt = clamp(perf - this.lastPerf, 1, 32)
      const alpha = 1 - Math.exp(-dt / ZOOM_SMOOTHING_TAU_MS)
      width = Math.exp(lerp(Math.log(this.displayedWidth), Math.log(target.width), alpha))
      if (Math.abs(width - target.width) / target.width < 1e-3) width = target.width
      else animating = true
      if (advance) this.displayedWidth = width
    } else if (advance) {
      this.displayedWidth = width
    }

    const { orientation, dir } = useLayout.getState()
    const horizontal = orientation === 'horizontal'
    const p: AxisProjection = { center, width, mainSize: horizontal ? this.size.w : this.size.h, dir }
    const { start, end } = visibleRange(p)
    return {
      ...p,
      now,
      perf,
      orientation,
      crossSize: horizontal ? this.size.h : this.size.w,
      pxPerMs: pxPerMs(p),
      start,
      end,
      animating,
      pos: t => timeToPos(p, t),
      time: pos => posToTime(p, pos),
      seq: this.seq,
    }
  }

  private run = () => {
    this.rafId = null
    this.timeoutId = null
    this.timeoutDue = Infinity
    if (typeof document !== 'undefined' && document.hidden) return // resumed by visibilitychange

    const now = Date.now()
    const perf = performance.now()
    this.seq++
    const f = this.compute(now, perf, true)
    this.lastPerf = perf
    this.frame = f

    this.wantsFrame = false
    for (const fn of this.listeners[0]) fn(f)
    for (const fn of this.listeners[1]) fn(f)

    if (f.animating || this.transition || this.wantsFrame) {
      this.schedule(0)
      return
    }
    const quarterPixelMs = 0.25 / f.pxPerMs // Now drifts a quarter pixel
    const nextSecondMs = 1000 - (now % 1000) + 1 // keep clocks on the second
    this.schedule(Math.min(quarterPixelMs, nextSecondMs))
  }
}

export const engine = new ViewportEngine()
