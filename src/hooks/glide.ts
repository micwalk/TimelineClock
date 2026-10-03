// Momentum controller: after a flicked drag, keeps panning from engine frames with
// decaying velocity, then lets the cursor land (Now / instant / tick) where it rests.
// Per-frame values live here, never in React state.
import { stepGlide } from '../domain/glide.ts'
import { engine } from '../engine/viewportEngine.ts'
import { endPan, panByPixels } from '../store/actions.ts'
import { getTunables } from '../store/settings.ts'

export interface GlideController {
  /** Starts gliding at `v` px/ms (signed, along the main axis); replaces any glide in progress. */
  start(v: number, landingPx: number): void
  /** Stops without landing. Returns whether a glide was running. */
  stop(): boolean
  readonly active: boolean
}

export function createGlide(): GlideController {
  let unsubscribe: (() => void) | null = null

  const stop = () => {
    if (!unsubscribe) return false
    unsubscribe()
    unsubscribe = null
    return true
  }

  const start = (v0: number, landingPx: number) => {
    stop()
    let v = v0
    let last = performance.now()
    unsubscribe = engine.onFrame(() => {
      const t = getTunables()
      const now = performance.now()
      const step = stepGlide(v, now - last, t.glideTauMs, t.glideMaxSpeed)
      last = now
      v = step.v
      panByPixels(step.dPos)
      if (Math.abs(v) < t.glideStopSpeed) {
        stop()
        endPan(landingPx)
      } else {
        engine.requestFrame()
      }
    })
    engine.requestFrame()
    engine.invalidate()
  }

  return { start, stop, get active() { return unsubscribe !== null } }
}
