// Critically damped springs for on-screen motion: chips gliding out of each other's way,
// a pill growing from a button. Pure: state in, state out. The exact solution is used,
// so a long frame (or a tab coming back) never overshoots or blows up.

export interface SpringState {
  /** Current value. */
  x: number
  /** Current velocity, units per ms. */
  v: number
}

/**
 * Advances a critically damped spring toward `target` by `dtMs`. `omega` (per ms) sets the
 * speed: the spring covers ~95% of the way in about 4.7 / omega ms.
 */
export function stepSpring(s: SpringState, target: number, dtMs: number, omega: number): SpringState {
  if (!(dtMs > 0)) return s
  const d0 = s.x - target
  const a = s.v + omega * d0
  const e = Math.exp(-omega * dtMs)
  return { x: target + (d0 + a * dtMs) * e, v: (s.v - omega * a * dtMs) * e }
}

/** Close enough to rest that drawing more frames would change nothing visible. */
export const springSettled = (s: SpringState, target: number, eps = 0.05): boolean =>
  Math.abs(s.x - target) < eps && Math.abs(s.v) < eps / 16

/** omega for a spring that settles (95%) in about `ms`. */
export const omegaFor = (ms: number): number => 4.7 / Math.max(1, ms)
