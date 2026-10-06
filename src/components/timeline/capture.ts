// The instant the cursor is on, or about to land on, once per frame (domain/capture): the
// focused instant; or, with a free cursor, one within the landing radius while a drag is held
// and moving slowly (a slow release snaps onto it), or right under the cursor at rest. The Cursor tag glides onto
// it, its chip lights up, and the ＋ flows into it (plusMorph.ts).
import type { Frame } from '../../engine/viewportEngine.ts'
import { dragSpeed, gesture } from '../../engine/gesture.ts'
import type { CaptureCandidate } from '../../domain/capture.ts'
import { findCapture } from '../../domain/capture.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { useEntities } from '../../store/entities.ts'
import { useView } from '../../store/view.ts'
import { getTunables } from '../../store/settings.ts'

/** At rest only an exact hit captures, px (as for typed times and ± steps). */
export const EXACT_CAPTURE_PX = 2
/** A capture holds this much past the radius before letting go, px. */
const RELEASE_PX = 4
/**
 * A drag catches an instant only moving slower than this, px/ms (or held still): a fast pan
 * sweeps past instants without tugging at each one, as a fast release would fly past it. Once
 * caught, it holds up to the faster speed.
 */
export const CAPTURE_MAX_SPEED = 0.25
const CAPTURE_HOLD_SPEED = 0.6

export interface Capture {
  id: string
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
    if (inst) result = { id: inst.id, ts: inst.tsEpochMs, preview: false }
  } else if (!v.moveMode && v.viewFocusMode === 'cursor') {
    const t = getTunables()
    const speed = gesture.dragging ? dragSpeed() : 0
    const slow = speed < (prevId ? CAPTURE_HOLD_SPEED : CAPTURE_MAX_SPEED)
    const radiusPx = !gesture.dragging ? EXACT_CAPTURE_PX : slow ? (gesture.touch ? t.landingTouchPx : t.landingMousePx) : 0
    const id = radiusPx <= 0 ? null : findCapture({
      instants: candidatesOf(instants),
      center: f.center, pxPerMs: f.pxPerMs, radiusPx, prevId, releasePx: gesture.dragging ? RELEASE_PX : 0,
    })
    const inst = id ? instants.find(i => i.id === id) : undefined
    if (inst) result = { id: inst.id, ts: inst.tsEpochMs, preview: true }
  }
  prevId = result?.id ?? null
  last = { f, result }
  return result
}
