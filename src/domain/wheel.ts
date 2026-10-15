// What a wheel event does to the timeline, the same in both orientations: the wheel zooms,
// Shift+wheel pans along the time axis, Ctrl+wheel (and a trackpad pinch, which arrives as
// ctrl+wheel) zooms. A sideways swipe or tilt pans in horizontal, where sideways is the
// time axis. Deltas are in pixels (the caller scales line/page modes).

export interface WheelInput {
  dx: number
  dy: number
  ctrl: boolean
  shift: boolean
  vertical: boolean
}

export interface WheelEffect {
  /** Pixels to zoom by (positive zooms out), 0 for none. */
  zoom: number
  /** Pixels to pan along the time axis, 0 for none. */
  pan: number
}

export function wheelEffect({ dx, dy, ctrl, shift, vertical }: WheelInput): WheelEffect {
  if (ctrl) return { zoom: dy, pan: 0 }
  // Browsers turn Shift+wheel into a sideways scroll (deltaX) on some systems and not others.
  if (shift) return { zoom: 0, pan: dy !== 0 ? dy : dx }
  return { zoom: dy, pan: vertical ? 0 : dx }
}
