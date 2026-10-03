// Where things sit across the timeline, in px from its top edge. The Timeline writes
// these onto its element as CSS custom properties (--tl-<name>), so the stylesheet
// and the lane math in JS share one source. Colors and glows stay in theme.css.
import type { CSSProperties } from 'react'

export const GEOMETRY = {
  laneA: 26,
  laneB: 70,
  axis: 146,
  label: 180,
  time: 214,
  actions: 260,
  lanes: 312,
} as const

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** Custom properties for the .timeline element: --tl-axis, --tl-lane-a, … */
export const geometryStyle = Object.fromEntries(
  Object.entries(GEOMETRY).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`]),
) as CSSProperties

/** Vertical center of the first bottom lane's band starts here. */
export const lanesTop = (): number => GEOMETRY.lanes
