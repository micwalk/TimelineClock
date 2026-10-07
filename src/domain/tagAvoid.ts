// How the Cursor tag keeps clear of the Now tag: a continuous function of how far the cursor
// is from Now along the time axis, so the tag moves with the pan itself (no snap points, no
// hysteresis). Pure.
//
// Horizontal: both tags sit above the axis, so the Cursor tag rises and arcs over Now's: from
// a ramp's distance away it starts to rise, it is just clear of Now's box when the two would
// touch, and it crests over Now's line.
//
// Vertical: both tags sit left of the axis along the time axis, so the Now tag pushes the
// Cursor tag away along it, keeping it just clear. Crossing Now's line flips the side it is
// pushed to: the one discontinuity, hidden by the cursor merging into Now there (capture), or
// eased over when a fast pan sweeps past without merging.

/** A tag's box, px: `main` along the time axis, `cross` across it. */
export interface TagSize { main: number; cross: number }

/** Room kept between the two boxes, px. */
export const TAG_GAP = 6
/** Horizontal: how far before touching the Cursor tag starts to rise, px along the time axis. */
export const LIFT_RAMP = 64
/** Horizontal: how much higher than clear it crests over Now's line, px (the arc's top). */
export const LIFT_CREST = 10
/** Vertical: how soft the push's onset is, px. */
const PUSH_SOFT = 14

const smootherstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Horizontal: how far the Cursor tag rises, px, at `d` px from Now along the time axis. Both
 * boxes rest on the same line above the axis; the Cursor tag is lifted clear of Now's
 * (Now's height plus the gap) wherever their widths would overlap, crests `LIFT_CREST`
 * higher over Now's line, and eases in and out over `LIFT_RAMP` beyond. Smooth (C1).
 */
export function cursorLift(d: number, now: TagSize, cursor: TagSize): number {
  const touch = (now.main + cursor.main) / 2 + TAG_GAP
  const clear = now.cross + TAG_GAP
  const a = Math.abs(d)
  if (a <= touch) {
    const x = a / touch
    return clear + LIFT_CREST * (1 - x * x) * (1 - x * x)
  }
  return clear * (1 - smootherstep((a - touch) / LIFT_RAMP))
}

/** A smooth max(a, b): equal to it more than `k` apart, rounded within (C1). */
export function smoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.max(a, b) + (h * h * k) / 4
}

/**
 * Vertical: how far along the time axis the Cursor tag is pushed, px (signed, away from Now), at
 * `d` px from Now (cursor minus Now). Zero far away; the boxes keep `TAG_GAP` apart as they
 * meet, the push easing in over `PUSH_SOFT`. At d = 0 it flips sides.
 */
export function cursorPush(d: number, now: TagSize, cursor: TagSize): number {
  const clear = (now.main + cursor.main) / 2 + TAG_GAP
  const push = smoothMax(0, clear - Math.abs(d), PUSH_SOFT)
  return d < 0 ? -push : push
}
