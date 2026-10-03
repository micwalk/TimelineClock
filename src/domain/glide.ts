// Momentum ("glide") after a flicked drag. Pure: the gesture hook samples the
// pointer and runs the steps from engine frames.

export interface PointerSample {
  /** performance.now() of the event. */
  t: number
  /** Pointer position along the timeline's main axis, in px. */
  pos: number
}

/**
 * Velocity at release in px/ms: the least-squares slope of the samples within
 * `windowMs` of release, which smooths finger jitter. Zero when the pointer was
 * still for more than `stillMs` before release (a deliberate stop doesn't glide).
 */
export function releaseVelocity(samples: readonly PointerSample[], releaseT: number, opts: { windowMs: number; stillMs: number }): number {
  const last = samples[samples.length - 1]
  if (!last || releaseT - last.t > opts.stillMs) return 0
  const recent = samples.filter(s => releaseT - s.t <= opts.windowMs)
  if (recent.length < 2) return 0
  const n = recent.length
  const meanT = recent.reduce((sum, s) => sum + s.t, 0) / n
  const meanPos = recent.reduce((sum, s) => sum + s.pos, 0) / n
  let cov = 0
  let varT = 0
  for (const s of recent) {
    cov += (s.t - meanT) * (s.pos - meanPos)
    varT += (s.t - meanT) ** 2
  }
  return varT > 0 ? cov / varT : 0
}

export const shouldGlide = (v: number, minSpeed: number): boolean => Math.abs(v) >= minSpeed

/**
 * Advances a glide by `dtMs` with exponential friction (time constant `tauMs`).
 * Returns the new velocity and the distance covered, integrated exactly so the
 * glide doesn't depend on the frame rate.
 */
export function stepGlide(v: number, dtMs: number, tauMs: number, maxSpeed: number): { v: number; dPos: number } {
  const v0 = Math.max(-maxSpeed, Math.min(maxSpeed, v))
  const decay = Math.exp(-dtMs / tauMs)
  return { v: v0 * decay, dPos: v0 * tauMs * (1 - decay) }
}
