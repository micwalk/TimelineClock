// A button sucked into a box, like a window minimising into its dock icon (a "genie"; owner,
// 2026-11-22: a counting todo's Done goes into its checkbox). Pure: the keyframes for the Web
// Animations API from how far the box's centre is from the button's (px) and their sizes. It
// pinches first (thin across the way it goes, as if drawn through a funnel), then shrinks away
// into the box, accelerating as it goes in.

export type GenieFrame = { offset: number; transform: string; opacity: number }

export function genieKeyframes(dx: number, dy: number, from: { w: number; h: number }, to: { w: number; h: number }): GenieFrame[] {
  // How small it ends: the box's size, then a little smaller still (it disappears inside it).
  const sx = Math.max(0.02, (to.w / Math.max(1, from.w)) * 0.4)
  const sy = Math.max(0.02, (to.h / Math.max(1, from.h)) * 0.4)
  // Pinched across its path: going sideways it gets thin top to bottom, going up or down thin side to side.
  const sideways = Math.abs(dx) >= Math.abs(dy)
  const pinch = sideways ? 'scale(0.85, 0.45)' : 'scale(0.45, 0.85)'
  const at = (k: number) => `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`
  return [
    { offset: 0, transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 },
    { offset: 0.3, transform: `${at(0.08)} ${pinch}`, opacity: 1 },
    { offset: 0.75, transform: `${at(0.7)} scale(${sideways ? 0.35 : 0.2}, ${sideways ? 0.2 : 0.35})`, opacity: 0.9 },
    { offset: 1, transform: `${at(1)} scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`, opacity: 0 },
  ]
}

/** How long a genie takes (ms): a little longer the farther it goes, within the Done box's charge. */
export const genieMs = (dx: number, dy: number) => Math.round(Math.min(480, 260 + Math.hypot(dx, dy) * 0.6))
