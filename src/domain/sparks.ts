// The sparks a ✓ Done throws (docs/prd_todos.md §7.2): glowing e-confetti flung out from a point,
// falling and fading. Pure: a burst is a list of sparks (made from a seed, so tests are steady),
// and where each one is at a time since the burst.

export interface Spark {
  /** Initial velocity, px/s (y down). */
  vx: number
  vy: number
  /** Radius, px. */
  r: number
  /** Which of the burst's colours. */
  color: number
  /** Life as a share of the burst's length (some die sooner). */
  life: number
}

/** Air drag on a spark (1/s): they burst out fast and slow down. */
const DRAG = 2.2

/** A small seeded random (mulberry32), so a burst is the same for the same seed. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * `count` sparks that fly about `spread` px over `seconds`, mostly up and out (a fountain), in
 * `colors` colours.
 */
export function sparkBurst(count: number, spread: number, seconds: number, colors: number, seed = 1): Spark[] {
  const rnd = random(seed)
  const out: Spark[] = []
  for (let k = 0; k < count; k++) {
    // Up and out: within about 100° either side of straight up.
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.1
    // Fast enough that, slowed by drag, it reaches about `spread` by the end (some less, some more).
    const speed = ((spread * DRAG) / (1 - Math.exp(-DRAG * seconds))) * (0.45 + rnd() * 0.75)
    out.push({ vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 1.4 + rnd() * 2.2, color: Math.floor(rnd() * colors), life: 0.6 + rnd() * 0.4 })
  }
  return out
}

/** Where a spark is `t` s after the burst (from its origin), how opaque, and how big; null once it is gone. */
export function sparkAt(s: Spark, t: number, seconds: number, spread: number): { x: number; y: number; alpha: number; r: number } | null {
  const end = seconds * s.life
  if (t < 0 || t >= end) return null
  // Air drag slows them; gravity pulls them down as they go.
  const k = (1 - Math.exp(-DRAG * t)) / DRAG
  const gravity = (2.4 * spread) / (seconds * seconds)
  const p = t / end
  return { x: s.vx * k, y: s.vy * k + 0.5 * gravity * t * t, alpha: 1 - p * p, r: s.r * (1 - 0.5 * p) }
}
