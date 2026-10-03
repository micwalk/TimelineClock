// Tick generation for the timeline axis. Pure: given a visible range and scale,
// returns the ticks to show with their size and label opacity.
import { DAY, HOUR, MINUTE, SECOND, lerp, smoothstep } from './time.ts'
import type { Orientation } from './layoutMode.ts'

export type CalendarUnit = 'day' | 'week' | 'month' | 'year'

export interface TickUnit {
  ms: number
  calendar?: CalendarUnit
}

export type TickTier = 0 | 1 | 2 // 0 = minor, 1 = labeled, 2 = major

export interface TickStyle {
  halfHeight: number
  labelAlpha: number
  fontSizePx: number
  bold: boolean
}

export interface Tick {
  t: number
  tier: TickTier
  style: TickStyle
  label: string | null
}

export const TICK_UNITS: TickUnit[] = [
  { ms: 250 },
  { ms: SECOND },
  { ms: 5 * SECOND },
  { ms: 15 * SECOND },
  { ms: MINUTE },
  { ms: 5 * MINUTE },
  { ms: 15 * MINUTE },
  { ms: 30 * MINUTE },
  { ms: HOUR },
  { ms: 6 * HOUR },
  { ms: DAY, calendar: 'day' },
  { ms: 7 * DAY, calendar: 'week' },
  { ms: 30 * DAY, calendar: 'month' },
  { ms: 365 * DAY, calendar: 'year' },
]

const HORIZONTAL_LABEL_SPACING_PX = 100
const VERTICAL_LABEL_SPACING_PX = 48

/**
 * Least spacing between labeled ticks. Horizontal labels sit side by side and need
 * ~100px; vertical labels stack down the screen and fit at ~48px. Every caller that
 * picks tiers (drawing, tick snapping, the seconds rule) must pass the same value.
 */
export function labelSpacingPx(orientation: Orientation): number {
  return orientation === 'vertical' ? VERTICAL_LABEL_SPACING_PX : HORIZONTAL_LABEL_SPACING_PX
}

/** Picks three consecutive units: the first one spaced at least `minLabelSpacingPx` is the middle tier. */
export function pickTickTiers(pxPerMs: number, minLabelSpacingPx = HORIZONTAL_LABEL_SPACING_PX): [TickUnit, TickUnit, TickUnit] {
  let mid = TICK_UNITS.length - 1
  for (let i = 0; i < TICK_UNITS.length; i++) {
    if (TICK_UNITS[i].ms * pxPerMs >= minLabelSpacingPx) { mid = i; break }
  }
  const lo = Math.max(0, mid - 1)
  const hi = Math.min(TICK_UNITS.length - 1, mid + 1)
  return [TICK_UNITS[lo], TICK_UNITS[mid], TICK_UNITS[hi]]
}

/**
 * Tick size and label fade as a smooth function of on-screen spacing. The label
 * thresholds scale with `minLabelSpacingPx` (as given to pickTickTiers), so labels are
 * fully visible once the spacing reaches it, in either orientation.
 */
export function computeTickStyle(tier: TickTier, spacingPx: number, minLabelSpacingPx = HORIZONTAL_LABEL_SPACING_PX): TickStyle {
  const k = minLabelSpacingPx / HORIZONTAL_LABEL_SPACING_PX
  if (tier === 0) {
    return { halfHeight: lerp(2, 6, smoothstep(8, 40, spacingPx)), labelAlpha: 0, fontSizePx: 10, bold: false }
  }
  if (tier === 1) {
    return {
      halfHeight: lerp(5, 10, smoothstep(40, 160, spacingPx)),
      labelAlpha: smoothstep(90 * k, 140 * k, spacingPx),
      fontSizePx: lerp(10, 12, smoothstep(100 * k, 180 * k, spacingPx)),
      bold: false,
    }
  }
  return {
    halfHeight: lerp(10, 20, smoothstep(120, 260, spacingPx)),
    labelAlpha: smoothstep(160 * k, 220 * k, spacingPx),
    fontSizePx: lerp(12, 14, smoothstep(160 * k, 240 * k, spacingPx)),
    bold: true,
  }
}

export function firstCalendarBoundaryAtOrBefore(ts: number, unit: CalendarUnit): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  if (unit === 'week') d.setDate(d.getDate() - d.getDay()) // Sunday
  else if (unit === 'month') d.setDate(1)
  else if (unit === 'year') d.setMonth(0, 1)
  return d.getTime()
}

export function addCalendar(ts: number, unit: CalendarUnit, amount: number): number {
  const d = new Date(ts)
  if (unit === 'day') d.setDate(d.getDate() + amount)
  else if (unit === 'week') d.setDate(d.getDate() + 7 * amount)
  else if (unit === 'month') d.setMonth(d.getMonth() + amount, 1)
  else d.setFullYear(d.getFullYear() + amount, 0, 1)
  return d.getTime()
}

/** Local-time aligned boundary for sub-day units (6h aligns to 00/06/12/18 local). */
export function firstDurationBoundaryAtOrBefore(ts: number, unitMs: number): number {
  if (unitMs === 6 * HOUR) {
    const d = new Date(ts)
    d.setMinutes(0, 0, 0)
    d.setHours(Math.floor(d.getHours() / 6) * 6)
    return d.getTime()
  }
  return Math.floor(ts / unitMs) * unitMs
}

function firstUnitTimeAtOrBefore(ts: number, unit: TickUnit): number {
  return unit.calendar ? firstCalendarBoundaryAtOrBefore(ts, unit.calendar) : firstDurationBoundaryAtOrBefore(ts, unit.ms)
}

/** The next tick of `unit` after `t`, which must be on one of its boundaries. */
function nextUnitTime(t: number, unit: TickUnit): number {
  if (unit.calendar) return addCalendar(t, unit.calendar, 1)
  if (unit.ms === 6 * HOUR) {
    // Step by wall-clock hours so DST shifts keep the 00/06/12/18 alignment.
    const d = new Date(t)
    d.setHours(d.getHours() + 6)
    return d.getTime()
  }
  return t + unit.ms
}

function* unitTimes(unit: TickUnit, start: number, end: number, maxCount: number): Generator<number> {
  let count = 0
  for (let t = firstUnitTimeAtOrBefore(start, unit); t <= end && count < maxCount; t = nextUnitTime(t, unit), count++) {
    yield t
  }
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })
const pad2 = (n: number) => n.toString().padStart(2, '0')

export function formatTickLabel(t: number, unit: TickUnit): string {
  const d = new Date(t)
  if (unit.ms < SECOND) return `${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad2(Math.floor(d.getMilliseconds() / 10))}`
  if (unit.ms < MINUTE) return `${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  if (unit.ms < HOUR) {
    const h = d.getHours()
    return `${pad2(h === 0 ? 12 : h > 12 ? h - 12 : h)}:${pad2(d.getMinutes())}`
  }
  if (unit.ms < DAY) {
    const h = d.getHours()
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}`
  }
  if (unit.calendar === 'day' || unit.calendar === 'week') return `${monthFmt.format(d)} ${d.getDate()}`
  if (unit.calendar === 'month') return `${monthFmt.format(d)} ${d.getFullYear()}`
  return `${d.getFullYear()}`
}

/**
 * All ticks in [start, end]. When tiers coincide on the same timestamp they merge
 * into one tick: the tallest mark wins, and the label comes from whichever tier
 * currently shows its label most strongly. Output is sorted by time.
 */
export function generateTicks(start: number, end: number, pxPerMs: number, maxPerTier = 600, minLabelSpacingPx = HORIZONTAL_LABEL_SPACING_PX): Tick[] {
  const tiers = pickTickTiers(pxPerMs, minLabelSpacingPx)
  const byTime = new Map<number, Tick>()
  tiers.forEach((unit, i) => {
    const tier = i as TickTier
    const style = computeTickStyle(tier, unit.ms * pxPerMs, minLabelSpacingPx)
    for (const t of unitTimes(unit, start, end, maxPerTier)) {
      const label = style.labelAlpha > 0 ? formatTickLabel(t, unit) : null
      const prev = byTime.get(t)
      if (!prev) {
        byTime.set(t, { t, tier, style, label })
        continue
      }
      const labelFromNew = style.labelAlpha > prev.style.labelAlpha
      byTime.set(t, {
        t,
        tier: Math.max(prev.tier, tier) as TickTier,
        style: {
          halfHeight: Math.max(prev.style.halfHeight, style.halfHeight),
          labelAlpha: labelFromNew ? style.labelAlpha : prev.style.labelAlpha,
          fontSizePx: labelFromNew ? style.fontSizePx : prev.style.fontSizePx,
          bold: labelFromNew ? style.bold : prev.style.bold,
        },
        label: labelFromNew ? label : prev.label,
      })
    }
  })
  return [...byTime.values()].sort((a, b) => a.t - b.t)
}

/**
 * The tick of the finest tier drawn at this zoom that is nearest to `t` (ties go
 * earlier). Uses the same boundaries as generateTicks, so it lands on a drawn tick.
 */
export function nearestFinestTick(t: number, pxPerMs: number, minLabelSpacingPx = HORIZONTAL_LABEL_SPACING_PX): number {
  const unit = pickTickTiers(pxPerMs, minLabelSpacingPx)[0]
  const before = firstUnitTimeAtOrBefore(t, unit)
  const after = nextUnitTime(before, unit)
  return t - before <= after - t ? before : after
}
