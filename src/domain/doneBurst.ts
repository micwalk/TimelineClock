// The ✓ Done animation (owner, 2026-11-22), drawn by components/timeline/Celebration on one
// short-lived canvas over the box that was tapped. Pure: where everything is at a time.
//
// Two phases. The charge (the tap's anticipation, `chargeS` long): glowing motes rush in from
// outside onto the box's border, brightening as they near it; the border glows more and more, the
// box's middle fills until it is opaque, and the box shrinks a little and turns green. Then it
// pops (the todo is done then): the box is green, its fill turns into a green ✓ that springs out
// past the box and back, the box springs back to size, and green confetti flies out (domain/sparks)
// and keeps going, falling and fading. With no charge (`chargeS` 0) it starts at the pop.

/** The box that was tapped, on screen (px, from the viewport's top left). */
export interface DoneOrigin {
  /** Its centre. */
  x: number
  y: number
  /** Its side and corner radius. */
  size: number
  radius: number
  /** Its colour before it greens (a CSS colour). */
  color: string
  /** Whether to draw the box (a Done button that isn't a box gets only the ✓ and the confetti). */
  box: boolean
}

/** Times of a Done animation, seconds. */
export interface DoneTiming {
  /** The charge before the pop (0: none). */
  chargeS: number
  /** From the pop until the box and its ✓ have faded out. */
  popS: number
}

/** The box at a time: sizes as a share of the box's own, colours as a share of green. */
export interface DoneBox {
  /** The box's scale (shrinks while charging, springs back on the pop). */
  scale: number
  /** How much its border glows (1 = the usual glow). */
  glow: number
  /** How opaque its fill is (0–1). */
  fill: number
  /** How green it is (0 = its own colour, 1 = green). */
  green: number
  /** The ✓'s scale (0 = none yet); it overshoots past 1 and springs back. */
  check: number
  /** The whole box's opacity (it fades out at the end). */
  alpha: number
}

/** Smoothstep from `a` to `b`. */
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/**
 * An underdamped spring from `x0` toward 1, started with velocity `v0` (per s): `omega` its
 * natural frequency (rad/s), `zeta` its damping (< 1, so it overshoots).
 */
export function springTo1(x0: number, v0: number, omega: number, zeta: number, t: number): number {
  if (t <= 0) return x0
  const wd = omega * Math.sqrt(1 - zeta * zeta)
  const a = x0 - 1
  const b = (v0 + zeta * omega * a) / wd
  return 1 + Math.exp(-zeta * omega * t) * (a * Math.cos(wd * t) + b * Math.sin(wd * t))
}

/** How small the box gets at the end of the charge. */
export const CHARGE_SCALE = 0.86
/** The ✓'s spring: from a fifth of its size it shoots out to about 1.9× by ~0.1 s, then settles. */
const CHECK_SPRING = { x0: 0.2, v0: 35, omega: 18, zeta: 0.4 }
/** The fill turns into the ✓ this fast (s). */
const FILL_TO_CHECK_S = 0.14
/** The last stretch of `popS` over which the box fades out (s). */
const FADE_S = 0.3

/** The box `t` s after the tap (the pop at `chargeS`); null once it is gone. */
export function doneBoxAt(t: number, timing: DoneTiming): DoneBox | null {
  const { chargeS, popS } = timing
  if (t < 0 || t >= chargeS + popS) return null
  if (t < chargeS) {
    const p = t / chargeS
    return {
      scale: 1 - (1 - CHARGE_SCALE) * smooth(0, 1, p),
      glow: 1 + 2.5 * p,
      fill: smooth(0.1, 1, p),
      green: 0.75 * p * p,
      check: 0,
      alpha: 1,
    }
  }
  const q = t - chargeS
  const settle = Math.min(1, q / 0.6)
  return {
    // From the charge's size (or full size, with no charge) back to 1 with a little bounce.
    scale: springTo1(chargeS > 0 ? CHARGE_SCALE : 1, chargeS > 0 ? 3 : 0, 22, 0.35, q),
    glow: 3.5 - 2.2 * settle,
    fill: 1 - smooth(0, FILL_TO_CHECK_S, q),
    green: 1,
    check: Math.max(0, springTo1(CHECK_SPRING.x0, CHECK_SPRING.v0, CHECK_SPRING.omega, CHECK_SPRING.zeta, q)),
    alpha: 1 - smooth(popS - FADE_S, popS, q),
  }
}

/** A mote rushing in during the charge. */
export interface Mote {
  /** Where it comes from (radians, 0 = right, y down). */
  angle: number
  /** How far out it starts, as a share of the inflow distance. */
  reach: number
  /** When it sets off and arrives, as shares of the charge. */
  from: number
  to: number
  /** Its swirl (radians it turns on the way in; either way). */
  swirl: number
  /** Radius at the border, px. */
  r: number
}

/** A small seeded random (mulberry32), so a burst is the same for the same seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `count` motes, all around, setting off through the first 60% of the charge, all in by its end. */
export function inflow(count: number, seed = 1): Mote[] {
  const rnd = seeded(seed)
  const out: Mote[] = []
  for (let k = 0; k < count; k++) {
    const from = rnd() * 0.6
    const to = Math.min(1, from + 0.3 + rnd() * 0.15)
    out.push({ angle: rnd() * Math.PI * 2, reach: 0.6 + rnd() * 0.6, from, to, swirl: (rnd() - 0.5) * 1.2, r: 1.2 + rnd() * 1.3 })
  }
  return out
}

/**
 * Where a mote is at charge progress `p` (0–1), from the box's centre: it starts `reach × dist`
 * px beyond the border (`half` px out) and speeds up as it comes in, turning by its swirl, brighter
 * and bigger as it nears the border; null before it sets off and once it has arrived.
 */
export function moteAt(m: Mote, p: number, half: number, dist: number): { x: number; y: number; alpha: number; r: number } | null {
  if (p < m.from || p >= m.to) return null
  const u = (p - m.from) / (m.to - m.from)
  const e = u * u * u // rushing in: slow far out, fast at the end
  const d = half + m.reach * dist * (1 - e)
  const a = m.angle + m.swirl * (1 - e)
  return { x: Math.cos(a) * d, y: Math.sin(a) * d, alpha: Math.min(1, u * 3) * (0.35 + 0.65 * e), r: m.r * (0.6 + 0.6 * e) }
}

/** The ✓'s stroke in the box's own units (the box spans -0.5…0.5), as in components/common/TodoIcons. */
export const CHECK_POINTS: readonly (readonly [number, number])[] = [[-0.27, 0.027], [-0.081, 0.216], [0.284, -0.189]]
