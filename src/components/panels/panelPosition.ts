// Where the settings popover goes relative to its gear, and how tall it may be.
import type { CSSProperties } from 'react'

export const PANEL_GAP = 8
export const PANEL_EST_HEIGHT = 420

interface GearRect { top: number; bottom: number; right: number }

/** Places the panel under the gear, or above it when there isn't room below; caps its height to the space available. */
export function panelPosition(r: GearRect, viewportWidth: number, viewportHeight: number): CSSProperties {
  const right = Math.max(8, viewportWidth - r.right)
  if (viewportHeight - r.bottom >= PANEL_EST_HEIGHT + PANEL_GAP) {
    const top = r.bottom + PANEL_GAP
    return { right, top, maxHeight: viewportHeight - top - PANEL_GAP }
  }
  return { right, bottom: viewportHeight - r.top + PANEL_GAP, maxHeight: r.top - 2 * PANEL_GAP }
}
