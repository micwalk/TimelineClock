export type Orientation = 'horizontal' | 'vertical'
export type ShapeClass = 'portrait' | 'landscape'
export type AgendaPlacement = 'bottom' | 'side' | 'drawer'

export function shapeClass(
  w: number,
  h: number,
  previous: ShapeClass | null,
  hysteresis = 0.1,
): ShapeClass {
  if (previous === null) return h > w ? 'portrait' : 'landscape'
  const k = 1 + hysteresis
  if (previous === 'portrait') return w >= h * k ? 'landscape' : 'portrait'
  return h >= w * k ? 'portrait' : 'landscape'
}

export function resolveOrientation(
  setting: 'auto' | Orientation,
  override: { orientation: Orientation; shape: ShapeClass } | null,
  shape: ShapeClass,
): Orientation {
  if (setting !== 'auto') return setting
  if (override && override.shape === shape) return override.orientation
  return shape === 'portrait' ? 'vertical' : 'horizontal'
}

export function resolveAgendaPlacement(
  orientation: Orientation,
  setting: 'auto' | 'docked' | 'drawer',
  override: { placement: 'docked' | 'drawer'; shape: ShapeClass } | null,
  shape: ShapeClass,
  w: number,
  h: number,
  t: { sideDockMinWidthPx: number; bottomDockMinHeightPx: number },
): AgendaPlacement {
  let want: 'auto' | 'docked' | 'drawer' = setting
  if (override && override.shape === shape) want = override.placement
  if (want === 'drawer') return 'drawer'
  if (orientation === 'horizontal') return h >= t.bottomDockMinHeightPx ? 'bottom' : 'drawer'
  return w >= t.sideDockMinWidthPx ? 'side' : 'drawer'
}
