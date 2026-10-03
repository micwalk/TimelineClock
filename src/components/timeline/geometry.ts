// Where things sit across the timeline, in px from its top edge. The Timeline writes
// these onto its element as CSS custom properties (--tl-<name>), so the stylesheet
// and the lane math in JS share one source. Colors and glows stay in theme.css.
import type { CSSProperties } from 'react'

export const GEOMETRY = {
  /** The axis line. */
  axis: 124,
  /** Arrowhead height; live tag boxes sit just above it. */
  tagArrow: 14,
  /** Distance between the two live tag slots. */
  tagSlot: 48,
  /** Main-axis distance under which the Now and Cursor tags would overlap. */
  tagClearance: 100,
  /** Top of the first saved chip row, and the row pitch. */
  chipTop: 140,
  chipRow: 34,
} as const

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** Custom properties for the .timeline element: --tl-axis, --tl-tag-arrow, … */
export const geometryStyle = Object.fromEntries(
  Object.entries(GEOMETRY).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`]),
) as CSSProperties

/** Where bottom lanes start: below the chip rows in use (at least one), plus a gap. */
export const lanesTop = (rows: number): number => GEOMETRY.chipTop + Math.max(1, rows) * GEOMETRY.chipRow + 14
