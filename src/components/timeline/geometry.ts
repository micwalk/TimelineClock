// Where things sit across the timeline, in px from its top edge. The Timeline writes
// these onto its element as CSS custom properties (--tl-<name>), so the stylesheet
// and the lane math in JS share one source. Colors and glows stay in theme.css.
import type { CSSProperties } from 'react'

export const GEOMETRY = {
  /** The axis line. */
  axis: 112,
  /** Arrowhead height; live tag boxes sit just above it. */
  tagArrow: 14,
  /** Distance between the two live tag slots. */
  tagSlot: 48,
  /** Main-axis distance under which the Now and Cursor tags would overlap. */
  tagClearance: 100,
  /** Top of the first saved chip row, and the row pitch. */
  chipTop: 128,
  chipRow: 34,
  /** Where bottom lanes start: one chip row plus a gap (the overlap layout adds rows in phase 3). */
  lanes: 128 + 34 + 14,
} as const

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** Custom properties for the .timeline element: --tl-axis, --tl-tag-arrow, … */
export const geometryStyle = Object.fromEntries(
  Object.entries(GEOMETRY).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`]),
) as CSSProperties

/** Vertical center of the first bottom lane's band starts here. */
export const lanesTop = (): number => GEOMETRY.lanes
