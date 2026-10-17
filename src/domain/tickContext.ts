// The timeline's context header (#22): what the tick labels leave out, so a zoomed-in view
// never reads ambiguously. Minute and second ticks ("09:30", "30:15") drop the AM/PM, the
// hour and the day; hour ticks ("8PM") drop the day; day ticks ("Oct 15") the year. The header
// labels each boundary of the missing unit, and the current one sticks at the timeline's
// earlier edge until the next pushes it off, like a calendar's month headers.
import { DAY, HOUR, MINUTE } from './time.ts'
import { addCalendar, firstCalendarBoundaryAtOrBefore, firstDurationBoundaryAtOrBefore, pickTickTiers } from './ticks.ts'

export type ContextUnit = 'hour' | 'day' | 'month'

/**
 * The unit whose boundaries the header labels at this zoom: what the tick labels don't say.
 * Hours join the header once the labeled ticks are 15 minutes or finer; with half hours
 * labeled, the hours among them read "8PM" (generateTicks takes the coarser tier's text), so
 * the day is all that is missing.
 */
export function contextUnitFor(pxPerMs: number, minLabelSpacingPx: number): ContextUnit | null {
  const labeled = pickTickTiers(pxPerMs, minLabelSpacingPx)[1]
  if (labeled.ms < 30 * MINUTE) return 'hour'
  if (labeled.ms < DAY) return 'day'
  if (labeled.calendar === 'day' || labeled.calendar === 'week') return 'month'
  return null
}

const nextBoundary = (t: number, unit: ContextUnit) =>
  unit === 'hour' ? t + HOUR : addCalendar(t, unit === 'day' ? 'day' : 'month', 1)

const boundaryAtOrBefore = (t: number, unit: ContextUnit) =>
  unit === 'hour' ? firstDurationBoundaryAtOrBefore(t, HOUR) : firstCalendarBoundaryAtOrBefore(t, unit === 'day' ? 'day' : 'month')

/** The boundaries from the one at or before `start` (the label that sticks) through `end`. */
export function contextBoundaries(start: number, end: number, unit: ContextUnit, max = 200): number[] {
  const out: number[] = []
  for (let t = boundaryAtOrBefore(start, unit); t <= end && out.length < max; t = nextBoundary(t, unit)) out.push(t)
  return out
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' })

/** "Thu, Oct 15 · 8 PM", "Thu, Oct 15" or "October 2026"; a day in another year than `now` says so. */
export function formatContext(t: number, unit: ContextUnit, now: number): string {
  if (unit === 'month') return monthFmt.format(t)
  const year = new Date(t).getFullYear() !== new Date(now).getFullYear() ? `, ${yearFmt.format(t)}` : ''
  const day = dayFmt.format(t) + year
  return unit === 'day' ? day : `${day} · ${hourFmt.format(t)}`
}

/**
 * Sticky placement along the time direction. `starts` are the labels' boundaries and `lens`
 * their lengths, in px forward from the earlier edge; `edge` is where the current label sticks.
 * A label sits at its boundary, or at the edge once its boundary has passed it, and is pushed
 * back by the next label's boundary (`gap` before it), so it slides off instead of overlapping.
 * Returns each label's leading position (forward px); one ending before 0 is off screen.
 */
export function stickyPlace(starts: readonly number[], lens: readonly number[], edge: number, gap: number): number[] {
  return starts.map((s, i) => {
    const at = Math.max(s, edge)
    return i + 1 < starts.length ? Math.min(at, starts[i + 1] - gap - lens[i]) : at
  })
}
