// What the cursor is on, once per frame (domain/capture): the focused instant; or, with a free
// cursor, an instant or Now within the landing radius while a drag is held and moving slowly
// (where a slow release lands), or right under it at rest.
//
// This is the one source for everything that shows it: captureAt is the state (the tag's
// colour and time, the chip lighting up, where a release lands), and captureFlowAt the one
// motion every effect runs on: the cursor gliding onto the line, the ＋ flowing into the chip
// (plusMorph.ts), the Cursor tag merging into Now's (LiveTags.tsx). They start on the same
// frame and move together.
import type { Frame } from '../../engine/viewportEngine.ts'
import { engine, reducedMotion } from '../../engine/viewportEngine.ts'
import { dragSpeed, gesture } from '../../engine/gesture.ts'
import type { CaptureCandidate } from '../../domain/capture.ts'
import { NOW_TARGET, findCapture } from '../../domain/capture.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import type { SpringState } from '../../domain/spring.ts'
import { omegaFor, springSettled, stepSpring } from '../../domain/spring.ts'
import { clamp, smoothstep } from '../../domain/time.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { getTunables } from '../../store/settings.ts'

/** At rest only an exact hit captures, px (as for typed times and ± steps). */
export const EXACT_CAPTURE_PX = 2
/** A capture holds this much past the radius before letting go, px. */
const RELEASE_PX = 4
/**
 * A drag catches a target only moving slower than this, px/ms (or held still): a fast pan
 * sweeps past instants without tugging at each one, as a fast release would fly past it. Once
 * caught, it holds up to the faster speed.
 */
export const CAPTURE_MAX_SPEED = 0.25
const CAPTURE_HOLD_SPEED = 0.6

export interface Capture {
  /** An instant's id, or NOW_TARGET. */
  id: string
  kind: 'instant' | 'now'
  ts: number
  /** Captured by a free cursor (a preview of where it would land), not by focus. */
  preview: boolean
}

let last: { f: Frame; result: Capture | null } | null = null
let prevId: string | null = null
let candidates: { from: readonly InstantRecord[]; list: CaptureCandidate[] } | null = null
const candidatesOf = (instants: readonly InstantRecord[]) => {
  if (candidates?.from !== instants) candidates = { from: instants, list: instants.map(i => ({ id: i.id, ts: i.tsEpochMs, hidden: i.hidden })) }
  return candidates.list
}

export function captureAt(f: Frame): Capture | null {
  if (last && last.f === f) return last.result
  const v = useView.getState()
  const { instants } = useEntities.getState()
  let result: Capture | null = null
  if (!v.moveMode && v.viewFocusMode === 'instant' && v.focusedInstantId) {
    const inst = instants.find(i => i.id === v.focusedInstantId)
    if (inst) result = { id: inst.id, kind: 'instant', ts: inst.tsEpochMs, preview: false }
  } else if (!v.moveMode && v.viewFocusMode === 'cursor') {
    const t = getTunables()
    const speed = gesture.dragging ? dragSpeed() : 0
    const slow = speed < (prevId ? CAPTURE_HOLD_SPEED : CAPTURE_MAX_SPEED)
    const radiusPx = !gesture.dragging ? EXACT_CAPTURE_PX : slow ? (gesture.touch ? t.landingTouchPx : t.landingMousePx) : 0
    const id = radiusPx <= 0 ? null : findCapture({
      instants: candidatesOf(instants), now: f.now,
      center: f.center, pxPerMs: f.pxPerMs, radiusPx, prevId, releasePx: gesture.dragging ? RELEASE_PX : 0,
    })
    if (id === NOW_TARGET) result = { id, kind: 'now', ts: f.now, preview: true }
    else {
      const inst = id ? instants.find(i => i.id === id) : undefined
      if (inst) result = { id: inst.id, kind: 'instant', ts: inst.tsEpochMs, preview: true }
    }
  }
  prevId = result?.id ?? null
  last = { f, result }
  return result
}

// ---------------------------------------------------------------------------
// The motion: one spring from away (0) to merged (1).

/** Away to merged (or back), ms to settle. */
export const CAPTURE_FLOW_MS = 320
const OMEGA_FLOW = omegaFor(CAPTURE_FLOW_MS)
/** The cursor leans onto a target's line only this near; past it the lean fades out, px. */
const LEAN_FULL_PX = 16
const LEAN_NONE_PX = 36

export interface CaptureFlow {
  /** What the cursor is merged with or flowing to or from: an instant's id or NOW_TARGET; null at home. */
  id: string | null
  kind: 'instant' | 'now' | null
  /** Its time this frame (Now's moves). */
  ts: number
  /** 0 = away (the ＋ at home, the tag on the cursor's line), 1 = merged. */
  t: number
  /** The eased progress every effect uses (smoothstep of t). */
  s: number
  /** How far the cursor's line leans onto the target's this frame, px along the time axis. */
  lean: number
}

const NO_FLOW: CaptureFlow = { id: null, kind: null, ts: 0, t: 0, s: 0, lean: 0 }
const flow = { id: null as string | null, t: { x: 0, v: 0 } as SpringState, perf: NaN, engaged: false }
let lastFlow: { f: Frame; result: CaptureFlow } | null = null

const tsOf = (id: string, f: Frame): number | null =>
  id === NOW_TARGET ? f.now : useEntities.getState().instants.find(i => i.id === id)?.tsEpochMs ?? null

/** Starts the motion already merged with `id` (the ＋ just became its chip: no flowing in again). */
export function settleCaptureFlow(id: string) {
  flow.id = id
  flow.t = { x: 1, v: 0 }
  flow.engaged = true
}

/** The capture motion for this frame (stepped once per frame, whoever asks first). */
export function captureFlowAt(f: Frame): CaptureFlow {
  if (lastFlow && lastFlow.f === f) return lastFlow.result
  const cap = captureAt(f)
  const want = cap?.id ?? null
  // From one target to the next while merged (Previous, Next) it stays merged: no trip out and back.
  if (want && flow.id !== want && (flow.t.x > 0.5 || !flow.id)) { flow.id = want; flow.engaged = !!cap?.preview }
  // The cursor leans only toward a target a free cursor caught (and keeps to it as it lands there).
  else if (want && want === flow.id && cap?.preview) flow.engaged = true
  const target = want && want === flow.id ? 1 : 0
  if (reducedMotion()) flow.t = { x: target, v: 0 }
  else {
    // A spring at rest may not have ticked for a while (idle frames are sparse): start it gently.
    const dt = Number.isNaN(flow.perf) ? 16 : clamp(f.perf - flow.perf, 0, 32)
    flow.t = stepSpring(flow.t, target, dt, OMEGA_FLOW)
    if (springSettled(flow.t, target, 0.002)) flow.t = { x: target, v: 0 }
    else engine.requestFrame()
  }
  flow.perf = f.perf
  // Back away: free to flow into whatever captures the cursor next.
  if (flow.t.x === 0 && flow.id !== want) { flow.id = want; flow.engaged = !!cap?.preview }
  const ts = flow.id ? tsOf(flow.id, f) : null
  let result = NO_FLOW
  if (flow.id && ts !== null) {
    const t = flow.t.x
    const s = smoothstep(0, 1, t)
    const d = f.pos(ts) - f.mainSize / 2
    const lean = flow.engaged ? d * s * (1 - smoothstep(LEAN_FULL_PX, LEAN_NONE_PX, Math.abs(d))) : 0
    result = { id: flow.id, kind: flow.id === NOW_TARGET ? 'now' : 'instant', ts, t, s, lean }
  }
  lastFlow = { f, result }
  return result
}
