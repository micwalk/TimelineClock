// The Cursor tag's ＋ turning into the new instant's chip, and back (the shell: PlusMorphLayer).
//
// Tap ＋: one glowing shell starts as the ＋ circle, swoops across the axis to where the new
// chip lands while stretching into its pill (the name box opens inside it), then hands over to
// the chip. When naming ends (Enter, a tap elsewhere, moving the cursor), a pill-shaped copy
// peels off the chip and shrinks back into the ＋ circle beside the Cursor tag.
//
// The shell is one element drawn per engine frame while a morph runs. Its two ends are
// measured once (the ＋ button and the chip) and the chip's end then follows the time axis, so
// a pan or zoom mid-morph keeps it attached.
import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import type { Frame } from '../../engine/viewportEngine.ts'
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import { clamp, easeInOutCubic, lerp, smoothstep } from '../../domain/time.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'

/** ＋ to chip, and chip back to ＋, ms. */
export const MORPH_IN_MS = 420
export const MORPH_OUT_MS = 340
/** The shell fades out over the chip (or the ＋) as it hands over, ms (matches .tl-morph). */
const HANDOVER_MS = 140
/** Share of the way in at which the chip starts showing through the shell (a crossfade). */
const HANDOVER_AT = 0.7
/** Frames to wait for the chip to appear before giving up on the animation. */
const WAIT_FRAMES = 30
/** A chip's corner radius (--radius-chip). */
const CHIP_RADIUS = 7

/** A box measured relative to the timeline; `ts` (if set) is the time it rides along with. */
interface Anchored { x: number; y: number; w: number; h: number; ts: number | null; pos0: number }

interface Run {
  kind: 'in' | 'out'
  id: string
  from: Anchored | null
  to: Anchored | null
  t0: number | null
  waited: number
  /** Naming ended while the ＋ was still growing into the chip: pull it back out right after. */
  thenOut: boolean
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t: number) => t * t * t
/** Overshoots a little, then settles: the pill stretches just past its size. */
const easeOutBack = (t: number) => {
  const c = 1.2
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

let shell: HTMLDivElement | null = null
let timeline: HTMLElement | null = null
let plusButton: HTMLElement | null = null
const chips = new Map<string, HTMLElement>()
let run: Run | null = null
let stopFrames: (() => void) | null = null
let fadeTimer: ReturnType<typeof setTimeout> | null = null

function measure(el: HTMLElement, f: Frame, ts: number | null): Anchored | null {
  if (!timeline || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  const t = timeline.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left - t.left, y: r.top - t.top, w: r.width, h: r.height, ts, pos0: ts === null ? 0 : f.pos(ts) }
}

/** Where an anchored box is in this frame: moved along the time axis with its time. */
function at(a: Anchored, f: Frame): Anchored {
  if (a.ts === null) return a
  const d = f.pos(a.ts) - a.pos0
  return f.orientation === 'horizontal' ? { ...a, x: a.x + d } : { ...a, y: a.y + d }
}

const tsOf = (id: string) => useEntities.getState().instants.find(i => i.id === id)?.tsEpochMs ?? null

function hideShell(fade: boolean) {
  if (!shell) return
  if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null }
  if (!fade) { shell.classList.remove('is-on', 'is-fading'); return }
  shell.classList.add('is-fading')
  fadeTimer = setTimeout(() => { fadeTimer = null; shell?.classList.remove('is-on', 'is-fading') }, HANDOVER_MS)
}

function finish() {
  const r = run
  run = null
  stopFrames?.()
  stopFrames = null
  if (!r) return
  hideShell(true)
  if (r.kind === 'out') { ui.setPlusMorph(null); return }
  if (useUi.getState().plusMorph?.id !== r.id) return
  ui.setPlusMorph({ id: r.id, phase: 'editing' })
  if (r.thenOut || useView.getState().editingInstantId !== r.id) beginOut(r.id)
}

function beginOut(id: string) {
  if (reducedMotion() || !plusButton) { ui.setPlusMorph(null); return }
  ui.setPlusMorph({ id, phase: 'out' })
  start({ kind: 'out', id, from: null, to: null, t0: null, waited: 0, thenOut: false })
}

function start(r: Run) {
  run = r
  if (!stopFrames) stopFrames = engine.onFrame(draw)
  engine.requestFrame()
  engine.invalidate()
}

function draw(f: Frame) {
  const r = run
  if (!r || !shell) { finish(); return }
  // Measure what isn't known yet; DOM writes for this frame (the chip's transform) are done by now.
  const chip = chips.get(r.id)
  const ts = tsOf(r.id)
  if (r.kind === 'in' && !r.to) r.to = chip && ts !== null ? measure(chip, f, ts) : null
  if (r.kind === 'out') {
    if (!r.from) r.from = chip && ts !== null ? measure(chip, f, ts) : null
    // The ＋ may still be stepping to its resting place (vertical: past the chip, which just
    // shrank from its name box), so follow it each frame.
    r.to = (plusButton ? measure(plusButton, f, null) : null) ?? r.to
  }
  if (!r.from || !r.to) {
    if (++r.waited > WAIT_FRAMES || (r.kind === 'out' && (!plusButton || !chip))) finish()
    else engine.requestFrame()
    return
  }
  r.t0 ??= f.perf
  const duration = r.kind === 'in' ? MORPH_IN_MS : MORPH_OUT_MS
  const p = clamp((f.perf - r.t0) / duration, 0, 1)
  const a = at(r.from, f)
  const b = at(r.to, f)
  const horizontal = f.orientation === 'horizontal'
  // A curved path that never sweeps over the Cursor tag's readout: in, it drops across the
  // axis first and then slides along time into place; out, it slides back along time first
  // and then lifts across the axis to the ＋.
  const along = r.kind === 'in' ? easeInOutCubic(p) : easeOutCubic(p)
  const across = r.kind === 'in' ? easeOutCubic(p) : easeInCubic(p)
  const kx = horizontal ? along : across
  const ky = horizontal ? across : along
  const size = r.kind === 'in' ? easeOutBack(p) : easeInOutCubic(p)
  const w = Math.max(4, lerp(a.w, b.w, size))
  const h = Math.max(4, lerp(a.h, b.h, size))
  // Centers move; the box grows around its center.
  const cx = lerp(a.x + a.w / 2, b.x + b.w / 2, kx)
  const cy = lerp(a.y + a.h / 2, b.y + b.h / 2, ky)
  const circle = r.kind === 'in' ? 1 - easeInOutCubic(p) : easeInOutCubic(p)
  const radius = Math.min(h / 2, lerp(CHIP_RADIUS, h / 2, circle))
  if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null }
  shell.classList.add('is-on')
  shell.classList.remove('is-fading')
  shell.style.transform = `translate3d(${(cx - w / 2).toFixed(2)}px,${(cy - h / 2).toFixed(2)}px,0)`
  shell.style.width = `${w.toFixed(2)}px`
  shell.style.height = `${h.toFixed(2)}px`
  shell.style.borderRadius = `${radius.toFixed(2)}px`
  // The ＋'s colour while it is a circle, the instant's as a chip; the ＋ glyph shows only as a circle.
  shell.style.setProperty('--mix', `${Math.round(circle * 100)}%`)
  shell.style.setProperty('--glyph', String(clamp(circle * 2 - 0.6, 0, 1)))
  // In, the chip fades in under the shell as it arrives (the shell's fill clears, so the two
  // cross-fade). Out, the shell starts as a see-through outline over the chip (its text stays
  // readable) and fills in as it becomes the ＋.
  if (r.kind === 'in' && p >= HANDOVER_AT && useUi.getState().plusMorph?.phase === 'in') ui.setPlusMorph({ id: r.id, phase: 'editing' })
  const fill = r.kind === 'in' ? 1 - smoothstep(HANDOVER_AT, 1, p) : clamp(p * 1.6, 0, 1)
  shell.style.setProperty('--fill', fill.toFixed(3))
  if (p >= 1) finish()
  else engine.requestFrame()
}

/** Tap on the Cursor tag's ＋: drops an instant at the cursor and morphs the ＋ into its chip. */
export function dropFromPlus(button: HTMLElement) {
  const f = engine.sample()
  const from = reducedMotion() ? null : measure(button, f, null)
  if (run) finish()
  const id = act.dropAndName()
  if (!from) return // no animation: the chip just appears, named in place
  ui.setPlusMorph({ id, phase: 'in' })
  start({ kind: 'in', id, from, to: null, t0: null, waited: 0, thenOut: false })
}

/** The Cursor tag's ＋ button registers itself (the morph measures where to return to). */
export function usePlusButton(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    if (!active) return
    const el = ref.current
    plusButton = el
    return () => { if (plusButton === el) plusButton = null }
  }, [ref, active])
}

/** A saved chip registers its box, so a morph can find it. */
export function useMorphChip(ref: RefObject<HTMLElement | null>, id: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    chips.set(id, el)
    return () => { if (chips.get(id) === el) chips.delete(id) }
  }, [ref, id])
}

/** The shell element (PlusMorphLayer) attaches itself; returns the cleanup. */
export function attachShell(el: HTMLDivElement): () => void {
  shell = el
  timeline = el.closest('.timeline')
  return () => {
    hideShell(false)
    if (shell === el) { shell = null; timeline = null }
  }
}

/** Pulls the ＋ back out when naming ends; drops a morph whose instant is deleted. Returns the cleanup. */
export function watchNaming(): () => void {
  const offView = useView.subscribe((s, prev) => {
    const m = useUi.getState().plusMorph
    if (!m || s.editingInstantId === prev.editingInstantId || s.editingInstantId === m.id) return
    if (m.phase === 'in' && run?.kind === 'in') run.thenOut = true
    else if (m.phase === 'editing') beginOut(m.id)
  })
  const offEntities = useEntities.subscribe(s => {
    const m = useUi.getState().plusMorph
    if (m && !s.instants.some(i => i.id === m.id)) {
      run = null
      stopFrames?.()
      stopFrames = null
      hideShell(false)
      ui.setPlusMorph(null)
    }
  })
  return () => { offView(); offEntities() }
}
