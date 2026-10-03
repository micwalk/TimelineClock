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

/** Vertical timeline: the axis is a vertical line; x offsets from the left edge. */
export const GEOMETRY_VERTICAL = {
  /** x of the axis. */
  axis: 120,
  tagArrow: 14,
  /** x where chip column 0 starts. */
  chipStart: 132,
  /** Spacing of span lanes, from the right edge inward. */
  laneGap: 18,
  /** How far the Cursor tag moves along the time axis when it collides with Now. */
  tagSlotV: 64,
} as const

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** Custom properties for the .timeline element: --tl-axis, --tl-tag-arrow, … */
export const geometryStyle = Object.fromEntries(
  Object.entries(GEOMETRY).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`]),
) as CSSProperties

/** Width kept free for span-lane chips, which sit on the inner side of the bars. */
const LANE_CHIP_ALLOWANCE = 64

const toStyle = (g: Record<string, number>) =>
  Object.fromEntries(Object.entries(g).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`])) as CSSProperties

const verticalStyle = toStyle(GEOMETRY_VERTICAL)

/** Widest a live tag box may be: the room between the left edge and its arrowhead. */
export const verticalTagMaxWidth = (): number => GEOMETRY_VERTICAL.axis - GEOMETRY_VERTICAL.tagArrow - 4

/** Room for saved chips in vertical: what is right of chipStart, less lane bars and the lane chips on their inner side. */
export const verticalCrossBudget = (crossSize: number, laneCount: number): number =>
  crossSize - GEOMETRY_VERTICAL.chipStart - 8 - (laneCount > 0 ? laneCount * GEOMETRY_VERTICAL.laneGap + LANE_CHIP_ALLOWANCE : 0)

/** The custom properties for the timeline's current orientation. */
export const geometryStyleFor = (orientation: 'horizontal' | 'vertical'): CSSProperties =>
  orientation === 'vertical' ? verticalStyle : geometryStyle

/** Where bottom lanes start: below the chip rows in use (at least one), plus a gap. */
export const lanesTop = (rows: number): number => GEOMETRY.chipTop + Math.max(1, rows) * GEOMETRY.chipRow + 14
