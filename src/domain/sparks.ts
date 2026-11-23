// The confetti a ✓ Done throws (docs/prd_todos.md §7.2, domain/doneBurst): glowing green cards
// flung out all around from the box, tumbling, falling and fading. Pure: a burst is a list of
// sparks (made from a seed, so tests are steady), and where each one is at a time since the burst.
import { seeded } from './doneBurst.ts'

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
  /** Its turn at the start (radians) and how fast it tumbles (radians/s): confetti is a little card. */
  angle: number
  spin: number
}

/** Air drag on a spark (1/s): they burst out fast and slow down. */
const DRAG = 2.2

/**
 * `count` pieces of confetti thrown out all around from a box `half` px from its centre to its
 * edge (owner, 2026-11-22: as fast as the ✓ springs out, but they keep going), a little more
 * upward than down, flying about `spread` px over `seconds` before gravity takes them.
 */
export function confettiBurst(count: number, spread: number, seconds: number, colors: number, seed = 1): Spark[] {
  const rnd = seeded(seed)
  const out: Spark[] = []
  for (let k = 0; k < count; k++) {
    const angle = rnd() * Math.PI * 2
    // Fast enough that, slowed by drag, it reaches about `spread` by the end (some less, some more).
    const speed = ((spread * DRAG) / (1 - Math.exp(-DRAG * seconds))) * (0.45 + rnd() * 0.75)
    out.push({
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - speed * 0.25,
      r: 1.4 + rnd() * 2.2,
      color: Math.floor(rnd() * colors),
      life: 0.6 + rnd() * 0.4,
      angle,
      spin: (rnd() - 0.5) * 24,
    })
  }
  return out
}

/** Where a spark is `t` s after the burst (from its origin), how opaque, and how big; null once it is gone. */
export function sparkAt(s: Spark, t: number, seconds: number, spread: number): { x: number; y: number; alpha: number; r: number; turn: number } | null {
  const end = seconds * s.life
  if (t < 0 || t >= end) return null
  // Air drag slows them; gravity pulls them down as they go.
  const k = (1 - Math.exp(-DRAG * t)) / DRAG
  const gravity = (2.4 * spread) / (seconds * seconds)
  const p = t / end
  return { x: s.vx * k, y: s.vy * k + 0.5 * gravity * t * t, alpha: 1 - p * p, r: s.r * (1 - 0.5 * p), turn: s.angle + s.spin * t }
}
