// Where things sit across the timeline, in px from its top edge. The Timeline writes
// these onto its element as CSS custom properties (--tl-<name>), so the stylesheet
// and the lane math in JS share one source. Colors and glows stay in theme.css.
import type { CSSProperties } from 'react'

export const GEOMETRY = {
  /** The axis line. */
  axis: 150,
  /** Arrowhead height; live tag boxes sit just above it. */
  tagArrow: 14,
  /** Distance between the two live tag slots. */
  tagSlot: 60,
  /** Main-axis distance under which the Now and Cursor tags would overlap. */
  tagClearance: 130,
  /** Top of the first saved chip row, and the row pitch. */
  chipTop: 166,
  chipRow: 34,
} as const

/** Live lanes (spans with an endpoint at Now or the cursor), horizontal: a band above the live tags. */
export const LIVE_LANES = {
  /** y of the first lane's center. */
  top: 16,
  /** Distance between lane centers. */
  pitch: 32,
  /** Room under the last lane before the live tags may start. */
  gap: 8,
} as const

/** Height of the live-lane band, which pushes the axis and everything under it down. 0 without live lanes. */
export const liveBandHeight = (liveCount: number): number => (liveCount > 0 ? LIVE_LANES.gap + liveCount * LIVE_LANES.pitch : 0)

/** y of live lane `index`'s center (horizontal). */
export const liveLaneTop = (index: number): number => LIVE_LANES.top + index * LIVE_LANES.pitch

/** Vertical timeline: the axis is a vertical line; x offsets from the left edge. */
export const GEOMETRY_VERTICAL = {
  /** x of the axis. */
  axis: 140,
  tagArrow: 14,
  /** x where chip column 0 starts. */
  chipStart: 152,
  /** The first saved span lane's bar, in from the right edge (room for its endpoint arrows), and the spacing inward. */
  laneEdge: 18,
  laneGap: 18,
  /** Live lanes: x of the first bar from the left edge, and the spacing inward. */
  liveLaneStart: 8,
  liveLaneGap: 12,
  /** How far the Cursor tag moves along the time axis when it collides with Now. */
  tagSlotV: 76,
} as const

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** Custom properties for the .timeline element: --tl-axis, --tl-tag-arrow, … */
export const geometryStyle = Object.fromEntries(
  Object.entries(GEOMETRY).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`]),
) as CSSProperties

const toStyle = (g: Record<string, number>) =>
  Object.fromEntries(Object.entries(g).map(([k, v]) => [`--tl-${kebab(k)}`, `${v}px`])) as CSSProperties

const verticalStyle = toStyle(GEOMETRY_VERTICAL)

/** Widest a live tag box may be: the room between the left edge and its arrowhead. */
export const verticalTagMaxWidth = (): number => GEOMETRY_VERTICAL.axis - GEOMETRY_VERTICAL.tagArrow - 4

/** Room for saved chips in vertical: what is right of chipStart, less the lane bars. Lane chips are not reserved: they draw over the saved chips. */
export const verticalCrossBudget = (crossSize: number, laneCount: number): number =>
  crossSize - GEOMETRY_VERTICAL.chipStart - 8 - (laneCount > 0 ? LANES_INSET + laneCount * GEOMETRY_VERTICAL.laneGap : 0)

/** How much further in the lane bars start than the 12px the chip budget always kept. */
const LANES_INSET = GEOMETRY_VERTICAL.laneEdge - 12

/** x of live lane `index`'s bar (vertical), from the left edge. */
export const verticalLiveLaneX = (index: number): number => GEOMETRY_VERTICAL.liveLaneStart + index * GEOMETRY_VERTICAL.liveLaneGap

/** Horizontal custom properties for a live-lane count: the axis, tags and chips sit below the band. Cached per count. */
const horizontalStyles = new Map<number, CSSProperties>([[0, geometryStyle]])
function horizontalStyle(liveCount: number): CSSProperties {
  let style = horizontalStyles.get(liveCount)
  if (!style) {
    const band = liveBandHeight(liveCount)
    style = toStyle({ ...GEOMETRY, axis: GEOMETRY.axis + band, chipTop: GEOMETRY.chipTop + band, liveBand: band })
    horizontalStyles.set(liveCount, style)
  }
  return style
}

/** The custom properties for the timeline's current orientation. `liveCount`: live lanes on screen (horizontal only: they form a band above the tags). */
export const geometryStyleFor = (orientation: 'horizontal' | 'vertical', liveCount = 0): CSSProperties =>
  orientation === 'vertical' ? verticalStyle : horizontalStyle(liveCount)

/** Where saved lanes start: below the chip rows in use (at least one), plus a gap, and below the live-lane band. */
export const lanesTop = (rows: number, liveCount = 0): number =>
  liveBandHeight(liveCount) + GEOMETRY.chipTop + Math.max(1, rows) * GEOMETRY.chipRow + 14
