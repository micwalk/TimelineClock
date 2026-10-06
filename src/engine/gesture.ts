// Whether a drag is being held on the timeline (touch or a mouse), and how fast it is moving.
// Set by usePanZoom; frame listeners read it (the cursor's capture preview shows only while a
// drag is held, slowly, over an instant).
import { engine } from './viewportEngine.ts'

export const gesture = {
  dragging: false,
  touch: false,
  /** Smoothed drag speed along the time axis, px/ms. */
  speed: 0,
  /** performance.now() of the last drag movement. */
  lastMove: 0,
}

/** A finger held still sends no moves: after this long, the drag counts as stopped, ms. */
const STILL_MS = 80

export function setDragging(dragging: boolean, touch = gesture.touch) {
  if (gesture.dragging === dragging && gesture.touch === touch) return
  gesture.dragging = dragging
  gesture.touch = touch
  gesture.speed = 0
  gesture.lastMove = performance.now()
  engine.invalidate()
}

/** A drag moved by `dPx` along the time axis. */
export function noteDragMove(dPx: number) {
  const t = performance.now()
  const dt = Math.max(1, t - gesture.lastMove)
  const v = Math.abs(dPx) / dt
  // Smoothed over a few moves, so one jittery event doesn't count.
  gesture.speed = gesture.speed * 0.6 + v * 0.4
  gesture.lastMove = t
}

/** The drag's speed now, px/ms: 0 once the finger has been still a moment. */
export const dragSpeed = (now = performance.now()): number => (now - gesture.lastMove > STILL_MS ? 0 : gesture.speed)
