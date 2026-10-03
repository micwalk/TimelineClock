// Pure placement math for dropdown menus: open on the side of the trigger with room,
// cap the height to that room, and keep the menu inside the viewport horizontally.

export interface MenuRect { left: number; top: number; right: number; bottom: number }
export interface MenuSize { width: number; height: number }
export interface MenuViewport { width: number; height: number }
export interface MenuPlacement {
  side: 'below' | 'above'
  /** Largest height the menu may take on the chosen side (px). */
  maxHeight: number
  /** Horizontal offset from the trigger's left edge (px). */
  shiftX: number
}

export const MENU_GAP = 8
export const MENU_MARGIN = 8

export function placeMenu(
  trigger: MenuRect,
  menu: MenuSize,
  viewport: MenuViewport,
  gap = MENU_GAP,
  margin = MENU_MARGIN,
): MenuPlacement {
  const below = Math.max(0, viewport.height - trigger.bottom - gap - margin)
  const above = Math.max(0, trigger.top - gap - margin)
  let side: 'below' | 'above'
  if (menu.height <= below) side = 'below'
  else if (menu.height <= above) side = 'above'
  else side = below >= above ? 'below' : 'above'
  const room = side === 'below' ? below : above
  const maxHeight = Math.min(menu.height, room)

  let shiftX = 0
  const right = trigger.left + menu.width
  if (right > viewport.width - margin) shiftX = viewport.width - margin - right
  if (trigger.left + shiftX < margin) shiftX = margin - trigger.left
  return { side, maxHeight, shiftX }
}
