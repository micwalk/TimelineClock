// Which way the timeline runs and where the Agenda goes, from the window size,
// the user's settings and session overrides (rotate button, Agenda toggle).
// Overrides last until the screen's shape class changes (phone turned, window
// resized past the threshold); then the settings apply again.

export type Orientation = 'horizontal' | 'vertical'
export type OrientationSetting = 'auto' | Orientation
export type ShapeClass = 'portrait' | 'landscape'

export type AgendaPlacement = 'bottom' | 'side' | 'drawer'
export type AgendaChoice = 'docked' | 'drawer'
export type AgendaSetting = 'auto' | AgendaChoice

export interface OrientationOverride {
  orientation: Orientation
  /** Shape class when the override was made. */
  shape: ShapeClass
}

export interface AgendaOverride {
  placement: AgendaChoice
  shape: ShapeClass
}

/**
 * Portrait when the window is taller than wide. With a previous class, switching
 * needs one side to be (1 + hysteresis)× the other, so a near-square window
 * doesn't flip back and forth while it is resized.
 */
export function shapeClass(w: number, h: number, previous: ShapeClass | null, hysteresis: number): ShapeClass {
  if (previous === null) return h > w ? 'portrait' : 'landscape'
  const k = 1 + hysteresis
  if (previous === 'portrait') return w >= h * k ? 'landscape' : 'portrait'
  return h >= w * k ? 'portrait' : 'landscape'
}

/** The rotate button's override wins while the shape is unchanged; otherwise the setting (Auto: time runs along the longer side). */
export function resolveOrientation(setting: OrientationSetting, override: OrientationOverride | null, shape: ShapeClass): Orientation {
  if (override && override.shape === shape) return override.orientation
  if (setting !== 'auto') return setting
  return shape === 'portrait' ? 'vertical' : 'horizontal'
}

/**
 * Dock when there is room, otherwise the drawer: horizontal docks at the bottom
 * when tall enough, vertical docks at the side when wide enough. Choosing
 * "docked" on a screen without room still gives the drawer.
 */
export function resolveAgendaPlacement(
  orientation: Orientation,
  setting: AgendaSetting,
  override: AgendaOverride | null,
  shape: ShapeClass,
  w: number,
  h: number,
  limits: { sideDockMinWidthPx: number; bottomDockMinHeightPx: number },
): AgendaPlacement {
  const want = override && override.shape === shape ? override.placement : setting
  if (want === 'drawer') return 'drawer'
  if (orientation === 'horizontal') return h >= limits.bottomDockMinHeightPx ? 'bottom' : 'drawer'
  return w >= limits.sideDockMinWidthPx ? 'side' : 'drawer'
}
