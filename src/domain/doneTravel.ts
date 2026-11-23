// Done ahead of its time (store/actions completeTodo, components/timeline/doneTravel): the todo's
// chip travels along the timeline to Now before it pops. Pure: the motion's keyframes and length.

/** Shortest and longest trip, ms; in between it grows with the distance (px). */
export const TRAVEL_MIN_MS = 550
export const TRAVEL_MAX_MS = 1100

/** How long a trip of `distancePx` takes: a little longer the farther it goes. */
export function travelMs(distancePx: number): number {
  return Math.round(Math.min(TRAVEL_MAX_MS, Math.max(TRAVEL_MIN_MS, 450 + 0.6 * Math.abs(distancePx))))
}

/** Share of the trip spent winding up (pulled back, away from Now). */
export const WIND_UP = 0.28
/** How far it pulls back, as a share of the trip (capped in px). */
const PULL_SHARE = 0.06
const PULL_MAX_PX = 18

/**
 * The trip as Web Animations keyframes, `dx`/`dy` px to the Now line: it winds up (pulls back a
 * little and gathers itself), then swooshes there, stretched along its way mid-flight, and lands.
 */
export function travelKeyframes(dx: number, dy: number): Keyframe[] {
  const len = Math.hypot(dx, dy) || 1
  const pull = Math.min(PULL_MAX_PX, PULL_SHARE * len) / len
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const stretch = horizontal ? 'scale(1.12, 0.94)' : 'scale(0.94, 1.12)'
  return [
    { offset: 0, transform: 'translate(0px, 0px) scale(1)', easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
    { offset: WIND_UP, transform: `translate(${(-pull * dx).toFixed(1)}px, ${(-pull * dy).toFixed(1)}px) scale(0.94)`, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
    { offset: 0.8, transform: `translate(${(0.85 * dx).toFixed(1)}px, ${(0.85 * dy).toFixed(1)}px) ${stretch}`, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    { offset: 1, transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(1)` },
  ]
}
