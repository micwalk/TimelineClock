// The Cursor tag's ＋ and the instant the cursor is on (its two shapes: PlusMorphLayer).
//
// Dropping: tap ＋ and one glowing shell starts as the ＋ circle and stretches into the pill of
// the new chip, which lands right there on the cursor line (the name box opens inside it), and
// cross-fades into the chip. The ＋ is now inside that chip.
//
// Capture: whenever the cursor is on an instant (focused, or about to land on it: capture.ts),
// the ＋ belongs inside that instant's chip, since a drop there would only duplicate it. It
// flows in as a 2D metaball: a blob leaves the ＋'s place, a gooey neck reaches the chip and
// the blob is absorbed (the chip swells a little). When the cursor leaves, the blob is pulled
// back out, the neck stretches and snaps, and the blob rounds back into the ＋. It runs on the
// capture flow (captureFlowAt: 0 = at the ＋'s place, 1 = inside the chip), the same motion
// that glides the cursor onto the instant's line, so the two always move together. Chips that
// are not captured keep out of the ＋'s way (the saved layout treats it as an obstacle).
//
// After naming a dropped instant without moving, the cursor lands on it (it is right there).
//
// Both shapes are drawn per engine frame only while they move. The ＋ and the chip are measured
// with layout reads only during those frames; the chip's end then follows the time axis, so a pan
// or zoom mid-morph keeps it attached.
import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import type { Frame } from '../../engine/viewportEngine.ts'
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import { gesture } from '../../engine/gesture.ts'
import { clamp, easeInOutCubic, lerp, smoothstep } from '../../domain/time.ts'
import type { Point } from '../../domain/metaball.ts'
import { circlePath, metaballNeck } from '../../domain/metaball.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { captureAt, captureFlowAt, settleCaptureFlow } from './capture.ts'
import { setPlusObstacle } from './savedLayout.ts'

/** ＋ to the new chip, ms. */
export const MORPH_IN_MS = 420
/** The shell fades out over the chip as it hands over, ms (matches .tl-morph). */
const HANDOVER_MS = 140
/** Share of the way in at which the chip starts showing through the shell (a crossfade). */
const HANDOVER_AT = 0.7
/** Frames to wait for the chip to appear before giving up on the animation. */
const WAIT_FRAMES = 30
/** A chip's corner radius (--radius-chip). */
const CHIP_RADIUS = 7
/** The bulge a chip pushes out to meet the blob, px (it sits just inside the chip's edge). */
const BULGE_R = 9

/** A box measured relative to the timeline; `ts` (if set) is the time it rides along with. */
interface Anchored { x: number; y: number; w: number; h: number; ts: number | null; pos0: number }

interface Run { id: string; from: Anchored; to: Anchored | null; t0: number | null; waited: number }

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
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
let fadeTimer: ReturnType<typeof setTimeout> | null = null

/** The metaball: an SVG with the same shapes twice, outlines under fills (so only the outer edge shows). */
export interface BlobParts { svg: SVGSVGElement; strokes: SVGPathElement[]; fills: SVGPathElement[]; glyph: SVGGElement }
let blobParts: BlobParts | null = null
/** The chip the blob flows into and the ＋'s place (each measured once per flow). */
const blob: { anchor: string | null; t: number; chip: Anchored | null; home: Anchored | null; drawn: boolean } =
  { anchor: null, t: 0, chip: null, home: null, drawn: false }
/** The instant dropped from the ＋ while it is being named; then the one to land on. */
let namingId: string | null = null
let pendingLand: string | null = null

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

// Chips keep out of the ＋'s way while it is out on the cursor line (savedLayout.ts).
setPlusObstacle(() => !!plusButton && plusButton.isConnected && !useUi.getState().plusHidden)

function setPlusHidden(hidden: boolean) {
  if (useUi.getState().plusHidden !== hidden) ui.setPlusHidden(hidden)
}

function hideShell(fade: boolean) {
  if (!shell) return
  if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null }
  if (!fade) { shell.classList.remove('is-on', 'is-fading'); return }
  shell.classList.add('is-fading')
  fadeTimer = setTimeout(() => { fadeTimer = null; shell?.classList.remove('is-on', 'is-fading') }, HANDOVER_MS)
}

// ---------------------------------------------------------------------------
// Dropping: the ＋ becomes the new chip.

function finishIn() {
  const r = run
  run = null
  hideShell(true)
  if (!r) return
  if (useUi.getState().plusMorph?.id === r.id) ui.setPlusMorph(null)
  // The ＋ is inside the new chip now (the cursor is on it: capture); the blob takes it from here.
  blob.anchor = r.id
  blob.t = 1
  blob.chip = null
  settleCaptureFlow(r.id)
}

function drawIn(f: Frame) {
  const r = run
  if (!r || !shell) { finishIn(); return }
  // DOM writes for this frame (the chip's transform) are done by now.
  if (!r.to) {
    const chip = chips.get(r.id)
    const ts = tsOf(r.id)
    r.to = chip && ts !== null ? measure(chip, f, ts) : null
    if (!r.to) {
      if (++r.waited > WAIT_FRAMES) finishIn()
      else engine.requestFrame()
      return
    }
  }
  r.t0 ??= f.perf
  const p = clamp((f.perf - r.t0) / MORPH_IN_MS, 0, 1)
  const a = at(r.from, f)
  const b = at(r.to, f)
  const horizontal = f.orientation === 'horizontal'
  // A slightly curved path: across the axis first, then along time into place (the chip may sit
  // in another row, or slid along time by the overlap layout).
  const along = easeInOutCubic(p)
  const across = easeOutCubic(p)
  const kx = horizontal ? along : across
  const ky = horizontal ? across : along
  const size = easeOutBack(p)
  const w = Math.max(4, lerp(a.w, b.w, size))
  const h = Math.max(4, lerp(a.h, b.h, size))
  // Centers move; the box grows around its center.
  const cx = lerp(a.x + a.w / 2, b.x + b.w / 2, kx)
  const cy = lerp(a.y + a.h / 2, b.y + b.h / 2, ky)
  const circle = 1 - easeInOutCubic(p)
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
  // The chip fades in under the shell as it arrives (the shell's fill clears: a cross-fade).
  if (p >= HANDOVER_AT && useUi.getState().plusMorph?.id === r.id) ui.setPlusMorph(null)
  shell.style.setProperty('--fill', (1 - smoothstep(HANDOVER_AT, 1, p)).toFixed(3))
  if (p >= 1) finishIn()
  else engine.requestFrame()
}

// ---------------------------------------------------------------------------
// Capture: the ＋ flows into the chip of the instant the cursor is on, and back out.

function hideBlob() {
  if (!blobParts || !blob.drawn) return
  blob.drawn = false
  blobParts.svg.classList.remove('is-on')
}

/** The chip swells a little as it takes the blob in. */
function absorbBump(id: string | null) {
  const el = id ? chips.get(id)?.parentElement : null
  if (!el || typeof el.animate !== 'function' || reducedMotion()) return
  el.animate([{ scale: '1' }, { scale: '1.08' }, { scale: '1' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
}

/** The point on a box's edge nearest to `p` (from inside, the nearest side). */
function nearestOnEdge(p: Point, r: Anchored): Point {
  const x = clamp(p.x, r.x, r.x + r.w)
  const y = clamp(p.y, r.y, r.y + r.h)
  if (x !== p.x || y !== p.y) return { x, y }
  const sides = [
    { d: p.x - r.x, q: { x: r.x, y: p.y } },
    { d: r.x + r.w - p.x, q: { x: r.x + r.w, y: p.y } },
    { d: p.y - r.y, q: { x: p.x, y: r.y } },
    { d: r.y + r.h - p.y, q: { x: p.x, y: r.y + r.h } },
  ]
  return sides.reduce((a, b2) => (b2.d < a.d ? b2 : a)).q
}

function drawBlob(f: Frame, t: number) {
  const parts = blobParts
  // The ＋ stays put (CursorTag pins it), so it is measured once per flow, not every frame.
  blob.home ??= plusButton ? measure(plusButton, f, null) : null
  const home = blob.home
  if (!parts || !home) { hideBlob(); return }
  const hc: Point = { x: home.x + home.w / 2, y: home.y + home.h / 2 }
  const rHome = home.w / 2
  if (!blob.chip && blob.anchor) {
    const el = chips.get(blob.anchor)
    const ts = tsOf(blob.anchor)
    blob.chip = el && ts !== null ? measure(el, f, ts) : null
  }
  const c = blob.chip ? at(blob.chip, f) : null
  // Where it is absorbed: on the chip's edge nearest the ＋, where the chip swells to meet it (the
  // blob's fill covers the chip's outline there, so the two read as one shape); with no chip on
  // screen, the blob just shrinks where it is.
  const b: Point = c ? nearestOnEdge(hc, c) : hc
  const s = smoothstep(0, 1, t)
  const a: Point = { x: lerp(hc.x, b.x, s), y: lerp(hc.y, b.y, s) }
  const rA = lerp(rHome, 0, Math.pow(t, 1.3))
  // The chip swells out to meet the blob, then swallows the swelling as the blob goes in.
  const rB = c ? BULGE_R * smoothstep(0.05, 0.45, t) * (1 - smoothstep(0.7, 1, t)) : 0
  const shapes = [circlePath(a, rA), c ? metaballNeck(a, rA, b, rB) : '', c ? circlePath(b, rB) : '']
  shapes.forEach((d, k) => {
    parts.strokes[k].setAttribute('d', d)
    parts.fills[k].setAttribute('d', d)
  })
  const glyph = clamp(1 - t * 1.8, 0, 1)
  parts.glyph.setAttribute('transform', `translate(${a.x.toFixed(2)} ${a.y.toFixed(2)}) scale(${(rA / rHome).toFixed(3)})`)
  parts.glyph.style.opacity = glyph.toFixed(3)
  parts.svg.style.setProperty('--mix', `${Math.round((1 - t) * 100)}%`)
  parts.svg.style.opacity = c ? '1' : (1 - t).toFixed(3)
  if (!blob.drawn) { blob.drawn = true; parts.svg.classList.add('is-on') }
}

function tick(f: Frame) {
  if (run) { drawIn(f); return }
  const cap = captureAt(f)
  // Named a dropped instant without moving: the cursor is right on it, so it lands there.
  if (pendingLand && !gesture.dragging) {
    const id = pendingLand
    pendingLand = null
    if (cap?.preview && cap.id === id) act.focusInstant(id)
  }
  // The same motion as the cursor's glide onto the instant (capture.ts). Now has no chip: the
  // ＋ stays out while the cursor merges into Now.
  const flow = captureFlowAt(f)
  const inChip = flow.kind === 'instant' ? flow : null
  const wantIn = cap?.kind === 'instant'
  if (!plusButton) {
    // No ＋ on screen (Now, a hidden cursor, move mode): it simply is wherever it belongs.
    blob.anchor = inChip?.id ?? null
    blob.t = inChip?.t ?? 0
    blob.chip = null
    blob.home = null
    hideBlob()
    setPlusHidden(wantIn)
    return
  }
  if ((inChip?.id ?? null) !== blob.anchor) { blob.anchor = inChip?.id ?? null; blob.chip = null; blob.home = null }
  const before = blob.t
  blob.t = inChip?.t ?? 0
  if (blob.t >= 0.97 && before < 0.97 && wantIn) absorbBump(blob.anchor)
  setPlusHidden(blob.t > 0.001 || wantIn)
  if (blob.t > 0.001 && blob.t < 0.999) drawBlob(f, blob.t)
  else {
    hideBlob()
    if (blob.t === 0 || blob.t === 1) { blob.chip = null; blob.home = null }
  }
}

/** Tap on the Cursor tag's ＋: drops an instant at the cursor and morphs the ＋ into its chip. */
export function dropFromPlus(button: HTMLElement) {
  const f = engine.sample()
  const from = reducedMotion() ? null : measure(button, f, null)
  if (run) finishIn()
  const id = act.dropAndName()
  namingId = id
  if (!from) return // no animation: the chip just appears, named in place
  ui.setPlusMorph({ id, phase: 'in' })
  setPlusHidden(true)
  run = { id, from, to: null, t0: null, waited: 0 }
  engine.requestFrame()
  engine.invalidate()
}

/** The Cursor tag's ＋ button registers itself (the morphs measure it). */
export function usePlusButton(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    if (!active) return
    const el = ref.current
    plusButton = el
    engine.invalidate()
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

/** The shell and the blob (PlusMorphLayer) attach themselves; returns the cleanup. */
export function attachMorphs(shellEl: HTMLDivElement, parts: BlobParts): () => void {
  shell = shellEl
  blobParts = parts
  timeline = shellEl.closest('.timeline')
  const off = engine.onFrame(tick)
  engine.invalidate()
  return () => {
    off()
    hideShell(false)
    hideBlob()
    if (shell === shellEl) { shell = null; blobParts = null; timeline = null }
  }
}

/** Lands on a dropped instant once it is named; drops a morph whose instant is deleted. Returns the cleanup. */
export function watchNaming(): () => void {
  const offView = useView.subscribe((s, prev) => {
    if (!namingId || s.editingInstantId === prev.editingInstantId || s.editingInstantId === namingId) return
    pendingLand = namingId
    namingId = null
    engine.invalidate()
  })
  const offEntities = useEntities.subscribe(s => {
    const m = useUi.getState().plusMorph
    if (m && !s.instants.some(i => i.id === m.id)) {
      run = null
      hideShell(false)
      ui.setPlusMorph(null)
    }
  })
  return () => { offView(); offEntities() }
}
