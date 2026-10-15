// A lane that changes sides (a span to Now stopped: the same record, now saved) glides from
// where it was instead of jumping. Actions note the lane before the change (noteLaneFlow, which
// reads where its layers are); the lane, re-rendered on its new side, plays the difference back
// (playLaneFlow, a FLIP on its layers, which the engine never transforms). Lanes settle over
// more than one commit (the live band shrinks after its slots are let go, moving the saved lanes
// up), so while it flows each later move of the lane adds a correction on top (followLaneFlow)
// and the glide ends where the lane settles. All read layout in commits, never in a frame listener.
import { reducedMotion } from './viewportEngine.ts'

/** A lane's flow to its new side, ms. */
export const LANE_FLOW_MS = 420
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/** A noted lane not played back this soon (it never moved) is dropped, ms. */
const PENDING_MS = 1000

const layers = new Map<string, HTMLElement[]>()
/** Where a layer is laid out (offsets ignore the glide's own transform; live and saved lanes share a parent). */
interface Spot { left: number; top: number }
const spot = (el: HTMLElement): Spot => ({ left: el.offsetLeft, top: el.offsetTop })

const pending = new Map<string, { at: number; rects: Spot[] }>()
/** Lanes flowing now: where each layer was last measured, and when the flow ends. */
const flowing = new Map<string, { until: number; rects: Spot[] }>()

/** A lane's layers (its bar's and its chip's), by lane key; returns the unregister. */
export function registerLaneLayers(key: string, els: HTMLElement[]): () => void {
  layers.set(key, els)
  return () => { if (layers.get(key) === els) layers.delete(key) }
}

/** Where the lane `key` is now, before an action moves it to the other side. */
export function noteLaneFlow(key: string) {
  const els = layers.get(key)
  if (!els || reducedMotion()) return
  pending.set(key, { at: performance.now(), rects: els.map(spot) })
}

/** Moves each layer by where it was minus where it is, easing back to nothing over `ms`. */
function glideFrom(els: HTMLElement[], from: Spot[], ms: number, composite: CompositeOperation): Spot[] {
  return els.map((el, i) => {
    const to = spot(el)
    const dx = from[i].left - to.left
    const dy = from[i].top - to.top
    if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
      el.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: ms, easing: EASING, composite })
    }
    return to
  })
}

/** Plays a noted lane's move from where it was (call once it is in its new place). */
export function playLaneFlow(key: string) {
  const noted = pending.get(key)
  const els = layers.get(key)
  pending.delete(key)
  if (!noted || !els || performance.now() - noted.at > PENDING_MS) return
  flowing.set(key, { until: performance.now() + LANE_FLOW_MS, rects: glideFrom(els, noted.rects, LANE_FLOW_MS, 'replace') })
}

/** A flowing lane moved again (call on each of its commits): the glide takes the move in, no jump. */
export function followLaneFlow(key: string) {
  const flow = flowing.get(key)
  if (!flow) return
  const els = layers.get(key)
  const left = flow.until - performance.now()
  if (!els || left <= 0) { flowing.delete(key); return }
  flow.rects = glideFrom(els, flow.rects, left, 'add')
}
