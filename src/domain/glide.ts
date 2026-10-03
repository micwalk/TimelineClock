export interface PointerSample { t: number; pos: number }

/** Release velocity in px/ms from samples within windowMs of release; 0 if still for stillMs. */
export function releaseVelocity(samples: PointerSample[], releaseT: number, opts: { windowMs: number; stillMs: number }): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  if (releaseT - last.t > opts.stillMs) return 0
  const recent = samples.filter(s => releaseT - s.t <= opts.windowMs)
  if (recent.length < 2) return 0
  const first = recent[0]
  const dt = last.t - first.t
  return dt <= 0 ? 0 : (last.pos - first.pos) / dt
}

export const shouldGlide = (v: number, minSpeed: number): boolean => Math.abs(v) >= minSpeed

export function stepGlide(v: number, dtMs: number, tauMs: number, maxSpeed: number): { v: number; dPos: number } {
  const v0 = Math.max(-maxSpeed, Math.min(maxSpeed, v))
  const decay = Math.exp(-dtMs / tauMs)
  return { v: v0 * decay, dPos: v0 * tauMs * (1 - decay) }
}
